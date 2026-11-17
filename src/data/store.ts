import { useSyncExternalStore } from "react";
import type { BaseDatos } from "../types";

/**
 * Almacenamiento local (en el dispositivo). La interfaz `actualizar` es la misma que usará
 * el adaptador de Supabase (ver supabase/schema.sql) cuando haya usuarios y datos compartidos.
 */
const CLAVE = "bitacora-lps:v1";

const vacia = (): BaseDatos => ({ version: 1, proyectos: [], conteos: [], incumplimientos: [], restricciones: [], plan: [], narracion: [] });

function leer(): BaseDatos {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (raw) return { ...vacia(), ...JSON.parse(raw) };
  } catch {
    /* almacenamiento bloqueado o dañado: se arranca vacío */
  }
  return vacia();
}

let estado: BaseDatos = typeof localStorage === "undefined" ? vacia() : leer();
const oyentes = new Set<() => void>();

export function actualizar(fn: (db: BaseDatos) => BaseDatos | void) {
  const copia = structuredClone(estado);
  estado = (fn(copia) as BaseDatos | undefined) ?? copia;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(estado));
  } catch {
    alertaAlmacenamiento?.();
  }
  oyentes.forEach((o) => o());
}

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

export async function guardarFoto(id: string, blob: Blob) {
  const db = await abrir();
  await new Promise<void>((ok, mal) => {
    const tx = db.transaction("fotos", "readwrite");
    tx.objectStore("fotos").put(blob, id);
    tx.oncomplete = () => ok();
    tx.onerror = () => mal(tx.error);
  });
}

export async function leerFoto(id: string): Promise<Blob | undefined> {
  const db = await abrir();
  return new Promise((ok, mal) => {
    const r = db.transaction("fotos").objectStore("fotos").get(id);
    r.onsuccess = () => ok(r.result as Blob | undefined);
    r.onerror = () => mal(r.error);
  });
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
