import { describe, expect, it } from "vitest";
import type { BaseDatos, Proyecto } from "../types";
import { leerCsv } from "./csv";
import { aplicarCatalogos, aplicarPlan, aplicarRestricciones, leerSemana } from "./fuentes";

const proyecto = (): Proyecto => ({ id: "p1", nombre: "ETAGE", meta: 85, contratistas: ["Ciya"], zonas: ["Shell"], causas: [], creado: 0 });
const base = (): BaseDatos => ({ version: 1, proyectos: [proyecto()], conteos: [], incumplimientos: [], restricciones: [], plan: [], narracion: [] });
const HOY = "2026-11-18";

describe("aplicarRestricciones", () => {
  const ice = "REGISTRO ICE,,,\nNo. ICE,Tema / problema,Requerida por,Estado\nICE #446,Relleno sanitario,CIYA,En proceso\nICE #282.3,Nicho tableros,,Abierto\nICE #100,Ya resuelto,,Terminado\n";

  it("agrega las vivas, ignora las cerradas que no conocía y usa ids estables", () => {
    const a = base(), b = base();
    const r = aplicarRestricciones(a, a.proyectos[0], leerCsv(ice), HOY);
    aplicarRestricciones(b, b.proyectos[0], leerCsv(ice), HOY);
    expect(r).toEqual({ nuevas: 2, cambiadas: 0, quitadas: 0 });
    expect(a.restricciones.map((x) => x.id)).toEqual(b.restricciones.map((x) => x.id)); // dos teléfonos, mismas filas
    expect(a.restricciones.find((x) => x.numero === 446)?.contratista).toBe("Ciya");
  });

  it("volver a leer la misma hoja no cambia nada; un cambio de estado sí", () => {
    const db = base();
    aplicarRestricciones(db, db.proyectos[0], leerCsv(ice), HOY);
    expect(aplicarRestricciones(db, db.proyectos[0], leerCsv(ice), HOY)).toEqual({ nuevas: 0, cambiadas: 0, quitadas: 0 });
    const cerrada = ice.replace("Relleno sanitario,CIYA,En proceso", "Relleno sanitario,CIYA,Terminado");
    expect(aplicarRestricciones(db, db.proyectos[0], leerCsv(cerrada), HOY).cambiadas).toBe(1);
    expect(db.restricciones.find((x) => x.numero === 446)?.estado).toBe("Liberada");
  });
});

describe("filas sin número", () => {
  it("conservan su número en lecturas siguientes", () => {
    const db = base();
    const hoja = leerCsv("No.,Tema,Estado\nICE #5,Con número,Abierto\n,Canalón,Abierto\n,Transformador,Abierto\n");
    aplicarRestricciones(db, db.proyectos[0], hoja, HOY);
    const antes = db.restricciones.map((r) => [r.asunto, r.numero]);
    expect(aplicarRestricciones(db, db.proyectos[0], hoja, HOY)).toEqual({ nuevas: 0, cambiadas: 0, quitadas: 0 });
    expect(db.restricciones.map((r) => [r.asunto, r.numero])).toEqual(antes);
  });
});

describe("aplicarPlan", () => {
  const plan = "Semana,Zona,Actividad,Contratista\n2026-11-23,Zona 1,Tablaroca 2da cara,CIYA\n2026-11-23,Zona 1,Tablaroca 2da cara,CIYA\n2026-11-23,Zona 2,Luminarias,DEMEK\n";

  it("pone la semana de la fecha y respeta duplicados", () => {
    const db = base();
    expect(aplicarPlan(db, db.proyectos[0], leerCsv(plan), HOY).nuevas).toBe(3);
    expect(new Set(db.plan.map((a) => a.semana))).toEqual(new Set(["2026-W48"]));
    expect(new Set(db.plan.map((a) => a.id)).size).toBe(3);
  });

  it("conserva lo decidido en la junta y quita lo que salió de la hoja si no se decidió", () => {
    const db = base();
    aplicarPlan(db, db.proyectos[0], leerCsv(plan), HOY);
    const lum = db.plan.find((a) => a.actividad === "Luminarias")!;
    lum.decision = "si";
    const sinLuminarias = plan.split("\n").filter((l) => !l.includes("Luminarias")).join("\n");
    const sinTablaroca = plan.split("\n").filter((l) => !l.includes("Tablaroca")).join("\n");
    aplicarPlan(db, db.proyectos[0], leerCsv(sinLuminarias), HOY);
    expect(db.plan.find((a) => a.actividad === "Luminarias")?.decision).toBe("si"); // decidida: se queda
    expect(aplicarPlan(db, db.proyectos[0], leerCsv(sinTablaroca), HOY).quitadas).toBe(2);
    expect(db.plan.find((a) => a.actividad === "Luminarias")?.decision).toBe("si");
  });

  it("lee la semana en varios formatos", () => {
    expect(leerSemana("2026-W5", HOY)).toBe("2026-W05");
    expect(leerSemana("25/11/2026", HOY)).toBe("2026-W48");
    expect(leerSemana("", HOY)).toBe("2026-W48"); // sin semana: la siguiente
  });
});

describe("aplicarCatalogos", () => {
  it("reemplaza solo las listas que vienen en la hoja", () => {
    const db = base();
    const r = aplicarCatalogos(db, db.proyectos[0], leerCsv("Contratistas,Causas\nCiya,PM - Material\nJamar,CL - Cliente\nIndecopisos,\n"));
    expect(r.cambiadas).toBe(1);
    expect(db.proyectos[0]).toMatchObject({ contratistas: ["Ciya", "Jamar", "Indecopisos"], zonas: ["Shell"], causas: [{ codigo: "PM", descripcion: "Material" }, { codigo: "CL", descripcion: "Cliente" }] });
    expect(aplicarCatalogos(db, db.proyectos[0], leerCsv("Contratistas\nCiya\nJamar\nIndecopisos\n")).cambiadas).toBe(0);
  });
});
