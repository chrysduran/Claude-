import { createClient, type RealtimeChannel, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { BaseDatos } from "../types";
import { aplicarRemoto, borrarFotosDeNube, CLAVE_LOCAL, estadoActual, leerClave, soloLectura, usarAlmacen, usarFotosRemotas, vacia } from "./store";
import { COLECCIONES, coleccionDe, compactar, deFila, diferencias, esErrorDefinitivo, primerLote, TABLAS, type Operacion } from "./sync";

/**
 * Modo nube con Supabase. Se activa si la app se publica con las variables
 * VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY; sin ellas la app funciona solo en el teléfono.
 */
const URL_SB = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const LLAVE_SB = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const nubeActiva = !!(URL_SB && LLAVE_SB);
export const sb: SupabaseClient | null = nubeActiva ? createClient(URL_SB!, LLAVE_SB!) : null;

export type Rol = "admin" | "supervisor" | "lectura";
export interface Membresia {
  empresaId: string;
  nombre: string;
  rol: Rol;
}

export async function sesionActual(): Promise<Session | null> {
  return sb ? (await sb.auth.getSession()).data.session : null;
}

export async function membresias(): Promise<Membresia[]> {
  const { data: u } = await sb!.auth.getUser();
  const { data, error } = await sb!.from("miembros").select("empresa_id, rol, empresas(nombre)").eq("usuario_id", u.user!.id);
  if (error) throw error;
  return (data ?? []).map((m) => ({
    empresaId: m.empresa_id as string,
    rol: m.rol as Rol,
    nombre: ((m.empresas as unknown as { nombre: string } | null)?.nombre) ?? "Empresa",
  }));
}

export async function crearEmpresa(nombre: string): Promise<string> {
  const { data, error } = await sb!.rpc("crear_empresa", { p_nombre: nombre });
  if (error) throw error;
  return data as string;
}

export async function unirse(codigo: string): Promise<string> {
  const { data, error } = await sb!.rpc("unirse", { p_codigo: codigo });
  if (error) throw error;
  if (!data) throw new Error("El código no existe, ya se usó o venció.");
  return data as string;
}

export async function crearInvitacion(empresaId: string, rol: Rol): Promise<string> {
  const { data, error } = await sb!.rpc("crear_invitacion", { p_empresa: empresaId, p_rol: rol });
  if (error) throw error;
  return data as string;
}

export interface Miembro {
  usuarioId: string;
  email: string;
  rol: Rol;
}

export async function miembros(empresaId: string): Promise<Miembro[]> {
  const { data, error } = await sb!.from("miembros").select("usuario_id, email, rol").eq("empresa_id", empresaId).order("creado");
  if (error) throw error;
  return (data ?? []).map((m) => ({ usuarioId: m.usuario_id, email: m.email, rol: m.rol }));
}

export async function cambiarRol(empresaId: string, usuarioId: string, rol: Rol) {
  const { error } = await sb!.from("miembros").update({ rol }).eq("empresa_id", empresaId).eq("usuario_id", usuarioId);
  if (error) throw error;
}

export async function quitarMiembro(empresaId: string, usuarioId: string) {
  const { error } = await sb!.from("miembros").delete().eq("empresa_id", empresaId).eq("usuario_id", usuarioId);
  if (error) throw error;
}

export interface Movimiento {
  id: number;
  tabla: string;
  operacion: "alta" | "cambio" | "baja";
  email: string;
  resumen: string;
  cuando: string;
}

/** Últimos movimientos de la empresa (solo administradores). */
export async function bitacora(empresaId: string, limite = 40): Promise<Movimiento[]> {
  const { data, error } = await sb!.from("bitacora").select("id, tabla, operacion, email, resumen, cuando").eq("empresa_id", empresaId).order("id", { ascending: false }).limit(limite);
  if (error) throw error;
  return (data ?? []) as Movimiento[];
}

/** Borra la empresa con todos sus proyectos, registros, miembros y fotos. No se puede deshacer. */
export async function borrarEmpresa(empresaId: string) {
  const fotos = sb!.storage.from("fotos");
  for (;;) {
    const { data, error } = await fotos.list(empresaId, { limit: 100 });
    if (error) throw error;
    if (!data?.length) break;
    const { error: e2 } = await fotos.remove(data.map((f) => `${empresaId}/${f.name}`));
    if (e2) throw e2;
  }
  const { data, error } = await sb!.from("empresas").delete().eq("id", empresaId).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Solo un administrador puede borrar la empresa.");
  limpiarTelefono([]);
}

/**
 * Quita de este teléfono las copias de empresas a las que el usuario ya no debe tener acceso
 * (al cerrar sesión, al salir de una empresa o al borrarla). `conservar` son las empresas que siguen vigentes.
 */
export function limpiarTelefono(conservar: string[]) {
  try {
    const sobran: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      const m = k.match(/^pulso-obra:(?:nube|pendientes):(.+)$/);
      if (m && !conservar.includes(m[1])) sobran.push(k);
    }
    sobran.forEach((k) => localStorage.removeItem(k));
  } catch { /* sin almacenamiento */ }
  if (!conservar.length) borrarFotosDeNube();
}

