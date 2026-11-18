import type { Fuentes, Proyecto } from "../types";
import { leerCsv } from "../lib/csv";
import { hoy } from "../lib/fechas";
import { aplicarCatalogos, aplicarPlan, aplicarRestricciones, urlValida, type Resumen } from "../lib/fuentes";
import { actualizar, estadoActual } from "./store";

/**
 * Lee las fuentes vinculadas de un proyecto y aplica los cambios. Se llama al abrir el proyecto (como mucho
 * cada INTERVALO por teléfono) y con el botón «Actualizar ahora» de Ajustes.
 *
 * Las direcciones también se guardan en el teléfono: si la base en la nube todavía no tiene la columna
 * `fuentes`, así no se pierden al recargar.
 */
export const INTERVALO = 15 * 60 * 1000;
const claveLocal = (id: string) => `pulso-obra:fuentes:${id}`;
const claveUltima = (id: string) => `pulso-obra:fuentes-ultima:${id}`;

export function fuentesDe(p: Proyecto): Fuentes {
  if (p.fuentes && Object.keys(p.fuentes).length) return p.fuentes;
  try { return JSON.parse(localStorage.getItem(claveLocal(p.id)) ?? "{}"); } catch { return {}; }
}

export function guardarFuentes(p: Proyecto, f: Fuentes) {
  const limpio = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, (v ?? "").trim()]).filter(([, v]) => v)) as Fuentes;
  try { localStorage.setItem(claveLocal(p.id), JSON.stringify(limpio)); } catch { /* sin espacio */ }
  actualizar((d) => { d.proyectos = d.proyectos.map((x) => (x.id === p.id ? { ...x, fuentes: limpio } : x)); });
}

export const hayFuentes = (p: Proyecto) => Object.values(fuentesDe(p)).some(Boolean);

export function ultimaLectura(id: string): number {
  try { return Number(localStorage.getItem(claveUltima(id))) || 0; } catch { return 0; }
}

async function leer(url: string) {
  // Google cachea la versión publicada unos minutos; el parámetro evita además la caché del navegador.
  const r = await fetch(url + (url.includes("?") ? "&" : "?") + "_=" + Date.now(), { cache: "no-store", credentials: "omit" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const texto = await r.text();
  if (/^\s*<(!doctype|html)/i.test(texto)) throw new Error("la dirección no devuelve un CSV (¿está publicada como CSV?)");
  return leerCsv(texto);
}

export interface ResultadoSincronizacion {
  partes: Partial<Record<keyof Fuentes, Resumen>>;
  errores: string[];
}

const NOMBRES: Record<keyof Fuentes, string> = { catalogos: "catálogos", restricciones: "restricciones", plan: "planeación" };

/** `forzar` ignora el intervalo. Devuelve null si no tocaba leer o no hay fuentes. */
export async function sincronizarFuentes(proyectoId: string, forzar = false): Promise<ResultadoSincronizacion | null> {
  const p0 = estadoActual().proyectos.find((x) => x.id === proyectoId);
  if (!p0 || !hayFuentes(p0)) return null;
  if (!forzar && Date.now() - ultimaLectura(proyectoId) < INTERVALO) return null;
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;
  try { localStorage.setItem(claveUltima(proyectoId), String(Date.now())); } catch { /* sin espacio */ }

  const f = fuentesDe(p0);
  const res: ResultadoSincronizacion = { partes: {}, errores: [] };
  // Los catálogos van primero: las restricciones usan sus nombres.
  for (const k of ["catalogos", "restricciones", "plan"] as const) {
    const url = f[k];
    if (!url) continue;
    if (!urlValida(url)) { res.errores.push(`${NOMBRES[k]}: dirección no válida`); continue; }
    try {
      const filas = await leer(url);
      actualizar((d) => {
        const p = d.proyectos.find((x) => x.id === proyectoId);
        if (!p) return;
        res.partes[k] = k === "catalogos" ? aplicarCatalogos(d, p, filas) : k === "restricciones" ? aplicarRestricciones(d, p, filas, hoy()) : aplicarPlan(d, p, filas, hoy());
      });
    } catch (e) {
      res.errores.push(`${NOMBRES[k]}: ${(e as Error).message || "no se pudo leer"}`);
    }
  }
  return res;
}

/** Texto corto para avisar qué cambió. Vacío si no cambió nada. */
export function describir(r: ResultadoSincronizacion): string {
  const t = (Object.entries(r.partes) as [keyof Fuentes, Resumen][])
    .filter(([, x]) => x.nuevas || x.cambiadas || x.quitadas)
    .map(([k, x]) => `${NOMBRES[k]}: ${[x.nuevas && `${x.nuevas} nuevas`, x.cambiadas && `${x.cambiadas} actualizadas`, x.quitadas && `${x.quitadas} quitadas`].filter(Boolean).join(", ")}`);
  return [...t, ...r.errores.map((e) => `No se pudo leer ${e}`)].join(" · ");
}
