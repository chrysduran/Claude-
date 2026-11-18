import { describe, expect, it } from "vitest";
import { leerCsv } from "./csv";

describe("leerCsv", () => {
  it("lee comas, punto y coma, comillas y acentos en encabezados", () => {
    expect(leerCsv("Grupo,Unidad,Actividad,Especialidad\nNivel 7,701,\"Pintura, 1a mano\",Tablaroca\n")).toEqual([
      { grupo: "Nivel 7", unidad: "701", actividad: "Pintura, 1a mano", especialidad: "Tablaroca" },
    ]);
    expect(leerCsv("﻿Nivel;Unidad;Actividad\r\nN8;802;Piso\r\n")).toEqual([{ nivel: "N8", unidad: "802", actividad: "Piso" }]);
  });

  it("salta títulos arriba de la tabla y no pisa un encabezado repetido con una celda vacía", () => {
    const t = "REGISTRO ICE,,,\nllenado,,otro,\nNo.,Tema,Comentarios,Comentarios\n#1,Plano,primero,\n#2,Losa,,segundo\n";
    expect(leerCsv(t)).toEqual([
      { "no.": "#1", tema: "Plano", comentarios: "primero" },
      { "no.": "#2", tema: "Losa", comentarios: "segundo" },
    ]);
  });
});
