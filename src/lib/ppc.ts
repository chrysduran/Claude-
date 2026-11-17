import type { Conteo, Incumplimiento } from "../types";

export interface Resultado {
  planeadas: number;
  incumplidas: number;
  cumplidas: number;
  ppc: number | null; // porcentaje con un decimal
}

/* Índices por (fecha, contratista). Se calculan una vez por arreglo y se reutilizan mientras no cambie. */
const indPlan = new WeakMap<Conteo[], Map<string, number>>();
const indInc = new WeakMap<Incumplimiento[], Map<string, number>>();
function indice<T>(cache: WeakMap<T[], Map<string, number>>, xs: T[], valor: (x: T) => number, clave: (x: T) => string) {
  let m = cache.get(xs);
  if (!m) {
    m = new Map();
    for (const x of xs) m.set(clave(x), (m.get(clave(x)) ?? 0) + valor(x));
    cache.set(xs, m);
  }
  return m;
}

/**
 * PPC = cumplidas / planeadas. Las cumplidas se calculan como planeadas − incumplimientos,
 * por contratista y por día, sin contar más incumplimientos que actividades planeadas.
 * Para que sea rápido, pasa arreglos estables (memorizados) y se indexan una sola vez.
 */
export function calcular(conteos: Conteo[], incs: Incumplimiento[], fechas: string[], contratistas: string[]): Resultado {
  const P = indice(indPlan, conteos, (x) => x.planeadas, (x) => `${x.fecha}|${x.contratista}`);
  const I = indice(indInc, incs, () => 1, (x) => `${x.fecha}|${x.contratista}`);
  let planeadas = 0;
  let incumplidas = 0;
  for (const f of new Set(fechas)) {
    for (const c of contratistas) {
      const p = P.get(`${f}|${c}`) ?? 0;
      planeadas += p;
      incumplidas += Math.min(I.get(`${f}|${c}`) ?? 0, p);
    }
  }
  const cumplidas = planeadas - incumplidas;
  return { planeadas, incumplidas, cumplidas, ppc: planeadas ? Math.round((cumplidas / planeadas) * 1000) / 10 : null };
}

export type Nivel = "ok" | "warn" | "bad" | "none";

/** Semáforo: en meta, hasta 15 puntos abajo, o más abajo. */
export function nivel(ppc: number | null, meta: number): Nivel {
  if (ppc == null) return "none";
  if (ppc >= meta) return "ok";
  if (ppc >= meta - 15) return "warn";
  return "bad";
}

export const formato = (ppc: number | null) => (ppc == null ? "—" : `${Number.isInteger(ppc) ? ppc : ppc.toFixed(1)}%`);

export interface Patron {
  contratista: string;
  causa: string;
  casos: number;
  racha: number; // semanas seguidas
  desde: string;
  hasta: string;
  activa: boolean; // aparece en la última semana analizada
}

/** Combinaciones contratista + causa que se repiten 2 o más semanas seguidas, o 4 o más veces en el periodo. */
export function patrones(incs: { semana: string; contratista: string; causa: string }[], semanas: string[]): Patron[] {
  const res: Patron[] = [];
  const pares = new Set(incs.map((i) => `${i.contratista}\u0000${i.causa}`));
  for (const par of pares) {
    const [contratista, causa] = par.split("\u0000");
    const por = semanas.map((s) => incs.filter((i) => i.semana === s && i.contratista === contratista && i.causa === causa).length);
    const casos = por.reduce((a, b) => a + b, 0);
    let run = 0, racha = 0, fin = -1;
    por.forEach((n, i) => {
      run = n ? run + 1 : 0;
      if (run > racha) { racha = run; fin = i; }
    });
    if (racha >= 2 || casos >= 4) {
      res.push({ contratista, causa, casos, racha, desde: semanas[fin - racha + 1], hasta: semanas[fin], activa: por[por.length - 1] > 0 });
    }
  }
  return res.sort((a, b) => Number(b.activa) - Number(a.activa) || b.racha - a.racha || b.casos - a.casos);
}
