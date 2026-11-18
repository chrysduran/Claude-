import type { EstadoRestriccion, Proyecto, Restriccion } from "../types";

/**
 * Convierte las filas de un CSV (ya leídas con `leerCsv`) en restricciones del proyecto.
 * Si una fila trae un número que ya existe en el proyecto, se actualiza esa restricción
 * en lugar de duplicarla: así el mismo archivo se puede volver a importar para refrescar el log.
 */

type Fila = Record<string, string>;

/** Primer valor no vacío entre varios nombres de columna posibles (encabezados ya normalizados por leerCsv). */
const campo = (f: Fila, ...claves: string[]) => {
  for (const k of claves) if (f[k]?.trim()) return f[k].trim();
  return "";
};

/**
 * «ICE #446», «R-45», «45» → 446, 45. Las claves con subnúmero («ICE #282.3», «R-409-3») no caben en
 * el número entero de la base: devuelven null y se numeran en consecutivo, guardando la clave como referencia.
 */
export function leerNumero(s: string): number | null {
  const m = /(\d+)([.\-]\d+)?/.exec(s);
  return m && !m[2] ? Number(m[1]) : null;
}

const REF = "Ref. original: ";
const refDe = (r: Restriccion) => r.observaciones.split("\n").find((l) => l.startsWith(REF))?.slice(REF.length).trim() ?? "";

/** Acepta AAAA-MM-DD (con o sin hora) y DD/MM/AAAA. Cualquier otra cosa queda vacía. */
export function leerFecha(s: string): string {
  const t = s.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

export function leerEstado(s: string): EstadoRestriccion {
  const t = s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/liberad|terminad|cerrad|cancelad|resuelt/.test(t)) return "Liberada";
  if (/proceso/.test(t)) return "En proceso";
  return "Abierta";
}

/** Si el texto coincide (sin mayúsculas ni espacios extra) con un elemento del catálogo, usa el nombre del catálogo. */
const delCatalogo = (s: string, catalogo: string[]) => {
  const n = (x: string) => x.trim().toLowerCase();
  return catalogo.find((c) => n(c) === n(s)) ?? s;
};

export interface ResultadoImportacion {
  restricciones: Restriccion[]; // nuevas y actualizadas, listas para guardar
  nuevas: number;
  actualizadas: number;
  omitidas: number; // filas sin asunto
}

export function restriccionesDesdeCsv(filas: Fila[], p: Proyecto, existentes: Restriccion[], hoy: string, nuevoId: () => string): ResultadoImportacion {
  const propias = existentes.filter((r) => r.proyectoId === p.id);
  const porNumero = new Map(propias.map((r) => [r.numero, r]));
  const porRef = new Map(propias.filter(refDe).map((r) => [refDe(r), r]));
  const CLAVES = ["numero", "no.", "no", "no. ice", "id", "clave"];
  // El consecutivo arranca arriba de todos los números del proyecto y del archivo, para no chocar con uno que venga más abajo.
  let siguiente = Math.max(0, ...propias.map((r) => r.numero), ...filas.map((f) => leerNumero(campo(f, ...CLAVES)) ?? 0)) + 1;
  const res: ResultadoImportacion = { restricciones: [], nuevas: 0, actualizadas: 0, omitidas: 0 };

  for (const f of filas) {
    const asunto = campo(f, "asunto", "tema / problema", "tema", "restriccion", "descripcion");
    if (!asunto) { res.omitidas++; continue; }
    const clave = campo(f, ...CLAVES);
    const leido = leerNumero(clave);
    const ref = clave && leido === null ? clave : "";
    const previa = leido !== null ? porNumero.get(leido) : ref ? porRef.get(ref) : undefined;
    const numero = leido ?? previa?.numero ?? siguiente;
    if (numero >= siguiente) siguiente = numero + 1;
    const estado = leerEstado(campo(f, "estado", "status", "estatus"));
    const r: Restriccion = {
      id: previa?.id ?? nuevoId(),
      proyectoId: p.id,
      numero,
      asunto,
      detalle: campo(f, "detalle", "actividad / tarea", "actividad", "acuerdo", "acuerdo de seguimiento"),
      zona: delCatalogo(campo(f, "zona", "area", "área"), p.zonas),
      contratista: delCatalogo(campo(f, "contratista", "requerida por", "empresa"), p.contratistas),
      responsable: campo(f, "responsable", "responsable del acuerdo"),
      fechaIdentificada: leerFecha(campo(f, "fecha identificada", "fecha de registro", "fecha de registro ice", "fecha")) || previa?.fechaIdentificada || hoy,
      fechaCompromiso: leerFecha(campo(f, "fecha de compromiso", "fecha compromiso", "compromiso")),
      fechaCierre: "",
      estado,
      observaciones: [campo(f, "observaciones", "comentarios", "notas"), ref && REF + ref].filter(Boolean).join("\n"),
      actualizado: Date.now(),
    };
    r.fechaCierre = estado === "Liberada" ? leerFecha(campo(f, "fecha de cierre", "fecha cierre", "fecha que se cerro")) || previa?.fechaCierre || hoy : "";
    porNumero.set(numero, r);
    if (ref) porRef.set(ref, r);
    res.restricciones = [...res.restricciones.filter((x) => x.numero !== numero), r];
    if (previa) res.actualizadas++; else res.nuevas++;
  }
  // Una fila repetida dentro del mismo archivo cuenta una sola vez.
  res.nuevas = res.restricciones.filter((r) => !propias.some((x) => x.id === r.id)).length;
  res.actualizadas = res.restricciones.length - res.nuevas;
  return res;
}
