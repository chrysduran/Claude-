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
  assert.equal(otra.data, null, "un código no se puede usar dos veces");
  assert.doesNotMatch(s.data, /[01OIL]/, "el código no usa caracteres que se confunden");
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

await caso("un administrador solo cambia el rol, no el correo ni el dueño de la fila", async () => {
  const yo = (await b.auth.getUser()).data.user.id;
  const r = await a.from("miembros").update({ email: "falso@x.com" }).eq("empresa_id", empresa).eq("usuario_id", yo);
  assert.ok(r.error, "no debe poder cambiar el correo");
  assert.ifError((await a.from("miembros").update({ rol: "lectura" }).eq("empresa_id", empresa).eq("usuario_id", yo)).error);
  assert.ifError((await a.from("miembros").update({ rol: "supervisor" }).eq("empresa_id", empresa).eq("usuario_id", yo)).error);
});

await caso("la empresa nunca se queda sin administrador", async () => {
  const yo = (await a.auth.getUser()).data.user.id;
  assert.ok((await a.from("miembros").update({ rol: "lectura" }).eq("empresa_id", empresa).eq("usuario_id", yo)).error, "no debe poder degradarse");
  assert.ok((await a.from("miembros").delete().eq("empresa_id", empresa).eq("usuario_id", yo)).error, "no debe poder salirse");
});

await caso("un miembro que usa otro código conserva su rol", async () => {
  const r = await a.rpc("crear_invitacion", { p_empresa: empresa, p_rol: "lectura" });
  assert.ifError((await a.rpc("unirse", { p_codigo: r.data })).error);
  const { data } = await a.from("miembros").select("rol").eq("empresa_id", empresa).eq("usuario_id", (await a.auth.getUser()).data.user.id);
  assert.deepEqual(data, [{ rol: "admin" }]);
});

await caso("límites: textos enormes, fechas mal formadas y fotos que no son imagen se rechazan", async () => {
  const pid = `q-${sufijo}`;
  assert.ifError((await a.from("proyectos").insert({ id: pid, empresa_id: empresa, nombre: "Límites" })).error);
  const base = { proyecto_id: pid, fecha: "2026-11-16", contratista: "A", actividad: "x", causa: "MO" };
  assert.ok((await a.from("incumplimientos").insert({ ...base, id: `g1-${sufijo}`, notas: "x".repeat(5000) })).error, "notas enormes");
  assert.ok((await a.from("incumplimientos").insert({ ...base, id: `g2-${sufijo}`, fecha: "ayer" })).error, "fecha inválida");
  assert.ok((await a.from("conteos").insert({ id: `g3-${sufijo}`, proyecto_id: pid, fecha: "2026-11-16", contratista: "A", planeadas: 100000 })).error, "planeadas fuera de rango");
  assert.ok((await a.from("proyectos").update({ contratistas: Array(3000).fill("contratista largo") }).eq("id", pid)).error, "catálogo enorme");
  assert.ok((await a.storage.from("fotos").upload(`${empresa}/malo-${sufijo}.html`, new Blob(["<script>"], { type: "text/html" }))).error, "archivo que no es imagen");
});

await caso("bitácora: la base anota quién cambió qué; solo el admin la lee y nadie la altera", async () => {
  const pid = `q-${sufijo}`;
  assert.ifError((await b.from("incumplimientos").insert({ id: `h-${sufijo}`, proyecto_id: pid, fecha: "2026-11-16", contratista: "A", actividad: "Muro nivel 3", causa: "MAT" })).error);
  const { data } = await a.from("bitacora").select("tabla, operacion, email, resumen").eq("fila_id", `h-${sufijo}`);
  assert.equal(data.length, 1);
  assert.equal(data[0].operacion, "alta");
  assert.equal(data[0].resumen, "Muro nivel 3");
  assert.match(data[0].email, /^supervisor-/);
  assert.equal((await b.from("bitacora").select("id")).data.length, 0, "el supervisor no la lee");
  assert.equal((await x.from("bitacora").select("id")).data.length, 0, "un externo no la lee");
  assert.ok((await a.from("bitacora").delete().eq("fila_id", `h-${sufijo}`)).error, "ni el admin la borra");
  assert.ok((await a.from("bitacora").insert({ empresa_id: empresa, tabla: "x", fila_id: "x", operacion: "alta" })).error, "ni la falsifica");
});

await caso("adivinar códigos: tras 8 intentos fallidos la cuenta queda en espera", async () => {
  for (let i = 0; i < 8; i++) assert.equal((await x.rpc("unirse", { p_codigo: `MALO${i}XYZ` })).data, null);
  const r = await x.rpc("unirse", { p_codigo: "OTROMALO" });
  assert.match(r.error?.message ?? "", /Demasiados intentos/);
});

await caso("sin sesión no se puede leer nada ni llamar funciones", async () => {
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  for (const t of ["empresas", "miembros", "invitaciones", "proyectos", "conteos", "bitacora", "intentos_codigo"]) {
    const r = await anon.from(t).select("*");
    assert.ok(r.error || r.data.length === 0, `anónimo ve ${t}`);
  }
  assert.ok((await anon.rpc("es_miembro", { p_empresa: empresa })).error, "es_miembro");
  assert.ok((await anon.rpc("empresa_de", { p_proyecto: `q-${sufijo}` })).error, "empresa_de");
  assert.ok((await anon.rpc("unirse", { p_codigo: "ABCDEFGH" })).error, "unirse");
});

await caso("borrar la empresa elimina todo; solo el admin puede", async () => {
  const d = await b.from("empresas").delete().eq("id", empresa).select();
  assert.deepEqual(d.data, [], "el supervisor no la borra");
  assert.ifError((await a.from("empresas").delete().eq("id", empresa)).error);
  for (const t of ["miembros", "proyectos", "incumplimientos", "bitacora", "invitaciones"]) {
    const col = t === "incumplimientos" ? ["proyecto_id", `q-${sufijo}`] : t === "proyectos" ? ["empresa_id", empresa] : ["empresa_id", empresa];
    assert.equal((await admin.from(t).select("*").eq(...col)).data.length, 0, `quedan filas en ${t}`);
  }
});

console.log(fallas ? `\n${fallas} prueba(s) fallaron` : "\nTodas las reglas se comportan como se espera");
process.exit(fallas ? 1 : 0);