/* ---------- Carga completa ---------- */
async function todas(tabla: string, filtro: (q: any) => any): Promise<Record<string, unknown>[]> {
  const res: Record<string, unknown>[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await filtro(sb!.from(tabla).select("*")).range(desde, desde + 999);
    if (error) throw error;
    res.push(...(data ?? []));
    if (!data || data.length < 1000) return res;
  }
}

export async function cargarEmpresa(empresaId: string): Promise<BaseDatos> {
  const db = vacia();
  db.proyectos = (await todas("proyectos", (q) => q.eq("empresa_id", empresaId))).map((f) => deFila(f));
  const ids = db.proyectos.map((p) => p.id);
  if (!ids.length) return db;
  for (const c of COLECCIONES.filter((c) => c !== "proyectos")) {
    (db[c] as unknown[]) = (await todas(TABLAS[c], (q) => q.in("proyecto_id", ids))).map((f) => deFila(f));
  }
  return db;
}

/* ---------- Envío de cambios con cola (funciona sin conexión) ---------- */
let empresaActual = "";
let avisar: (m: string) => void = () => {};
let alCambiarPendientes: (n: number) => void = () => {};
const clavePendientes = () => `pulso-obra:pendientes:${empresaActual}`;

function leerPendientes(): Operacion[] {
  try { return JSON.parse(localStorage.getItem(clavePendientes()) ?? "[]"); } catch { return []; }
}
function escribirPendientes(ops: Operacion[]) {
  try { localStorage.setItem(clavePendientes(), JSON.stringify(ops)); } catch { /* sin espacio */ }
  alCambiarPendientes(ops.length);
}

const firma = (o: Operacion) => JSON.stringify(o);

/** Manda un grupo de operaciones de la misma tabla y tipo en una sola petición. */
async function mandar(lote: Operacion[]) {
  const q = sb!.from(lote[0].tabla);
  const { error, status } = lote[0].tipo === "upsert"
    ? await q.upsert(lote.map((o) => o.fila!), { defaultToNull: false })
    : await q.delete().in("id", lote.map((o) => o.id));
  return error ? { ...error, status } : null;
}

/** Quita de la cola solo lo que se mandó; lo que se capturó mientras tanto se queda para la siguiente vuelta. */
function quitarDeCola(enviadas: Operacion[]) {
  const s = new Set(enviadas.map(firma));
  escribirPendientes(leerPendientes().filter((o) => !s.has(firma(o))));
}

let enviando = false;
export async function enviarPendientes() {
  if (enviando || !sb || !empresaActual) return;
  enviando = true;
  const empresa = empresaActual;
  let rechazadas = 0;
  try {
    for (;;) {
      const ops = compactar(leerPendientes());
      if (!ops.length || empresa !== empresaActual) break;
      const lote = primerLote(ops);
      const error = await mandar(lote);
      if (empresa !== empresaActual) break;
      if (!error) { quitarDeCola(lote); continue; }
      if (!esErrorDefinitivo(error)) break; // sin conexión: se reintenta después
      if (lote.length > 1) {
        // La nube rechazó el grupo: se manda fila por fila para apartar solo la que está mal.
        let corte = false;
        for (const op of lote) {
          const e = await mandar([op]);
          if (e && !esErrorDefinitivo(e)) { corte = true; break; }
          if (e) rechazadas++;
          quitarDeCola([op]);
        }
        if (corte) break;
      } else {
        rechazadas++;
        quitarDeCola(lote);
      }
    }
    if (rechazadas && empresa === empresaActual) {
      avisar(rechazadas === 1 ? "La nube no aceptó un cambio (revisa tu permiso). Se restauró la versión de la empresa." : `La nube no aceptó ${rechazadas} cambios. Se restauró la versión de la empresa.`);
      await traerDeNube(empresa).catch(() => {});
    }
  } finally {
    enviando = false;
  }
}

/** Trae la versión de la nube y le pone encima lo que este teléfono todavía no envía. */
async function traerDeNube(empresaId: string) {
  const remoto = await cargarEmpresa(empresaId);
  if (empresaId !== empresaActual) return;
  const pend = leerPendientes();
  aplicarRemoto(() => {
    const d = remoto;
    for (const op of pend) {
      const c = coleccionDe(op.tabla)!;
      const lista = (d[c] as { id: string }[]).filter((x) => x.id !== op.id);
      if (op.tipo === "upsert") lista.push(deFila(op.fila!));
      (d[c] as unknown) = lista;
    }
    return d;
  });
}

function encolar(antes: BaseDatos, despues: BaseDatos) {
  const ops = diferencias(antes, despues).map((o) =>
    o.tabla === "proyectos" && o.fila && !o.fila.empresa_id ? { ...o, fila: { ...o.fila, empresa_id: empresaActual } } : o,
  );
  if (!ops.length) return;
  escribirPendientes(compactar([...leerPendientes(), ...ops]));
  void enviarPendientes();
}

/* ---------- Cambios en vivo de otros teléfonos ---------- */
let canal: RealtimeChannel | null = null;

