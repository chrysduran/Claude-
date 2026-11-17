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

export function leerClave(k: string): BaseDatos {
  try {
    const raw = localStorage.getItem(k);
    if (raw) return { ...vacia(), ...JSON.parse(raw) };
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

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------- Fotos en IndexedDB (no caben en localStorage) ---------- */
const abrir = () =>
  new Promise<IDBDatabase>((ok, mal) => {
    const r = indexedDB.open("bitacora-lps-fotos", 1);
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
