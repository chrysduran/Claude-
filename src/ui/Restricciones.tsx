import { useEffect, useState } from "react";
import type { EstadoRestriccion, Proyecto, Restriccion } from "../types";
import { actualizar, uid, useDatos } from "../data/store";
import { corta, diasEntre, hoy, sumarDias } from "../lib/fechas";
import { leerCsv } from "../lib/csv";
import { restriccionesDesdeCsv } from "../lib/restriccionesCsv";
import { BotonConfirmar, Hoja, Icono, toast, Vacio } from "./comun";

const ESTADOS: EstadoRestriccion[] = ["Abierta", "En proceso", "Liberada"];
type Filtro = "abiertas" | "semana" | "vencidas" | "liberadas" | "todas";

export function Restricciones({ p, lunes, prefill, onPrefillUsado }: { p: Proyecto; lunes: string; prefill: Partial<Restriccion> | null; onPrefillUsado: () => void }) {
  const db = useDatos();
  const [filtro, setFiltro] = useState<Filtro>("abiertas");
  const [edit, setEdit] = useState<Restriccion | null>(null);
  const [original, setOriginal] = useState("");
  useEffect(() => { if (edit && !original) setOriginal(JSON.stringify(edit)); if (!edit) setOriginal(""); }, [edit, original]);
  const hoyS = hoy();
  const todas = db.restricciones.filter((r) => r.proyectoId === p.id).sort((a, b) => a.numero - b.numero);

  const nueva = (extra: Partial<Restriccion> = {}): Restriccion => ({
    id: "", proyectoId: p.id, numero: Math.max(0, ...todas.map((r) => r.numero)) + 1, asunto: "", detalle: "", zona: "", contratista: "",
    responsable: "", fechaIdentificada: hoyS, fechaCompromiso: "", fechaCierre: "", estado: "Abierta", observaciones: "", actualizado: 0, ...extra,
  });

  useEffect(() => {
    if (prefill) { setEdit(nueva(prefill)); onPrefillUsado(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const vencida = (r: Restriccion) => r.estado !== "Liberada" && !!r.fechaCompromiso && r.fechaCompromiso < hoyS;
  const F: Record<Filtro, (r: Restriccion) => boolean> = {
    abiertas: (r) => r.estado !== "Liberada",
    semana: (r) => r.estado !== "Liberada" && !!r.fechaCompromiso && r.fechaCompromiso <= sumarDias(lunes, 5),
    vencidas: vencida,
    liberadas: (r) => r.estado === "Liberada",
    todas: () => true,
  };
  const pill = (r: Restriccion) =>
    r.estado === "Liberada" ? ["Liberada", "p-ok"] : vencida(r) ? ["Vencida", "p-bad"] : r.fechaCompromiso && r.fechaCompromiso <= sumarDias(lunes, 5) ? ["Vence esta semana", "p-warn"] : [r.estado, "p-none"];

  const guardar = (r: Restriccion) => {
    if (!r.asunto.trim() || !r.responsable.trim() || !r.fechaCompromiso) return toast("Falta asunto, responsable o fecha de compromiso.");
    const id = r.id || uid();
    const fin = { ...r, id, asunto: r.asunto.trim(), responsable: r.responsable.trim(), fechaCierre: r.estado === "Liberada" ? r.fechaCierre || hoyS : "", actualizado: Date.now() };
    actualizar((d) => { d.restricciones = [...d.restricciones.filter((x) => x.id !== id), fin]; });
    setEdit(null);
    toast(r.id ? "Restricción actualizada" : "Restricción guardada");
  };

  const importar = async (f: File | undefined) => {
    if (!f) return;
    const r = restriccionesDesdeCsv(leerCsv(await f.text()), p, db.restricciones, hoyS, uid);
    if (!r.restricciones.length) return toast("El archivo no tiene una columna «asunto» (o «tema»). Revisa el formato.");
    const ids = new Set(r.restricciones.map((x) => x.id));
    actualizar((d) => { d.restricciones = [...d.restricciones.filter((x) => !ids.has(x.id)), ...r.restricciones]; });
    setFiltro("todas");
    toast([`${r.nuevas} nuevas`, r.actualizadas && `${r.actualizadas} actualizadas`, r.omitidas && `${r.omitidas} filas sin asunto`].filter(Boolean).join(" · "));
  };

  const lista = todas.filter(F[filtro]);
  const responsables = [...new Set(todas.map((r) => r.responsable).filter(Boolean))];

  const formulario = (r: Restriccion) => (
    <div className="form">
      <label className="field"><span>Asunto</span><input type="text" value={r.asunto} onChange={(e) => setEdit({ ...r, asunto: e.target.value })} /></label>
      <label className="field"><span>Detalle</span><textarea value={r.detalle} onChange={(e) => setEdit({ ...r, detalle: e.target.value })} /></label>
      <div className="row2">
        <label className="field"><span>Zona</span><select value={r.zona} onChange={(e) => setEdit({ ...r, zona: e.target.value })}><option value="">—</option>{p.zonas.map((z) => <option key={z}>{z}</option>)}</select></label>
        <label className="field"><span>Contratista</span><select value={r.contratista} onChange={(e) => setEdit({ ...r, contratista: e.target.value })}><option value="">—</option>{p.contratistas.map((c) => <option key={c}>{c}</option>)}</select></label>
      </div>
      <div className="row2">
        <label className="field"><span>Responsable</span><input type="text" list="dl-resp" value={r.responsable} onChange={(e) => setEdit({ ...r, responsable: e.target.value })} /></label>
        <label className="field"><span>Fecha de compromiso</span><input type="date" value={r.fechaCompromiso} onChange={(e) => setEdit({ ...r, fechaCompromiso: e.target.value })} /></label>
      </div>
      <datalist id="dl-resp">{responsables.map((x) => <option key={x} value={x} />)}</datalist>
      <label className="field"><span>Estado</span><select value={r.estado} onChange={(e) => setEdit({ ...r, estado: e.target.value as EstadoRestriccion })}>{ESTADOS.map((s) => <option key={s}>{s}</option>)}</select></label>
      <label className="field"><span>Observaciones</span><textarea value={r.observaciones} onChange={(e) => setEdit({ ...r, observaciones: e.target.value })} /></label>
      <div className="actions">
        {r.id && <BotonConfirmar onConfirm={() => { actualizar((d) => { d.restricciones = d.restricciones.filter((x) => x.id !== r.id); }); setEdit(null); }}>Borrar</BotonConfirmar>}
        {r.id && r.estado !== "Liberada" && <button type="button" className="btn ghost" onClick={() => guardar({ ...r, estado: "Liberada", fechaCierre: hoyS })}>Liberar hoy</button>}
      </div>
    </div>
  );

  return (
    <>
      <div className="chips">
        {([["abiertas", "Abiertas"], ["semana", "Vencen esta semana"], ["vencidas", "Vencidas"], ["liberadas", "Liberadas"], ["todas", "Todas"]] as const).map(([k, t]) => (
          <button type="button" key={k} className="chip" aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{t} {todas.filter(F[k]).length}</button>
        ))}
      </div>
      <button type="button" className="addinc" onClick={() => setEdit(nueva())}><Icono n="mas" tam={18} /> Nueva restricción</button>
      <div className="actions">
        <label className="btn ghost grow">Importar restricciones (CSV)<input type="file" accept=".csv,text/csv" hidden onChange={(e) => { importar(e.target.files?.[0]); e.target.value = ""; }} /></label>
      </div>
      {lista.length ? lista.map((r) => {
        const [t, c] = pill(r);
        return (
          <div className="rs" key={r.id}>
            <button type="button" className="rs-h" onClick={() => setEdit(r)}>
              <span className="rs-n num">#{r.numero}</span>
              <span className="rs-m">
                <b>{r.asunto}</b>
                <small>{[r.zona, r.contratista, r.responsable].filter(Boolean).join(" · ")}</small>
                <small>Compromiso {r.fechaCompromiso ? corta(r.fechaCompromiso) : "sin fecha"} · {diasEntre(r.fechaIdentificada, r.fechaCierre || hoyS)} días abierta</small>
              </span>
              <span className={`pill ${c}`}>{t}</span>
            </button>
          </div>
        );
      }) : <Vacio titulo="Nada en este filtro">Cambia de filtro o agrega una restricción.</Vacio>}
      {edit && (
        <Hoja titulo={edit.id ? `Restricción #${edit.numero}` : "Nueva restricción"} onCerrar={() => setEdit(null)} accion="Guardar" onAccion={() => guardar(edit)} sucio={!!original && JSON.stringify(edit) !== original}>
          {formulario(edit)}
        </Hoja>
      )}
    </>
  );
}
