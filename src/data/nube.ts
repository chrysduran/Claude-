import { createClient, type RealtimeChannel, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { BaseDatos } from "../types";
import { aplicarRemoto, CLAVE_LOCAL, estadoActual, leerClave, soloLectura, usarAlmacen, usarFotosRemotas, vacia } from "./store";
import { COLECCIONES, coleccionDe, compactar, deFila, diferencias, esErrorDefinitivo, TABLAS, type Operacion } from "./sync";

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

let enviando = false;
export async function enviarPendientes() {
  if (enviando || !sb || !empresaActual) return;
  enviando = true;
  try {
    let ops = compactar(leerPendientes());
    while (ops.length) {
      const op = ops[0];
      const q = sb.from(op.tabla);
      const { error, status } = op.tipo === "upsert" ? await q.upsert(op.fila!) : await q.delete().eq("id", op.id);
      if (error) {
        if (!esErrorDefinitivo({ ...error, status })) break; // sin conexión: se reintenta después
        avisar(`No se pudo guardar en la nube: ${error.message}`);
      }
      ops = ops.slice(1);
      escribirPendientes(ops);
    }
  } finally {
    enviando = false;
  }
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
    const remoto = await cargarEmpresa(m.empresaId);
    // Lo que todavía no se envía se conserva encima de lo que vino de la nube.
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

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void enviarPendientes());
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
