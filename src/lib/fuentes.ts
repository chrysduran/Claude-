import type { ActividadPlan, BaseDatos, Causa, Proyecto } from "../types";
import { claveSemana, lunesDe, sumarDias } from "./fechas";
import { leerFecha, restriccionesDesdeCsv } from "./restriccionesCsv";

/**
 * Fuentes vinculadas: hojas publicadas como CSV (p. ej. Google Sheets › Publicar en la web) de las que un
 * proyecto se actualiza solo. La hoja manda: lo que cambie ahí reemplaza lo de la app.
 *
 * Los ids que se generan aquí son estables (salen del proyecto y de la clave de cada fila), para que dos
 * teléfonos que sincronizan al mismo tiempo escriban la misma fila en lugar de duplicarla.
 */

type Fila = Record<string, string>;

const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

/** Hash corto y estable de un texto (FNV-1a), para ids. */
export function hashCorto(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

/** Igualdad ignorando la marca de tiempo, para no reescribir filas que no cambiaron. */
const igual = <T extends { actualizado: number }>(a: T, b: T) => JSON.stringify({ ...a, actualizado: 0 }) === JSON.stringify({ ...b, actualizado: 0 });

export interface Resumen { nuevas: number; cambiadas: number; quitadas: number }

/* ---------- Restricciones ---------- */
export function aplicarRestricciones(db: BaseDatos, p: Proyecto, filas: Fila[], hoy: string): Resumen {
  const r = restriccionesDesdeCsv(filas, p, db.restricciones, hoy, (clave) => `${p.id}|r|${hashCorto(norm(clave))}`, { omitirCerradasNuevas: true });
  const res: Resumen = { nuevas: 0, cambiadas: 0, quitadas: 0 };
  for (const x of r.restricciones) {
    const i = db.restricciones.findIndex((y) => y.id === x.id);
    if (i < 0) { db.restricciones.push(x); res.nuevas++; }
    else if (!igual(db.restricciones[i], x)) { db.restricciones[i] = x; res.cambiadas++; }
  }
  return res;
}

/* ---------- Planeación ---------- */
/** «2026-W48», o una fecha de esa semana (AAAA-MM-DD o DD/MM/AAAA). Sin semana: la siguiente a `hoy`. */
export function leerSemana(s: string, hoy: string): string {
  const t = s.trim().toUpperCase();
  const m = /^(\d{4})-?W(\d{1,2})$/.exec(t);
  if (m) return `${m[1]}-W${m[2].padStart(2, "0")}`;
  const f = leerFecha(s);
  return f ? claveSemana(lunesDe(f)) : claveSemana(sumarDias(lunesDe(hoy), 7));
}

export function aplicarPlan(db: BaseDatos, p: Proyecto, filas: Fila[], hoy: string): Resumen {
  const res: Resumen = { nuevas: 0, cambiadas: 0, quitadas: 0 };
  const prefijo = `${p.id}|p|`;
  const vistos = new Set<string>();
  const semanas = new Set<string>();
  const repetidas = new Map<string, number>();
  for (const f of filas) {
    const actividad = f.actividad || f.tarea || f.vagon || "";
    if (!actividad.trim()) continue;
    const semana = leerSemana(f.semana || f["lunes"] || f.fecha || "", hoy);
    const grupo = f.grupo || f.nivel || f.frente || f.area || "";
    const unidad = f.unidad || f.depto || f.departamento || f.zona || "";
    const especialidad = f.especialidad || f.contratista || f.disciplina || "";
    const base = norm([grupo, unidad, actividad, especialidad].join("|"));
    const n = (repetidas.get(semana + base) ?? 0) + 1; // la misma actividad dos veces en la semana son dos filas
    repetidas.set(semana + base, n);
    const id = `${prefijo}${semana}|${hashCorto(base + "#" + n)}`;
    const previa = db.plan.find((a) => a.id === id);
    const a: ActividadPlan = {
      id, proyectoId: p.id, semana, grupo, unidad, actividad: actividad.trim(), especialidad: especialidad.trim(),
      retrasada: /^(si|sí|x|1|true)$/i.test((f.retrasada || "").trim()),
      decision: previa?.decision ?? null, motivo: previa?.motivo ?? "", actualizado: Date.now(),
    };
    vistos.add(id);
    semanas.add(semana);
    if (!previa) { db.plan.push(a); res.nuevas++; }
    else if (!igual(previa, a)) { db.plan[db.plan.indexOf(previa)] = a; res.cambiadas++; }
  }
  // Lo que salió de la hoja se quita, salvo que ya se haya decidido en la junta.
  const antes = db.plan.length;
  db.plan = db.plan.filter((a) => !(a.id.startsWith(prefijo) && semanas.has(a.semana) && !vistos.has(a.id) && !a.decision));
  res.quitadas = antes - db.plan.length;
  return res;
}

/* ---------- Catálogos ---------- */
const columna = (filas: Fila[], ...claves: string[]) => {
  const k = claves.find((c) => filas.some((f) => c in f));
  return k ? [...new Set(filas.map((f) => (f[k] ?? "").trim()).filter(Boolean))] : [];
};

export function leerCausa(l: string): Causa {
  const i = l.indexOf("-");
  return i < 0 ? { codigo: l.toUpperCase().slice(0, 6), descripcion: l } : { codigo: l.slice(0, i).trim().toUpperCase(), descripcion: l.slice(i + 1).trim() };
}

/** Reemplaza cada lista que venga en la hoja (contratistas, zonas, causas); las que no vengan se quedan como están. */
export function aplicarCatalogos(db: BaseDatos, p: Proyecto, filas: Fila[]): Resumen {
  const contratistas = columna(filas, "contratistas", "contratista");
  const zonas = columna(filas, "zonas", "zona");
  const causas = columna(filas, "causas", "causa", "razones de no cumplimiento", "codigo").map(leerCausa);
  const actual = db.proyectos.find((x) => x.id === p.id);
  if (!actual) return { nuevas: 0, cambiadas: 0, quitadas: 0 };
  const nuevo: Proyecto = {
    ...actual,
    contratistas: contratistas.length ? contratistas : actual.contratistas,
    zonas: zonas.length ? zonas : actual.zonas,
    causas: causas.length ? causas : actual.causas,
  };
  if (JSON.stringify(nuevo) === JSON.stringify(actual)) return { nuevas: 0, cambiadas: 0, quitadas: 0 };
  db.proyectos[db.proyectos.indexOf(actual)] = nuevo;
  return { nuevas: 0, cambiadas: 1, quitadas: 0 };
}

/** Solo direcciones https; la política de seguridad de la app además limita a Google Sheets. */
export const urlValida = (u: string) => /^https:\/\/[^\s]+$/i.test(u.trim());
