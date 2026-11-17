import type { BaseDatos } from "../types";

/** Colecciones de la app y la tabla de Supabase que les corresponde. */
export const TABLAS = {
  proyectos: "proyectos",
  conteos: "conteos",
  incumplimientos: "incumplimientos",
  restricciones: "restricciones",
  plan: "plan_actividades",
  narracion: "narracion",
} as const;
export type Coleccion = keyof typeof TABLAS;
export const COLECCIONES = Object.keys(TABLAS) as Coleccion[];
export const coleccionDe = (tabla: string) => COLECCIONES.find((c) => TABLAS[c] === tabla);

const aSnake = (k: string) => k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
const aCamel = (k: string) => k.replace(/_([a-z])/g, (_, m: string) => m.toUpperCase());

export function aFila(obj: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined).map(([k, v]) => [aSnake(k), v]));
}

export function deFila<T>(fila: Record<string, unknown>): T {
  const o = Object.fromEntries(Object.entries(fila).map(([k, v]) => [aCamel(k), v]));
  if ("meta" in o) o.meta = Number(o.meta); // numeric de Postgres llega como texto
  return o as T;
}

export interface Operacion {
  tabla: string;
  tipo: "upsert" | "delete";
  id: string;
  fila?: Record<string, unknown>;
}

/** Diferencias entre dos estados: filas nuevas o cambiadas (upsert) y filas que desaparecieron (delete). */
export function diferencias(antes: BaseDatos, despues: BaseDatos): Operacion[] {
  const ops: Operacion[] = [];
  // Los proyectos van primero al crear y al final al borrar, por las llaves foráneas.
  const borrar: Operacion[] = [];
  for (const c of COLECCIONES) {
    const a = new Map((antes[c] as { id: string }[]).map((x) => [x.id, x]));
    const d = new Map((despues[c] as { id: string }[]).map((x) => [x.id, x]));
    for (const [id, x] of d) {
      const previo = a.get(id);
      if (!previo || JSON.stringify(previo) !== JSON.stringify(x)) ops.push({ tabla: TABLAS[c], tipo: "upsert", id, fila: aFila(x) });
    }
    for (const id of a.keys()) if (!d.has(id)) borrar.push({ tabla: TABLAS[c], tipo: "delete", id });
  }
  borrar.sort((x, y) => Number(x.tabla === "proyectos") - Number(y.tabla === "proyectos"));
  return [...ops, ...borrar];
}

/** Junta operaciones pendientes: para cada fila solo importa la última. */
export function compactar(ops: Operacion[]): Operacion[] {
  const ultima = new Map<string, Operacion>();
  for (const op of ops) {
    const k = `${op.tabla}|${op.id}`;
    ultima.delete(k);
    ultima.set(k, op);
  }
  const res = [...ultima.values()];
  const pos = (o: Operacion) => (o.tipo === "upsert" ? (o.tabla === "proyectos" ? 0 : 1) : o.tabla === "proyectos" ? 3 : 2);
  return res.sort((a, b) => pos(a) - pos(b));
}

/** ¿El error es definitivo (permiso o dato inválido) o temporal (sin conexión)? */
export function esErrorDefinitivo(e: { code?: string; status?: number; message?: string } | null | undefined): boolean {
  if (!e) return false;
  if (e.code && /^(42|23|22|PGRST)/.test(e.code)) return true;
  return !!e.status && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429;
}
