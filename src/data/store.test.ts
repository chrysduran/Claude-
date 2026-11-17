import { describe, expect, it } from "vitest";
import { sanear } from "./store";

describe("sanear (respaldos y datos guardados)", () => {
  it("rechaza lo que no es una base de Pulso Obra", () => {
    expect(sanear(null)).toBeNull();
    expect(sanear({ version: 2, proyectos: [] })).toBeNull();
    expect(sanear({ version: 1, proyectos: "x" })).toBeNull();
  });
  it("descarta filas mal formadas o huérfanas y corrige valores fuera de rango", () => {
    const db = sanear({
      version: 1,
      proyectos: [{ id: "p1", nombre: "Torre", meta: 500, contratistas: ["A", 3], zonas: null, causas: [{ codigo: "MO", descripcion: "Mano de obra" }, { codigo: 1 }] }, { nombre: "sin id" }],
      conteos: [{ id: "c1", proyectoId: "p1" }, { id: "c2", proyectoId: "otro" }, "basura"],
    })!;
    expect(db.proyectos).toHaveLength(1);
    expect(db.proyectos[0]).toMatchObject({ meta: 85, contratistas: ["A"], zonas: [], causas: [{ codigo: "MO", descripcion: "Mano de obra" }] });
    expect(db.conteos.map((c) => c.id)).toEqual(["c1"]);
    expect(db.incumplimientos).toEqual([]);
  });
});
