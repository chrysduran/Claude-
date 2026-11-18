/** Lector CSV mínimo: separador coma o punto y coma, comillas dobles, primera fila = encabezados. */
export function leerCsv(texto: string): Record<string, string>[] {
  const t = texto.replace(/^﻿/, "");
  const sep = (t.split("\n")[0].match(/;/g)?.length ?? 0) > (t.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const filas: string[][] = [];
  let fila: string[] = [], campo = "", comillas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (comillas) {
      if (ch === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') comillas = false;
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      fila.push(campo); campo = "";
      if (fila.some((c) => c.trim())) filas.push(fila);
      fila = [];
    } else campo += ch;
  }
  fila.push(campo);
  if (fila.some((c) => c.trim())) filas.push(fila);
  if (!filas.length) return [];
  const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  // Algunas hojas traen títulos arriba de la tabla: el encabezado es la fila más llena de las primeras 10.
  const llenas = (f: string[]) => f.filter((c) => c.trim()).length;
  let h = 0;
  filas.slice(0, 10).forEach((f, i) => { if (llenas(f) > llenas(filas[h])) h = i; });
  const enc = filas[h].map(norm);
  return filas.slice(h + 1).map((f) => {
    const o: Record<string, string> = {};
    // Si un encabezado se repite, gana la primera columna que tenga dato.
    enc.forEach((k, i) => { const v = (f[i] ?? "").trim(); if (k && (!(k in o) || (!o[k] && v))) o[k] = v; });
    return o;
  });
}
