#!/usr/bin/env python3
"""
Convierte un Takt Plan tipo «PULL» (como el de Oficinas de ETAGE) en las filas de la pestaña
«Planeación» que Pulso Obra lee como fuente vinculada.

Formato esperado del Excel:
  - Pestaña de actividades (por omisión «PULL DIGITALIZADA») y pestaña paralela con el contratista
    de cada celda (por omisión «DISTRIBUCIÓN CONTRATISTAS»), con la misma cuadrícula.
  - Fila 3: fecha del lunes en la primera columna de cada semana (cada semana puede ocupar 2 columnas).
  - Columna A: grupo (p. ej. «Oficinas»); columna B: zona (p. ej. «Zona 1»). Se arrastran hacia abajo.

Uso:
  python3 takt_a_planeacion.py TAKT.xlsx --desde 2026-11-16 [--semanas 4] [--csv salida.csv | --json]
Imprime CSV (Semana,Grupo,Zona,Actividad,Contratista) o JSON (lista de filas, con encabezado).
"""
import argparse, csv, datetime as dt, json, sys
import openpyxl

def lunes(d: dt.date) -> dt.date:
    return d - dt.timedelta(days=d.weekday())

def limpiar(v) -> str:
    return " ".join(str(v).split()) if v is not None else ""

def hoja(wb, nombre, *alternos):
    for n in (nombre, *alternos):
        for ws in wb.worksheets:
            if ws.title.strip().lower() == n.lower():
                return ws
    sys.exit(f"No encontré la pestaña «{nombre}». Pestañas: {[w.title for w in wb.worksheets]}")

def filas_takt(ruta, desde: dt.date, semanas: int, hoja_act="PULL DIGITALIZADA", hoja_con="DISTRIBUCIÓN CONTRATISTAS"):
    wb = openpyxl.load_workbook(ruta, data_only=True)
    act = hoja(wb, hoja_act, "PULL CON FLUJO DE ACTIVIDADES")
    con = hoja(wb, hoja_con, "DISTRIBUCION CONTRATISTAS")
    # Columnas de cada semana: la fila 3 trae el lunes; las columnas siguientes sin fecha son de la misma semana.
    col_semana, actual = {}, None
    for c in range(3, act.max_column + 1):
        v = act.cell(3, c).value
        if isinstance(v, (dt.datetime, dt.date)):
            actual = lunes(v.date() if isinstance(v, dt.datetime) else v)
        if actual:
            col_semana[c] = actual
    # La última columna con texto suele ser la leyenda de responsables: se ignora si su encabezado lo dice.
    leyenda = {c for c in range(1, act.max_column + 1) for r in range(1, 8) if limpiar(act.cell(r, c).value).upper() == "RESPONSABLES"}
    inicio, fin = lunes(desde), lunes(desde) + dt.timedelta(weeks=semanas)
    salida, grupo, zona = [], "", ""
    for r in range(4, act.max_row + 1):
        nuevo_grupo = limpiar(act.cell(r, 1).value)
        if nuevo_grupo and nuevo_grupo != grupo:
            grupo, zona = nuevo_grupo, ""  # la zona no pasa de un grupo a otro
        zona = limpiar(act.cell(r, 2).value) or zona
        for c, sem in col_semana.items():
            if c in leyenda or not (inicio <= sem < fin):
                continue
            a = limpiar(act.cell(r, c).value)
            if not a:
                continue
            salida.append([sem.isoformat(), grupo, zona, a, limpiar(con.cell(r, c).value)])
    return [["Semana", "Grupo", "Zona", "Actividad", "Contratista"]] + salida

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("takt")
    ap.add_argument("--desde", required=True, help="AAAA-MM-DD; se usa el lunes de esa semana")
    ap.add_argument("--semanas", type=int, default=4)
    ap.add_argument("--csv")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    filas = filas_takt(a.takt, dt.date.fromisoformat(a.desde), a.semanas)
    if a.json:
        print(json.dumps(filas, ensure_ascii=False))
    else:
        out = open(a.csv, "w", newline="", encoding="utf-8") if a.csv else sys.stdout
        csv.writer(out).writerows(filas)
