import { useSyncExternalStore } from "react";
import type { BaseDatos } from "../types";

/**
 * Estado de la app. Siempre se guarda una copia en el dispositivo (funciona sin conexión).
 * En modo nube, cada cambio local se manda también a Supabase (ver nube.ts) y los cambios
 * de otros teléfonos llegan con `aplicarRemoto`.
 */
export const CLAVE_LOCAL = "bitacora-lps:v1";
let clave = CLAVE_LOCAL;

export const vacia = (): BaseDatos => ({ version: 1, proyectos: [], conteos: [], incumplimientos: [], restricciones: [], plan: [], narracion: [] });

const COLECCIONES_HIJAS = ["conteos", "incumplimientos", "restricciones", "plan", "narracion"] as const;

/**
 * Revisa que un objeto leído de un archivo o del almacenamiento tenga la forma de la base de datos.
 * Descarta filas mal formadas en lugar de dejar que rompan la app. Devuelve null si no es una base de Pulso Obra.
 */
export function sanear(x: unknown): BaseDatos | null {
  if (!x || typeof x !== "object" || (x as { version?: unknown }).version !== 1) return null;
  const o = x as Record<string, unknown>;
  const filas = (v: unknown) => (Array.isArray(v) ? v.filter((f) => f && typeof f === "object" && typeof (f as { id?: unknown }).id === "string" && (f as { id: string }).id) : null);
  const textos = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);
  const proyectos = filas(o.proyectos ?? []);
  if (!proyectos) return null;
  const db = vacia();
  db.proyectos = proyectos.map((p) => ({
    ...p,
    nombre: typeof p.nombre === "string" && p.nombre.trim() ? p.nombre : "Proyecto",
    meta: Number(p.meta) >= 1 && Number(p.meta) <= 100 ? Number(p.meta) : 85,
    contratistas: textos(p.contratistas),
    zonas: textos(p.zonas),
    causas: Array.isArray(p.causas) ? p.causas.filter((c: unknown) => c && typeof (c as { codigo?: unknown }).codigo === "string" && typeof (c as { descripcion?: unknown }).descripcion === "string") : [],
    creado: Number(p.creado) || 0,
    fuentes: p.fuentes && typeof p.fuentes === "object"
      ? Object.fromEntries(Object.entries(p.fuentes as Record<string, unknown>).filter(([k, v]) => ["restricciones", "plan", "catalogos"].includes(k) && typeof v === "string" && v))
      : undefined,
  }));
  const ids = new Set(db.proyectos.map((p) => p.id));
  for (const c of COLECCIONES_HIJAS) {
    const v = filas(o[c] ?? []);
    if (!v) return null;
    (db[c] as unknown[]) = v.filter((f) => ids.has((f as { proyectoId?: string }).proyectoId ?? ""));
  }
  return db;
}

export function leerClave(k: string): BaseDatos {
  try {
    const raw = localStorage.getItem(k);
    if (raw) {
      const db = sanear(JSON.parse(raw));
      if (db) return db;
      localStorage.setItem(`${k}:dañado`, raw); // no se pierde: queda apartado para soporte
    }
  } catch {
    /* almacenamiento bloqueado o dañado: se arranca vacío */
  }
  return vacia();
}

let estado: BaseDatos = typeof localStorage === "undefined" ? vacia() : leerClave(clave);
const oyentes = new Set<() => void>();

type Destino = (antes: BaseDatos, despues: BaseDatos) => void;
let destino: Destino | null = null;
let bloqueo: string | null = null;

function guardar() {
  try {
    localStorage.setItem(clave, JSON.stringify(estado));
  } catch {
    alertaAlmacenamiento?.();
  }
  oyentes.forEach((o) => o());
}

export function actualizar(fn: (db: BaseDatos) => BaseDatos | void) {
  if (bloqueo) return alertaBloqueo?.(bloqueo);
  const antes = estado;
  const copia = structuredClone(estado);
  estado = (fn(copia) as BaseDatos | undefined) ?? copia;
  guardar();
  destino?.(antes, estado);
}

