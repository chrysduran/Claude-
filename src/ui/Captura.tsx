import { useState } from "react";
import type { Incumplimiento, Proyecto } from "../types";
import { actualizar, guardarFoto, reducir, uid, useDatos } from "../data/store";
import { DIAS, diasDeSemana, lunesDe } from "../lib/fechas";
import { nivel } from "../lib/ppc";
import { BotonConfirmar, Foto, Hoja, Icono, Medidor, toast } from "./comun";

type Borrador = Omit<Incumplimiento, "id" | "creado" | "actualizado"> & { id?: string; creado?: number };

export function Captura({ p, dia }: { p: Proyecto; dia: string }) {
  const db = useDatos();
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [error, setError] = useState("");
  const nombreDia = DIAS[diasDeSemana(lunesDe(dia)).indexOf(dia)];

  const planOf = (c: string) => db.conteos.find((x) => x.proyectoId === p.id && x.fecha === dia && x.contratista === c)?.planeadas ?? 0;
  const incsOf = (c: string) => db.incumplimientos.filter((x) => x.proyectoId === p.id && x.fecha === dia && x.contratista === c).sort((a, b) => a.creado - b.creado);

  const setPlan = (c: string, v: number) => {
    const n = Math.max(0, Math.min(999, Math.floor(v) || 0));
    const id = `${p.id}|${dia}|${c}`;
    actualizar((d) => {
      d.conteos = d.conteos.filter((x) => x.id !== id);
      if (n) d.conteos.push({ id, proyectoId: p.id, fecha: dia, contratista: c, planeadas: n, actualizado: Date.now() });
    });
  };

  const nuevo = (c: string) => {
    setError("");
    setBorrador({ proyectoId: p.id, fecha: dia, contratista: c, actividad: "", zona: "", causa: "", notas: "", contramedida: "", responsable: "", fechaCompromiso: "", fotoId: "" });
  };

  const guardar = () => {
    if (!borrador) return;
    const b = { ...borrador, actividad: borrador.actividad.trim(), notas: borrador.notas.trim(), contramedida: borrador.contramedida.trim(), responsable: borrador.responsable.trim() };
    const falta = [!b.actividad && "la actividad", !b.zona && "la zona", !b.causa && "la causa"].filter(Boolean);
    if (falta.length) return setError(`Falta ${falta.join(", ")}.`);
    const id = b.id ?? uid();
    actualizar((d) => {
      d.incumplimientos = d.incumplimientos.filter((x) => x.id !== id);
      d.incumplimientos.push({ ...b, id, creado: b.creado ?? Date.now(), actualizado: Date.now() } as Incumplimiento);
    });
    if (!b.id && planOf(b.contratista) <= incsOf(b.contratista).length) setPlan(b.contratista, incsOf(b.contratista).length + 1);
    toast(b.id ? "Cambios guardados" : "Incumplimiento registrado");
    setBorrador(null);
  };

  const borrar = () => {
    if (!borrador?.id) return;
    const id = borrador.id;
    actualizar((d) => { d.incumplimientos = d.incumplimientos.filter((x) => x.id !== id); });
    setBorrador(null);
    toast("Incumplimiento borrado");
  };

  const subirFoto = async (f: File | undefined) => {
    if (!f || !borrador) return;
    try {
      const id = uid();
      await guardarFoto(id, await reducir(f));
      setBorrador({ ...borrador, fotoId: id });
    } catch {
      toast("No se pudo guardar la foto en este dispositivo.");
    }
  };

  if (!p.contratistas.length) return <p className="hint">Agrega contratistas en Ajustes para empezar a capturar.</p>;

  return (
    <>
      <p className="hint">Planeadas del {nombreDia} por contratista. Registra lo que no se cumplió; lo demás cuenta como cumplido.</p>
      <ul className="cts">
        {p.contratistas.map((c) => {
          const pl = planOf(c), list = incsOf(c), ok = Math.max(0, pl - list.length), ppc = pl ? Math.round((ok / pl) * 100) : null;
          const abierto = borrador?.contratista === c;
          return (
            <li key={c} className={`ct ${!pl && !list.length && !abierto ? "idle" : ""}`}>
              <div className="ct-head">
                <b className="ct-name">{c}</b>
                <div>
                  <div className="step">
                    <button type="button" aria-label={`Menos planeadas ${c}`} onClick={() => setPlan(c, pl - 1)}>−</button>
                    <input inputMode="numeric" aria-label={`Planeadas ${c}`} value={pl} onChange={(e) => setPlan(c, Number(e.target.value))} />
                    <button type="button" aria-label={`Más planeadas ${c}`} onClick={() => setPlan(c, pl + 1)}>+</button>
                  </div>
                  <div className="step-lab">Planeadas</div>
                </div>
              </div>
              {(pl > 0 || list.length > 0) && (
                <div className="ct-res num">
                  <span>{ok}/{pl} cumplidas</span>
                  <Medidor ppc={ppc} meta={p.meta} />
                  <b className={`lv-${nivel(ppc, p.meta)}`}>{ppc == null ? "—" : `${ppc}%`}</b>
                </div>
              )}
              {list.length > pl && <p className="warnline">Hay más incumplimientos ({list.length}) que actividades planeadas ({pl}).</p>}
              {list.length > 0 && (
                <div className="incs">
                  {list.map((i) => (
                    <button type="button" key={i.id} className="inc" onClick={() => { setError(""); setBorrador({ ...i }); }}>
                      <span className="code">{i.causa}</span>
                      <span className="inc-body">
                        <b>{i.actividad}</b>
                        <small>{[i.zona, i.contramedida && `CM: ${i.contramedida}`, i.fotoId && "📷"].filter(Boolean).join(" · ")}</small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {!abierto && <button type="button" className="addinc" onClick={() => nuevo(c)}><Icono n="mas" tam={18} /> Registrar incumplimiento</button>}
            </li>
          );
        })}
      </ul>
      {borrador && (
        <Hoja titulo={borrador.id ? "Incumplimiento" : `No se cumplió · ${borrador.contratista}`} onCerrar={() => setBorrador(null)} accion="Guardar" onAccion={guardar}>
                <div className="form">
                  <label className="field">
                    <span>Actividad no cumplida</span>
                    <input type="text" value={borrador.actividad} placeholder="Ej. Piso cerámico depto 1204" onChange={(e) => setBorrador({ ...borrador, actividad: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>Zona</span>
                    <select value={borrador.zona} onChange={(e) => setBorrador({ ...borrador, zona: e.target.value })}>
                      <option value="">Elige la zona…</option>
                      {p.zonas.map((z) => <option key={z}>{z}</option>)}
                    </select>
                  </label>
                  <div className="field">
                    <span>Causa de no cumplimiento</span>
                    <div className="causas">
                      {p.causas.map((k) => (
                        <button type="button" key={k.codigo} className="rz" aria-pressed={borrador.causa === k.codigo} onClick={() => setBorrador({ ...borrador, causa: k.codigo })}>
                          <span className="code">{k.codigo}</span>{k.descripcion}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="field">
                    <span>Qué pasó</span>
                    <textarea value={borrador.notas} onChange={(e) => setBorrador({ ...borrador, notas: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>Contramedida</span>
                    <input type="text" value={borrador.contramedida} placeholder="Qué se hará para que no se repita" onChange={(e) => setBorrador({ ...borrador, contramedida: e.target.value })} />
                  </label>
                  <div className="row2">
                    <label className="field">
                      <span>Responsable</span>
                      <input type="text" value={borrador.responsable} onChange={(e) => setBorrador({ ...borrador, responsable: e.target.value })} />
                    </label>
                    <label className="field">
                      <span>Fecha compromiso</span>
                      <input type="date" value={borrador.fechaCompromiso} onChange={(e) => setBorrador({ ...borrador, fechaCompromiso: e.target.value })} />
                    </label>
                  </div>
                  <div className="field">
                    <span>Foto de evidencia</span>
                    <div className="foto">
                      {borrador.fotoId && <Foto id={borrador.fotoId} />}
                      <label className="mini">
                        {borrador.fotoId ? "Cambiar foto" : "Tomar o subir foto"}
                        <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => subirFoto(e.target.files?.[0])} />
                      </label>
                      {borrador.fotoId && <button type="button" className="mini" onClick={() => setBorrador({ ...borrador, fotoId: "" })}>Quitar</button>}
                    </div>
                  </div>
                  {error && <p className="warnline">{error}</p>}
                  {borrador.id && <BotonConfirmar onConfirm={borrar}>Borrar incumplimiento</BotonConfirmar>}
                </div>
        </Hoja>
      )}
    </>
  );
}
