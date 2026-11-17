import type { BaseDatos, Proyecto } from "../types";
import { claveSemana, diasDeSemana, dmy, semanaIso, sumarDias } from "./fechas";
import { calcular } from "./ppc";

/** Genera el Excel de la semana: incumplimientos, PPC diario, PPC por contratista, restricciones y planeación. */
export async function excelSemana(db: BaseDatos, p: Proyecto, lunes: string): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pulso Obra";
  const dias = diasDeSemana(lunes);
  const sem = semanaIso(lunes).semana;
  const conteos = db.conteos.filter((c) => c.proyectoId === p.id);
  const incs = db.incumplimientos.filter((i) => i.proyectoId === p.id);
  const desc = (cod: string) => p.causas.find((c) => c.codigo === cod)?.descripcion ?? "";

  const hoja = (nombre: string, cols: [string, number][]) => {
    const ws = wb.addWorksheet(nombre);
    ws.columns = cols.map(([header, width]) => ({ header, width }));
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16505A" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    return ws;
  };

  const wi = hoja("Incumplimientos", [["Fecha", 12], ["Semana", 9], ["Actividad", 40], ["Contratista", 24], ["Zona", 12], ["Código", 9], ["Causa", 30], ["Notas", 40], ["Contramedida", 40], ["Responsable", 20], ["Fecha compromiso", 16]]);
  incs.filter((i) => dias.includes(i.fecha)).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.creado - b.creado)
    .forEach((i) => wi.addRow([dmy(i.fecha), sem, i.actividad, i.contratista, i.zona, i.causa, desc(i.causa), i.notas, i.contramedida, i.responsable, dmy(i.fechaCompromiso)]));

  const wp = hoja("PPC diario", [["Fecha", 12], ["Planeadas", 11], ["Cumplidas", 11], ["Incumplidas", 12], ["PPC", 9], ["Semana", 9]]);
  dias.forEach((d) => {
    const r = calcular(conteos, incs, [d], p.contratistas);
    if (r.planeadas) wp.addRow([dmy(d), r.planeadas, r.cumplidas, r.incumplidas, (r.ppc ?? 0) / 100, sem]);
  });
  wp.getColumn(5).numFmt = "0.0%";

  const wc = hoja("Por contratista", [["Semana", 9], ["Contratista", 28], ["Planeadas", 11], ["Cumplidas", 11], ["PPC", 9]]);
  p.contratistas.forEach((c) => {
    const r = calcular(conteos, incs, dias, [c]);
    if (r.planeadas) wc.addRow([sem, c, r.planeadas, r.cumplidas, (r.ppc ?? 0) / 100]);
  });
  wc.getColumn(5).numFmt = "0.0%";

  const wr = hoja("Restricciones", [["#", 6], ["Asunto", 36], ["Detalle", 40], ["Zona", 12], ["Contratista", 22], ["Responsable", 22], ["Identificada", 13], ["Compromiso", 13], ["Cierre", 13], ["Estado", 12], ["Observaciones", 40]]);
  db.restricciones.filter((r) => r.proyectoId === p.id).sort((a, b) => a.numero - b.numero)
    .forEach((r) => wr.addRow([r.numero, r.asunto, r.detalle, r.zona, r.contratista, r.responsable, dmy(r.fechaIdentificada), dmy(r.fechaCompromiso), dmy(r.fechaCierre), r.estado, r.observaciones]));

  const prox = claveSemana(sumarDias(lunes, 7));
  const wl = hoja(`Planeación ${prox}`, [["Grupo", 14], ["Unidad", 12], ["Actividad", 34], ["Especialidad", 22], ["Retrasada", 10], ["Decisión", 14], ["Motivo", 40]]);
  db.plan.filter((a) => a.proyectoId === p.id && a.semana === prox)
    .forEach((a) => wl.addRow([a.grupo, a.unidad, a.actividad, a.especialidad, a.retrasada ? "Sí" : "", a.decision === "si" ? "Se planea" : a.decision === "no" ? "No se planea" : "Sin decidir", a.motivo]));

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
