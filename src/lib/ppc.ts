import type { Conteo, Incumplimiento } from "../types";

export interface Resultado {
  planeadas: number;
  incumplidas: number;
  cumplidas: number;
  ppc: number | null; // porcentaje con un decimal
}

/**
 * PPC = cumplidas / planeadas. Las cumplidas se calculan como planeadas − incumplimientos,
 * por contratista y por día, sin contar más incumplimientos que actividades planeadas.
 */
export function calcular(conteos: Conteo[], incs: Incumplimiento[], fechas: string[], contratistas: string[]): Resultado {
  let planeadas = 0;
  let incumplidas = 0;
  const fs = new Set(fechas);
  for (const f of fs) {
    for (const c of contratistas) {
      const p = conteos.filter((x) => x.fecha === f && x.contratista === c).reduce((a, x) => a + x.planeadas, 0);
      const n = incs.filter((x) => x.fecha === f && x.contratista === c).length;
      planeadas += p;
      incumplidas += Math.min(n, p);
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
