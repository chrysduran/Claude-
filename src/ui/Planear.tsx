import { useState } from "react";
import type { ActividadPlan, Decision, Proyecto, Restriccion } from "../types";
import { actualizar, uid, useDatos } from "../data/store";
import { claveSemana, corta, sumarDias } from "../lib/fechas";
import { leerCsv } from "../lib/csv";
import { Hoja, toast, Vacio } from "./comun";

const siguiente = (d: Decision): Decision => (d === null ? "si" : d === "si" ? "no" : null);
const ordenGrupo = (g: string) => {
  const m = /(\d+)/.exec(g);
  return /s[óo]tano/i.test(g) ? -10 + (m ? -Number(m[1]) : 0) : /pb|planta baja/i.test(g) ? -1 : m ? Number(m[1]) : 999;
};

export function Planear({ p, lunes, onRestriccion }: { p: Proyecto; lunes: string; onRestriccion: (r: Partial<Restriccion>) => void }) {
  const db = useDatos();
  const lunesProx = sumarDias(lunes, 7);
  const semana = claveSemana(lunesProx);
  const [filtro, setFiltro] = useState<"todas" | "sin" | "si" | "no" | "ret">("todas");
  const [esp, setEsp] = useState("");
  const [nueva, setNueva] = useState<{ grupo: string; unidad: string; actividad: string; especialidad: string } | null>(null);

  const todas = db.plan.filter((a) => a.proyectoId === p.id && a.semana === semana);
  const guardar = (a: ActividadPlan) => actualizar((d) => { d.plan = d.plan.map((x) => (x.id === a.id ? { ...a, actualizado: Date.now() } : x)); });

  const importar = async (f: File | undefined) => {
    if (!f) return;
    const filas = leerCsv(await f.text());
    const nuevas: ActividadPlan[] = filas
      .map((r) => ({
        id: uid(), proyectoId: p.id, semana,
        grupo: r.grupo || r.nivel || r.frente || r.area || "",
        unidad: r.unidad || r.depto || r.departamento || r.zona || "",
        actividad: r.actividad || r.tarea || r.vagon || "",
        especialidad: r.especialidad || r.contratista || r.disciplina || "",
        retrasada: /^(si|sí|x|1|true)$/i.test(r.retrasada || ""),
        decision: null as Decision, motivo: "", actualizado: Date.now(),
      }))
      .filter((a) => a.actividad);
    if (!nuevas.length) return toast("El archivo no tiene una columna «actividad». Revisa el formato.");
    actualizar((d) => { d.plan.push(...nuevas); });
    toast(`${nuevas.length} actividades importadas para la semana ${semana.slice(-2)}`);
  };

  const si = todas.filter((a) => a.decision === "si").length;
  const no = todas.filter((a) => a.decision === "no").length;
  const F = { todas: () => true, sin: (a: ActividadPlan) => !a.decision, si: (a: ActividadPlan) => a.decision === "si", no: (a: ActividadPlan) => a.decision === "no", ret: (a: ActividadPlan) => a.retrasada };
  const lista = todas.filter(F[filtro]).filter((a) => !esp || a.especialidad === esp);
  const grupos = [...new Set(lista.map((a) => a.grupo))].sort((a, b) => ordenGrupo(a) - ordenGrupo(b) || a.localeCompare(b));
  const especialidades = [...new Set(todas.map((a) => a.especialidad).filter(Boolean))].sort();

  return (
    <>
      <div className="panel">
        <div className="tk-top">
          <div>
            <span className="lab">Junta de planeación</span>
            <h2>Semana {semana.slice(-2)} · {corta(lunesProx)} – {corta(sumarDias(lunesProx, 5))}</h2>
          </div>
          {todas.length > 0 && <div className="tk-big num"><b>{si}</b><span>de {todas.length}</span></div>}
        </div>
        {todas.length > 0 && (
          <>
            <div className="tk-bar"><i className="bg-ok" style={{ width: `${(si / todas.length) * 100}%` }} /><i className="bg-bad" style={{ width: `${(no / todas.length) * 100}%` }} /></div>
            <div className="tk-legend num"><span><i className="sw ok" />✓ Se planea {si}</span><span><i className="sw no" />✗ No se planea {no}</span><span><i className="sw" />Sin decidir {todas.length - si - no}</span></div>
          </>
        )}
        <p className="hint">Toca una actividad: ✓ se planea · ✗ no se planea · otra vez, sin decidir.</p>
        <div className="actions">
          <label className="btn ghost grow">Importar CSV<input type="file" accept=".csv,text/csv" hidden onChange={(e) => { importar(e.target.files?.[0]); e.target.value = ""; }} /></label>
          <button type="button" className="btn ghost grow" onClick={() => setNueva({ grupo: "", unidad: "", actividad: "", especialidad: "" })}>Agregar</button>
        </div>
        <p className="hint">CSV con columnas: grupo, unidad, actividad, especialidad, retrasada.</p>
      </div>

      {!todas.length ? (
        <Vacio titulo={`Semana ${semana.slice(-2)} sin actividades`}>Importa el CSV del programa o agrega actividades para empezar la junta.</Vacio>
      ) : (
        <>
          <div className="chips">
            {([["todas", "Todas"], ["sin", "Sin decidir"], ["ret", "Retrasadas"], ["si", "✓ Se planean"], ["no", "✗ No se planean"]] as const).map(([k, t]) => (
              <button type="button" key={k} className="chip" aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{t} {todas.filter(F[k]).length}</button>
            ))}
          </div>
          {especialidades.length > 1 && (
            <label className="field"><span>Especialidad</span>
              <select value={esp} onChange={(e) => setEsp(e.target.value)}><option value="">Todas las especialidades</option>{especialidades.map((e) => <option key={e}>{e}</option>)}</select>
            </label>
          )}
          {grupos.map((g) => {
            const del = lista.filter((a) => a.grupo === g);
            const unidades = [...new Set(del.map((a) => a.unidad))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
            const tot = todas.filter((a) => a.grupo === g), sg = tot.filter((a) => a.decision === "si").length;
            return (
              <div className="sec" key={g}>
                <div className="sec-h static"><span className="nm"><b>{g}</b><span className="num">{sg} se planean · {tot.filter((a) => !a.decision).length} sin decidir de {tot.length}</span></span></div>
                <div className="sec-b">
                  {unidades.map((u) => {
                    const us = del.filter((a) => a.unidad === u);
                    return (
                      <div className="tk-row" key={u}>
                        <div className="tk-u">{u || "—"}{us.length > 1 && us.some((a) => a.decision !== "si") && (
                          <button type="button" className="tk-all" onClick={() => actualizar((d) => { d.plan = d.plan.map((x) => (us.some((a) => a.id === x.id) ? { ...x, decision: "si", actualizado: Date.now() } : x)); })}>✓ todas</button>
                        )}</div>
                        <div className="tk-chips">
                          {us.map((a) => (
                            <button type="button" key={a.id} className={`vg ${a.decision === "si" ? "ok" : a.decision === "no" ? "no" : ""} ${a.retrasada ? "ret" : ""}`} title={a.especialidad} onClick={() => guardar({ ...a, decision: siguiente(a.decision) })}>
                              {a.decision === "si" ? "✓ " : a.decision === "no" ? "✗ " : ""}{a.actividad}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="panel">
            <span className="lab">No se planean · {no}</span>
            <h2>Motivo de cada una</h2>
            {no ? todas.filter((a) => a.decision === "no").map((a) => (
              <div className="field" key={a.id}>
                <span>{a.actividad} · {a.grupo} {a.unidad}</span>
                <div className="pl-nr">
                  <input type="text" defaultValue={a.motivo} placeholder="Ej. falta definición de diseño" onBlur={(e) => e.target.value.trim() !== a.motivo && guardar({ ...a, motivo: e.target.value.trim() })} />
                  <button type="button" className="mini" onClick={() => onRestriccion({ asunto: `${a.actividad} ${a.unidad}`.trim(), detalle: `${a.especialidad}: ${a.actividad} en ${a.grupo} ${a.unidad}. ${a.motivo}`.trim(), contratista: p.contratistas.includes(a.especialidad) ? a.especialidad : "", observaciones: a.motivo })}>Crear restricción</button>
                </div>
              </div>
            )) : <p className="hint">Las actividades que marques con ✗ aparecen aquí para anotar por qué no entran al plan.</p>}
          </div>
        </>
      )}
      {nueva && (
        <Hoja titulo="Nueva actividad" onCerrar={() => setNueva(null)} accion="Agregar" onAccion={() => {
                if (!nueva.actividad.trim()) return toast("Escribe la actividad.");
                actualizar((d) => { d.plan.push({ id: uid(), proyectoId: p.id, semana, grupo: nueva.grupo.trim() || "General", unidad: nueva.unidad.trim(), actividad: nueva.actividad.trim(), especialidad: nueva.especialidad.trim(), retrasada: false, decision: null, motivo: "", actualizado: Date.now() }); });
                setNueva(null);
              }}>
          <div className="form flat">
            <div className="row2">
              <label className="field"><span>Grupo (nivel o frente)</span><input type="text" value={nueva.grupo} onChange={(e) => setNueva({ ...nueva, grupo: e.target.value })} placeholder="Nivel 8" /></label>
              <label className="field"><span>Unidad</span><input type="text" value={nueva.unidad} onChange={(e) => setNueva({ ...nueva, unidad: e.target.value })} placeholder="802" /></label>
            </div>
            <label className="field"><span>Actividad</span><input type="text" value={nueva.actividad} onChange={(e) => setNueva({ ...nueva, actividad: e.target.value })} /></label>
            <label className="field"><span>Especialidad</span><input type="text" list="dl-esp" value={nueva.especialidad} onChange={(e) => setNueva({ ...nueva, especialidad: e.target.value })} /></label>
            <datalist id="dl-esp">{p.contratistas.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        </Hoja>
      )}
    </>
  );
}
