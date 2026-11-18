import { describe, expect, it } from "vitest";
import type { Proyecto, Restriccion } from "../types";
import { leerCsv } from "./csv";
import { leerEstado, leerFecha, leerNumero, restriccionesDesdeCsv } from "./restriccionesCsv";

const p: Proyecto = { id: "p1", nombre: "ETAGE", meta: 85, contratistas: ["Ciya", "COPACHISA"], zonas: ["Shell", "Oficinas"], causas: [], creado: 0 };
let n = 0;
const nuevoId = () => `id${++n}`;

describe("lectura de campos", () => {
  it("números, fechas y estados", () => {
    expect(leerNumero("ICE #446")).toBe(446);
    expect(leerNumero("ICE #282.3")).toBeNull();
    expect(leerNumero("R-409-3")).toBeNull();
    expect(leerNumero("")).toBeNull();
    expect(leerFecha("2026-11-18 00:00:00")).toBe("2026-11-18");
    expect(leerFecha("3/11/2026")).toBe("2026-11-03");
    expect(leerFecha("pronto")).toBe("");
    expect(leerEstado("En proceso")).toBe("En proceso");
    expect(leerEstado("Terminado")).toBe("Liberada");
    expect(leerEstado("Restricción")).toBe("Abierta");
  });
});

describe("restriccionesDesdeCsv", () => {
  const csv = "No.,Tema / problema,Requerida por,Responsable,Fecha de registro,Fecha compromiso,Estado,Comentarios\n" +
    "ICE #446,Relleno línea sanitaria,copachisa,Miguel Padilla,2026-10-14,2026-11-18,En proceso,Se presentó propuesta\n" +
    ",Sin número,CIYA,Luis,,,,\n" +
    ",,,,,,,\n";

  it("crea restricciones, respeta el catálogo y numera las que no traen número", () => {
    const r = restriccionesDesdeCsv(leerCsv(csv), p, [], "2026-11-18", nuevoId);
    expect(r.nuevas).toBe(2);
    expect(r.actualizadas).toBe(0);
    const [a, b] = r.restricciones;
    expect(a).toMatchObject({ numero: 446, contratista: "COPACHISA", estado: "En proceso", fechaIdentificada: "2026-10-14", fechaCompromiso: "2026-11-18", observaciones: "Se presentó propuesta" });
    expect(b).toMatchObject({ numero: 447, contratista: "Ciya", estado: "Abierta", fechaIdentificada: "2026-11-18" });
  });

  it("reimportar actualiza en lugar de duplicar", () => {
    const previa: Restriccion = { id: "viejo", proyectoId: "p1", numero: 446, asunto: "x", detalle: "", zona: "", contratista: "", responsable: "", fechaIdentificada: "2026-10-01", fechaCompromiso: "", fechaCierre: "", estado: "Abierta", observaciones: "", actualizado: 0 };
    const r = restriccionesDesdeCsv(leerCsv(csv), p, [previa], "2026-11-18", nuevoId);
    expect(r.actualizadas).toBe(1);
    expect(r.restricciones.find((x) => x.numero === 446)?.id).toBe("viejo");
  });

  it("las claves con subnúmero se numeran en consecutivo y no se duplican al reimportar", () => {
    const archivo = leerCsv("No.,Tema\nICE #446,A\nICE #282.3,B\nICE #447,C\n");
    const r1 = restriccionesDesdeCsv(archivo, p, [], "2026-11-18", nuevoId);
    const b = r1.restricciones.find((x) => x.asunto === "B")!;
    expect(b.numero).toBe(448);
    expect(r1.restricciones.find((x) => x.asunto === "C")?.numero).toBe(447);
    expect(b.observaciones).toBe("Ref. original: ICE #282.3");
    const r2 = restriccionesDesdeCsv(archivo, p, r1.restricciones, "2026-11-18", nuevoId);
    expect(r2.nuevas).toBe(0);
    expect(r2.restricciones.find((x) => x.asunto === "B")?.id).toBe(b.id);
  });

  it("una restricción liberada guarda fecha de cierre", () => {
    const r = restriccionesDesdeCsv(leerCsv("Asunto,Estado,Fecha de cierre\nPlano,Terminado,05/11/2026\n"), p, [], "2026-11-18", nuevoId);
    expect(r.restricciones[0]).toMatchObject({ estado: "Liberada", fechaCierre: "2026-11-05" });
  });
});