/** Cambios que vienen de la nube: se guardan y se muestran, pero no se vuelven a mandar. */
export function aplicarRemoto(fn: (db: BaseDatos) => BaseDatos | void) {
  const copia = structuredClone(estado);
  estado = (fn(copia) as BaseDatos | undefined) ?? copia;
  guardar();
}

/** Cambia de "cuaderno" (local o el de una empresa en la nube) y opcionalmente manda los cambios a `d`. */
export function usarAlmacen(k: string, d: Destino | null) {
  clave = k;
  destino = d;
  estado = leerClave(k);
  oyentes.forEach((o) => o());
}

/** Solo lectura: bloquea los cambios con un mensaje. */
export function soloLectura(mensaje: string | null) {
  bloqueo = mensaje;
}

let alertaBloqueo: ((m: string) => void) | undefined;
export const alBloqueo = (fn: (m: string) => void) => (alertaBloqueo = fn);
export const estadoActual = () => estado;

let alertaAlmacenamiento: (() => void) | undefined;
export const alAlmacenamientoLleno = (fn: () => void) => (alertaAlmacenamiento = fn);

export function useDatos(): BaseDatos {
  return useSyncExternalStore(
    (o) => (oyentes.add(o), () => oyentes.delete(o)),
    () => estado,
  );
}

/** Identificador único e impredecible (también nombra las fotos en la nube, así que no debe poder adivinarse). */
export const uid = () => Date.now().toString(36) + Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(36).padStart(2, "0")).join("");

/* ---------- Fotos en IndexedDB (no caben en localStorage) ---------- */
const FOTOS_LOCAL = "bitacora-lps-fotos";
const FOTOS_NUBE = "pulso-obra-fotos-nube"; // copia en el teléfono de las fotos de la empresa; se borra al cerrar sesión
const abrir = () =>
  new Promise<IDBDatabase>((ok, mal) => {
    const r = indexedDB.open(remotas ? FOTOS_NUBE : FOTOS_LOCAL, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("fotos");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });

interface FotosRemotas {
  subir: (id: string, blob: Blob) => Promise<void>;
  bajar: (id: string) => Promise<Blob | undefined>;
}
let remotas: FotosRemotas | null = null;
export const usarFotosRemotas = (r: FotosRemotas | null) => (remotas = r);
export const borrarFotosDeNube = () => { try { indexedDB.deleteDatabase(FOTOS_NUBE); } catch { /* sin IndexedDB */ } };

async function guardarLocal(id: string, blob: Blob) {
  const db = await abrir();
  await new Promise<void>((ok, mal) => {
    const tx = db.transaction("fotos", "readwrite");
    tx.objectStore("fotos").put(blob, id);
    tx.oncomplete = () => ok();
    tx.onerror = () => mal(tx.error);
  });
}

/** Guarda la foto en el teléfono y, en modo nube, la sube. */
export async function guardarFoto(id: string, blob: Blob) {
  await guardarLocal(id, blob);
  if (remotas) await remotas.subir(id, blob);
}

export async function leerFoto(id: string): Promise<Blob | undefined> {
  const db = await abrir();
  const local = await new Promise<Blob | undefined>((ok, mal) => {
    const r = db.transaction("fotos").objectStore("fotos").get(id);
    r.onsuccess = () => ok(r.result as Blob | undefined);
    r.onerror = () => mal(r.error);
  });
  if (local || !remotas) return local;
  const b = await remotas.bajar(id).catch(() => undefined);
  if (b) await guardarLocal(id, b).catch(() => {});
  return b;
}

/** Reduce la foto a 1600 px por lado para ahorrar espacio. */
export async function reducir(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((ok) => c.toBlob((b) => ok(b ?? file), "image/jpeg", 0.82));
  } catch {
    return file;
  }
}