function escuchar(empresaId: string) {
  canal?.unsubscribe();
  canal = sb!.channel(`empresa-${empresaId}`);
  for (const tabla of Object.values(TABLAS)) {
    canal.on("postgres_changes", { event: "*", schema: "public", table: tabla }, (cambio) => {
      const c = coleccionDe(tabla);
      if (!c) return;
      const nueva = cambio.eventType === "DELETE" ? null : deFila<{ id: string }>(cambio.new as Record<string, unknown>);
      const id = (nueva?.id ?? (cambio.old as { id?: string }).id) as string;
      // Si este teléfono tiene un cambio sin enviar para esa fila, gana el local.
      if (leerPendientes().some((o) => o.tabla === tabla && o.id === id)) return;
      // Si la copia del teléfono es más reciente que la que llega, se conserva (última escritura gana).
      const local = (estadoActual()[c] as { id: string; actualizado?: number }[]).find((x) => x.id === id);
      const llega = nueva as { actualizado?: number } | null;
      if (local && llega && (local.actualizado ?? 0) > (llega.actualizado ?? 0)) return;
      aplicarRemoto((d) => {
        const lista = (d[c] as { id: string }[]).filter((x) => x.id !== id);
        if (nueva) lista.push(nueva);
        (d[c] as unknown) = lista;
      });
    });
  }
  canal.subscribe();
}

/* ---------- Arranque del modo nube para una empresa ---------- */
export async function abrirEmpresa(m: Membresia, opciones: { avisar: (m: string) => void; pendientes: (n: number) => void }) {
  empresaActual = m.empresaId;
  avisar = opciones.avisar;
  alCambiarPendientes = opciones.pendientes;
  const clave = `pulso-obra:nube:${m.empresaId}`;
  usarAlmacen(clave, encolar); // muestra de inmediato la copia guardada en el teléfono
  soloLectura(m.rol === "lectura" ? "Tu acceso a esta empresa es de solo lectura." : null);
  usarFotosRemotas({
    subir: async (id, blob) => {
      const { error } = await sb!.storage.from("fotos").upload(`${m.empresaId}/${id}.jpg`, blob, { upsert: true, contentType: blob.type || "image/jpeg" });
      if (error) avisar("La foto se guardó en el teléfono, pero no se pudo subir a la nube.");
    },
    bajar: async (id) => (await sb!.storage.from("fotos").download(`${m.empresaId}/${id}.jpg`)).data ?? undefined,
  });
  alCambiarPendientes(leerPendientes().length);
  await enviarPendientes();
  try {
    await traerDeNube(m.empresaId);
  } catch {
    avisar("Sin conexión: estás viendo la última copia guardada en este teléfono.");
  }
  escuchar(m.empresaId);
}

export function cerrarEmpresa() {
  canal?.unsubscribe();
  canal = null;
  empresaActual = "";
  usarFotosRemotas(null);
  soloLectura(null);
  usarAlmacen(CLAVE_LOCAL, null);
}

/**
 * Al volver a la app (el iPhone corta la conexión en vivo cuando la app queda en segundo plano) o al recuperar la señal,
 * se manda lo pendiente y se trae lo que otros capturaron mientras tanto.
 */
let ultimaPuestaAlDia = 0;
async function ponerseAlDia() {
  if (!empresaActual || Date.now() - ultimaPuestaAlDia < 15000) return;
  ultimaPuestaAlDia = Date.now();
  const empresa = empresaActual;
  await enviarPendientes();
  await traerDeNube(empresa).catch(() => {});
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void ponerseAlDia());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void ponerseAlDia(); });
  setInterval(() => void enviarPendientes(), 30000);
}

/* ---------- Pasar a la empresa lo capturado antes en modo local ---------- */
export function datosLocales(): BaseDatos {
  return leerClave(CLAVE_LOCAL);
}

export function hayDatosLocales(): boolean {
  return datosLocales().proyectos.length > 0;
}

/** Copia los proyectos del modo local a la empresa abierta. No borra la copia local. */
export function importarLocales(): number {
  const local = datosLocales();
  const actuales = new Set(estadoActual().proyectos.map((p) => p.id));
  const nuevos = local.proyectos.filter((p) => !actuales.has(p.id));
  if (!nuevos.length) return 0;
  const ids = new Set(nuevos.map((p) => p.id));
  const de = <T extends { proyectoId: string }>(xs: T[]) => xs.filter((x) => ids.has(x.proyectoId));
  const antes = estadoActual();
  const despues: BaseDatos = {
    ...antes,
    proyectos: [...antes.proyectos, ...nuevos.map((p) => ({ ...p, empresaId: empresaActual }))],
    conteos: [...antes.conteos, ...de(local.conteos)],
    incumplimientos: [...antes.incumplimientos, ...de(local.incumplimientos)],
    restricciones: [...antes.restricciones, ...de(local.restricciones)],
    plan: [...antes.plan, ...de(local.plan)],
    narracion: [...antes.narracion, ...de(local.narracion)],
  };
  aplicarRemoto(() => despues);
  encolar(antes, despues);
  return nuevos.length;
}

export const empresaAbierta = () => empresaActual;
