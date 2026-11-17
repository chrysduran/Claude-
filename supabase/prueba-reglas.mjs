// Prueba de las reglas de acceso contra un Supabase local (npx supabase start).
// Uso: SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/prueba-reglas.mjs
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const sufijo = Date.now().toString(36);
let fallas = 0;

async function usuario(nombre) {
  const email = `${nombre}-${sufijo}@prueba.local`;
  const { error } = await admin.auth.admin.createUser({ email, password: "clave-de-prueba-123", email_confirm: true });
  if (error) throw error;
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: e2 } = await c.auth.signInWithPassword({ email, password: "clave-de-prueba-123" });
  if (e2) throw e2;
  return c;
}

async function caso(nombre, fn) {
  try {
    await fn();
    console.log("✓", nombre);
  } catch (e) {
    fallas++;
    console.log("✗", nombre, "→", e.message);
  }
}

const a = await usuario("admin");
const b = await usuario("supervisor");
const l = await usuario("lectura");
const x = await usuario("externo");

let empresa;
await caso("un usuario crea su empresa y queda como admin", async () => {
  const { data, error } = await a.rpc("crear_empresa", { p_nombre: "Constructora Prueba" });
  assert.ifError(error);
  empresa = data;
  const { data: m } = await a.from("miembros").select("rol").eq("empresa_id", empresa);
  assert.deepEqual(m, [{ rol: "admin" }]);
});

await caso("el admin crea un proyecto y captura", async () => {
  const p = await a.from("proyectos").insert({ id: `p-${sufijo}`, empresa_id: empresa, nombre: "Torre", meta: 85, contratistas: ["A"], zonas: ["N1"], causas: [] });
  assert.ifError(p.error);
  const c = await a.from("conteos").insert({ id: `c-${sufijo}`, proyecto_id: `p-${sufijo}`, fecha: "2026-11-16", contratista: "A", planeadas: 3 });
  assert.ifError(c.error);
});

await caso("invitaciones: supervisor y lectura se unen con código", async () => {
  const s = await a.rpc("crear_invitacion", { p_empresa: empresa, p_rol: "supervisor" });
  assert.ifError(s.error);
  assert.match(s.data, /^[A-Z0-9]{8}$/);
  assert.ifError((await b.rpc("unirse", { p_codigo: s.data.toLowerCase() })).error);
  const r = await a.rpc("crear_invitacion", { p_empresa: empresa, p_rol: "lectura" });
  assert.ifError((await l.rpc("unirse", { p_codigo: r.data })).error);
  const otra = await x.rpc("unirse", { p_codigo: s.data });
  assert.ok(otra.error, "un código no se puede usar dos veces");
});

await caso("solo el admin puede invitar", async () => {
  const r = await b.rpc("crear_invitacion", { p_empresa: empresa, p_rol: "admin" });
  assert.ok(r.error);
});

await caso("el supervisor captura pero no cambia el proyecto", async () => {
  const i = await b.from("incumplimientos").insert({ id: `i-${sufijo}`, proyecto_id: `p-${sufijo}`, fecha: "2026-11-16", contratista: "A", actividad: "Piso", zona: "N1", causa: "MO" });
  assert.ifError(i.error);
  const u = await b.from("proyectos").update({ nombre: "Otro" }).eq("id", `p-${sufijo}`).select();
  assert.deepEqual(u.data, [], "el supervisor no debe poder editar el proyecto");
});

await caso("solo lectura: ve pero no escribe", async () => {
  const v = await l.from("conteos").select("id").eq("proyecto_id", `p-${sufijo}`);
  assert.equal(v.data.length, 1);
  const w = await l.from("conteos").insert({ id: `c2-${sufijo}`, proyecto_id: `p-${sufijo}`, fecha: "2026-11-17", contratista: "A", planeadas: 1 });
  assert.ok(w.error);
});

await caso("alguien de otra empresa no ve nada", async () => {
  for (const t of ["empresas", "miembros", "proyectos", "conteos", "incumplimientos"]) {
    const r = await x.from(t).select("*");
    assert.equal(r.data.length, 0, `ve filas de ${t}`);
  }
  const w = await x.from("conteos").insert({ id: `c3-${sufijo}`, proyecto_id: `p-${sufijo}`, fecha: "2026-11-17", contratista: "A", planeadas: 1 });
  assert.ok(w.error);
});

await caso("fotos: el supervisor sube y lee; externos no", async () => {
  const ruta = `${empresa}/foto-${sufijo}.jpg`;
  const up = await b.storage.from("fotos").upload(ruta, new Blob(["jpg"], { type: "image/jpeg" }));
  assert.ifError(up.error);
  assert.ok((await a.storage.from("fotos").download(ruta)).data);
  assert.ok(!(await x.storage.from("fotos").download(ruta)).data);
  assert.ok((await x.storage.from("fotos").upload(`${empresa}/intruso.jpg`, new Blob(["x"]))).error);
});

await caso("cambios en vivo: lo que captura uno le llega al otro", async () => {
  const recibido = new Promise((ok, mal) => {
    const t = setTimeout(() => mal(new Error("no llegó el cambio en 10 s")), 10000);
    b.channel("prueba").on("postgres_changes", { event: "INSERT", schema: "public", table: "conteos" }, (c) => {
      if (c.new.id === `c4-${sufijo}`) { clearTimeout(t); ok(); }
    }).subscribe(async (estado) => {
      if (estado === "SUBSCRIBED") {
        await new Promise((r) => setTimeout(r, 500));
        await a.from("conteos").insert({ id: `c4-${sufijo}`, proyecto_id: `p-${sufijo}`, fecha: "2026-11-18", contratista: "A", planeadas: 2 });
      }
    });
  });
  await recibido;
});

await caso("el admin borra el proyecto y se borra todo lo suyo", async () => {
  assert.ifError((await a.from("proyectos").delete().eq("id", `p-${sufijo}`)).error);
  const r = await admin.from("conteos").select("id").eq("proyecto_id", `p-${sufijo}`);
  assert.equal(r.data.length, 0);
});

console.log(fallas ? `\n${fallas} prueba(s) fallaron` : "\nTodas las reglas se comportan como se espera");
process.exit(fallas ? 1 : 0);
