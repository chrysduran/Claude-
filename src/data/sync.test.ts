import { describe, expect, it } from "vitest";
import { aFila, compactar, deFila, diferencias, esErrorDefinitivo, primerLote, type Operacion } from "./sync";
import type { BaseDatos } from "../types";

const base = (): BaseDatos => ({ version: 1, proyectos: [], conteos: [], incumplimientos: [], restricciones: [], plan: [], narracion: [] });
const proyecto = { id: "p1", nombre: "Torre", meta: 85, contratistas: ["A"], zonas: ["N1"], causas: [], creado: 1, empresaId: "e1" };

describe("conversión de campos", () => {
  it("camelCase ↔ snake_case", () => {
    expect(aFila({ proyectoId: "p1", fechaCompromiso: "", fotoId: "f" })).toEqual({ proyecto_id: "p1", fecha_compromiso: "", foto_id: "f" });
    expect(deFila({ proyecto_id: "p1", fecha_identificada: "2026-11-01", meta: "85" })).toEqual({ proyectoId: "p1", fechaIdentificada: "2026-11-01", meta: 85 });
  });
});

describe("diferencias", () => {
  it("detecta altas, cambios y bajas en orden seguro para llaves foráneas", () => {
    const a = base();
    const b = base();
    b.proyectos.push(proyecto);
    b.conteos.push({ id: "c1", proyectoId: "p1", fecha: "2026-11-16", contratista: "A", planeadas: 3, actualizado: 1 });
    const ops = diferencias(a, b);
    expect(ops.map((o) => `${o.tipo}:${o.tabla}`)).toEqual(["upsert:proyectos", "upsert:conteos"]);
    expect(ops[0].fila).toMatchObject({ empresa_id: "e1" });

    const c = structuredClone(b);
    c.conteos[0].planeadas = 4;
    expect(diferencias(b, c)).toEqual([{ tabla: "conteos", tipo: "upsert", id: "c1", fila: expect.objectContaining({ planeadas: 4 }) }]);

    const d = base();
    expect(diferencias(c, d).map((o) => `${o.tipo}:${o.tabla}`)).toEqual(["delete:conteos", "delete:proyectos"]);
    expect(diferencias(c, structuredClone(c))).toEqual([]);
  });

  it("compactar deja solo la última operación de cada fila", () => {
    const ops = compactar([
      { tabla: "conteos", tipo: "upsert", id: "c1", fila: { planeadas: 1 } },
      { tabla: "proyectos", tipo: "upsert", id: "p1", fila: {} },
      { tabla: "conteos", tipo: "upsert", id: "c1", fila: { planeadas: 2 } },
      { tabla: "conteos", tipo: "delete", id: "c2" },
    ]);
    expect(ops.map((o) => `${o.tipo}:${o.tabla}:${o.id}`)).toEqual(["upsert:proyectos:p1", "upsert:conteos:c1", "delete:conteos:c2"]);
    expect(ops[1].fila).toEqual({ planeadas: 2 });
  });

  it("distingue errores de permiso de errores de conexión", () => {
    expect(esErrorDefinitivo({ code: "42501" })).toBe(true);
    expect(esErrorDefinitivo({ status: 403 })).toBe(true);
    expect(esErrorDefinitivo({ message: "Failed to fetch" })).toBe(false);
    expect(esErrorDefinitivo({ status: 503 })).toBe(false);
  });
});

describe("envío por lotes", () => {
  const op = (tabla: string, tipo: "upsert" | "delete", id: string): Operacion => ({ tabla, tipo, id, fila: tipo === "upsert" ? { id } : undefined });
  it("agrupa operaciones seguidas de la misma tabla y tipo, con tope", () => {
    const ops = [op("conteos", "upsert", "a"), op("conteos", "upsert", "b"), op("incumplimientos", "upsert", "c")];
    expect(primerLote(ops).map((o) => o.id)).toEqual(["a", "b"]);
    expect(primerLote(ops, 1).map((o) => o.id)).toEqual(["a"]);
    expect(primerLote([op("conteos", "delete", "x")]).length).toBe(1);
  });
  it("compactar deja juntas las filas de una misma tabla para mandarlas en una sola petición", () => {
    const ops = compactar([op("incumplimientos", "upsert", "1"), op("conteos", "upsert", "2"), op("incumplimientos", "upsert", "3")]);
    expect(ops.map((o) => o.tabla)).toEqual(["conteos", "incumplimientos", "incumplimientos"]);
  });
  it("recorta textos demasiado largos para que la nube no rechace la fila", () => {
    const f = aFila({ id: "x".repeat(300), notas: "n".repeat(5000), actividad: "a".repeat(900) });
    expect((f.id as string).length).toBe(300);
    expect((f.notas as string).length).toBe(4000);
    expect((f.actividad as string).length).toBe(500);
  });
});
