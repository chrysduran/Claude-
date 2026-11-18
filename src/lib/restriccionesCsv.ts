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
 * «ICE #446», «R-45», «45» → 446, 45. Las claves con más de un número («ICE #282.3», «R-409-3») no caben en
 * el número entero de la base: devuelven null y se numeran en consecutivo, guardando la clave como referencia.
 */
export function leerNumero(s: string): number | null {
  const n = s.match(/\d+/g);
  return n && n.length === 1 ? Number(n[0]) : null;
}

const REF = "Ref. original: ";
const refDe = (r: Restriccion) => r.observaciones.split("\n").find((l) => l.startsWith(REF))?.slice(REF.length).trim() ?? "";

export type OrdenFechas = "dmy" | "mdy";

/**
 * Orden de las fechas con diagonal en un archivo: si alguna trae más de 12 en la segunda posición
 * (7/15/2026) el archivo viene en formato de EE. UU.; si no, se asume día/mes, como en México.
 */
export function ordenDeFechas(filas: Fila[]): OrdenFechas {
  let mdy = false, dmy = false;
  for (const f of filas) for (const v of Object.values(f)) {
    const m = /^(\d{1,2})\/(\d{1,2})\/\d{4}/.exec(v.trim());
    if (m) { if (+m[2] > 12) mdy = true; if (+m[1] > 12) dmy = true; }
  }
  return mdy && !dmy ? "mdy" : "dmy";
}

/**
 * Acepta AAAA-MM-DD (con o sin hora) y fechas con diagonal en el orden indicado (día/mes por omisión).
 * Si el número que toca al mes no puede ser mes, se prueba el otro orden. Cualquier otra cosa queda vacía.
 */
export function leerFecha(s: string, orden: OrdenFechas = "dmy"): string {
  const t = s.trim();
  const fecha = (a: number, m: number, d: number) =>
    m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : "";
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return fecha(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (!m) return "";
  const [x, y, a] = [+m[1], +m[2], +m[3]];
  return orden === "mdy" ? fecha(a, x, y) || fecha(a, y, x) : fecha(a, y, x) || fecha(a, x, y);
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
  omitidas: number; // filas sin asunto (o ya cerradas, con omitirCerradasNuevas)
}

export interface OpcionesImportacion {
  /** Una fila que llega ya cerrada y que no existe en el proyecto no se agrega (para fuentes con todo el historial). */
  omitirCerradasNuevas?: boolean;
}

/** `nuevoId` recibe la clave de la fila (número, clave original o asunto) para poder generar ids estables. */
export function restriccionesDesdeCsv(filas: Fila[], p: Proyecto, existentes: Restriccion[], hoy: string, nuevoId: (clave: string) => string, op: OpcionesImportacion = {}): ResultadoImportacion {
  const propias = existentes.filter((r) => r.proyectoId === p.id);
  const porNumero = new Map(propias.map((r) => [r.numero, r]));
  const porRef = new Map(propias.filter(refDe).map((r) => [refDe(r), r]));
  const porId = new Map(propias.map((r) => [r.id, r]));
  const CLAVES = ["numero", "no.", "no", "no. ice", "id", "clave"];
  // El consecutivo arranca arriba de todos los números del proyecto y del archivo, para no chocar con uno que venga más abajo.
  let siguiente = Math.max(0, ...propias.map((r) => r.numero), ...filas.map((f) => leerNumero(campo(f, ...CLAVES)) ?? 0)) + 1;
  const res: ResultadoImportacion = { restricciones: [], nuevas: 0, actualizadas: 0, omitidas: 0 };
  const orden = ordenDeFechas(filas);
  const vistas = new Map<string, number>();
  const fechaDe = (f: Fila, ...claves: string[]) => leerFecha(campo(f, ...claves), orden);

  for (const f of filas) {
    const asunto = campo(f, "asunto", "tema / problema", "tema", "restriccion", "descripcion");
    if (!asunto) { res.omitidas++; continue; }
    // Si la misma clave aparece en varias filas (temas distintos con el mismo número), la 2.ª, 3.ª… se
    // tratan como claves propias «ICE #447 (2)», en el orden de la hoja, para que no se pisen entre sí.
    const original = campo(f, ...CLAVES);
    const vez = (vistas.get(original) ?? 0) + 1;
    vistas.set(original, vez);
    const clave = original && vez > 1 ? `${original} (${vez})` : original;
    const leido = leerNumero(clave);
    const ref = clave && leido === null ? clave : "";
    const idPropuesto = nuevoId(clave || asunto);
    // Con ids estables (fuentes vinculadas), una fila sin número se reconoce por su id en la siguiente lectura.
    const previa = (leido !== null ? porNumero.get(leido) : ref ? porRef.get(ref) : undefined) ?? porId.get(idPropuesto);
    const estado = leerEstado(campo(f, "estado", "status", "estatus"));
    if (!previa && op.omitirCerradasNuevas && estado === "Liberada") { res.omitidas++; continue; }
    const numero = leido ?? previa?.numero ?? siguiente;
    if (numero >= siguiente) siguiente = numero + 1;
    const r: Restriccion = {
      id: previa?.id ?? idPropuesto,
      proyectoId: p.id,
      numero,
      asunto,
      detalle: campo(f, "detalle", "actividad / tarea", "actividad", "acuerdo", "acuerdo de seguimiento"),
      zona: delCatalogo(campo(f, "zona", "area", "área"), p.zonas),
      contratista: delCatalogo(campo(f, "contratista", "requerida por", "empresa"), p.contratistas),
      responsable: campo(f, "responsable", "responsable del acuerdo"),
      fechaIdentificada: fechaDe(f, "fecha identificada", "fecha de registro", "fecha de registro ice", "fecha") || previa?.fechaIdentificada || hoy,
      fechaCompromiso: fechaDe(f, "fecha de compromiso", "fecha compromiso", "compromiso"),
      fechaCierre: "",
      estado,
      observaciones: [campo(f, "observaciones", "comentarios", "notas"), ref && REF + ref].filter(Boolean).join("\n"),
      actualizado: Date.now(),
    };
    r.fechaCierre = estado === "Liberada" ? fechaDe(f, "fecha de cierre", "fecha cierre", "fecha que se cerro", "fecha de cierre verificada") || previa?.fechaCierre || hoy : "";
    porNumero.set(numero, r);
    porId.set(r.id, r);
    if (ref) porRef.set(ref, r);
    res.restricciones = [...res.restricciones.filter((x) => x.numero !== numero), r];
    if (previa) res.actualizadas++; else res.nuevas++;
  }
  // Una fila repetida dentro del mismo archivo cuenta una sola vez.
  res.nuevas = res.restricciones.filter((r) => !propias.some((x) => x.id === r.id)).length;
  res.actualizadas = res.restricciones.length - res.nuevas;
  return res;
}
