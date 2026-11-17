/** Fechas como texto AAAA-MM-DD, calculadas en UTC para que no dependan de la zona horaria del teléfono. */

const pad = (n: number) => String(n).padStart(2, "0");
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export const aTexto = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export function desdeTexto(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function sumarDias(s: string, n: number): string {
  const d = desdeTexto(s);
  d.setUTCDate(d.getUTCDate() + n);
  return aTexto(d);
}

/** Hoy en el reloj local; si es domingo, regresa el sábado (la semana de obra es lunes a sábado). */
export function hoy(ahora: Date = new Date()): string {
  let s = aTexto(new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())));
  if (desdeTexto(s).getUTCDay() === 0) s = sumarDias(s, -1);
  return s;
}

export function lunesDe(s: string): string {
  const d = desdeTexto(s);
  const dia = d.getUTCDay() || 7;
  return sumarDias(s, 1 - dia);
}

export function semanaIso(s: string): { anio: number; semana: number } {
  const d = desdeTexto(s);
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const anio = d.getUTCFullYear();
  const semana = Math.ceil(((d.getTime() - Date.UTC(anio, 0, 1)) / 864e5 + 1) / 7);
  return { anio, semana };
}

/** Clave de semana, p. ej. "2026-W46". */
export function claveSemana(s: string): string {
  const { anio, semana } = semanaIso(s);
  return `${anio}-W${pad(semana)}`;
}

export const diasDeSemana = (lunes: string) => [0, 1, 2, 3, 4, 5].map((i) => sumarDias(lunes, i));

export function corta(s: string): string {
  const d = desdeTexto(s);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

export function dmy(s: string): string {
  if (!s) return "";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export const diasEntre = (a: string, b: string) => Math.round((desdeTexto(b).getTime() - desdeTexto(a).getTime()) / 864e5);
