import { describe, expect, it } from "vitest";
import { leerCsv } from "./csv";

describe("leerCsv", () => {
  it("lee comas, punto y coma, comillas y acentos en encabezados", () => {
    expect(leerCsv("Grupo,Unidad,Actividad,Especialidad\nNivel 7,701,\"Pintura, 1a mano\",Tablaroca\n")).toEqual([
      { grupo: "Nivel 7", unidad: "701", actividad: "Pintura, 1a mano", especialidad: "Tablaroca" },
    ]);
    expect(leerCsv("﻿Nivel;Unidad;Actividad\r\nN8;802;Piso\r\n")).toEqual([{ nivel: "N8", unidad: "802", actividad: "Piso" }]);
  });
});
