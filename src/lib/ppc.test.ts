import { describe, expect, it } from "vitest";
import { calcular, nivel, patrones } from "./ppc";
import { claveSemana, hoy, lunesDe, semanaIso } from "./fechas";
import type { Conteo, Incumplimiento } from "../types";

const conteo = (fecha: string, contratista: string, planeadas: number): Conteo => ({ id: `p|${fecha}|${contratista}`, proyectoId: "p", fecha, contratista, planeadas, actualizado: 0 });
const inc = (fecha: string, contratista: string): Incumplimiento => ({
  id: Math.random().toString(36), proyectoId: "p", fecha, contratista, actividad: "x", zona: "N1", causa: "MAT",
  notas: "", contramedida: "", responsable: "", fechaCompromiso: "", fotoId: "", creado: 0, actualizado: 0,
});

describe("PPC", () => {
  it("cumplidas = planeadas − incumplimientos", () => {
    const r = calcular([conteo("2026-11-09", "A", 4), conteo("2026-11-09", "B", 6)], [inc("2026-11-09", "A")], ["2026-11-09"], ["A", "B"]);
    expect(r).toEqual({ planeadas: 10, incumplidas: 1, cumplidas: 9, ppc: 90 });
  });

  it("no cuenta más incumplimientos que planeadas", () => {
    const r = calcular([conteo("2026-11-09", "A", 1)], [inc("2026-11-09", "A"), inc("2026-11-09", "A")], ["2026-11-09"], ["A"]);
    expect(r.cumplidas).toBe(0);
    expect(r.ppc).toBe(0);
  });

  it("sin planeadas no hay PPC", () => {
    expect(calcular([], [], ["2026-11-09"], ["A"]).ppc).toBeNull();
  });

  it("semáforo contra la meta", () => {
    expect(nivel(90, 85)).toBe("ok");
    expect(nivel(75, 85)).toBe("warn");
    expect(nivel(60, 85)).toBe("bad");
    expect(nivel(null, 85)).toBe("none");
  });
});

describe("fechas", () => {
  it("semana ISO", () => {
    expect(semanaIso("2026-11-09")).toEqual({ anio: 2026, semana: 46 });
    expect(claveSemana("2026-11-14")).toBe("2026-W46");
    expect(claveSemana("2027-01-01")).toBe("2026-W53");
  });
  it("lunes de la semana y domingo como sábado", () => {
    expect(lunesDe("2026-11-12")).toBe("2026-11-09");
    expect(hoy(new Date(2026, 10, 15, 10))).toBe("2026-11-14");
  });
});

describe("patrones", () => {
  it("detecta una causa repetida semanas seguidas", () => {
    const s = ["2026-W44", "2026-W45", "2026-W46"];
    const p = patrones(
      [
        { semana: "2026-W45", contratista: "Pisos", causa: "MO" },
        { semana: "2026-W46", contratista: "Pisos", causa: "MO" },
        { semana: "2026-W44", contratista: "Cancelería", causa: "MAT" },
      ],
      s,
    );
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ contratista: "Pisos", causa: "MO", racha: 2, activa: true, desde: "2026-W45", hasta: "2026-W46" });
  });
});
