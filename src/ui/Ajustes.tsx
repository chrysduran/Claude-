import { useState } from "react";
import type { BaseDatos, Proyecto } from "../types";
import { actualizar, useDatos } from "../data/store";
import { cargarDemo, proyectoNuevo } from "../data/demo";
import { hoy } from "../lib/fechas";
import { BotonConfirmar, toast } from "./comun";
import { Equipo } from "./Equipo";
import type { Nube } from "../App";

const lineas = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export function Ajustes({ p, onCambiarProyecto, nube }: { p: Proyecto | null; onCambiarProyecto: (id: string) => void; nube: Nube | null }) {
  const db = useDatos();
  const admin = !nube || nube.m.rol === "admin";
  const [nombreNuevo, setNombreNuevo] = useState("");

  const editar = (cambio: Partial<Proyecto>) => p && actualizar((d) => { d.proyectos = d.proyectos.map((x) => (x.id === p.id ? { ...x, ...cambio } : x)); });

  const crear = () => {
    const n = nombreNuevo.trim();
    if (!n) return toast("Escribe el nombre del proyecto.");
    const np = proyectoNuevo(n);
    actualizar((d) => { d.proyectos.push(np); });
    setNombreNuevo("");
    onCambiarProyecto(np.id);
    toast("Proyecto creado. Revisa sus catálogos.");
  };

  const respaldo = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 1)], { type: "application/json" }));
    a.download = `pulso-obra-respaldo-${hoy()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  const restaurar = async (f: File | undefined) => {
    if (!f) return;
    try {
      const d = JSON.parse(await f.text()) as BaseDatos;
      if (d.version !== 1 || !Array.isArray(d.proyectos)) throw new Error();
      actualizar(() => d);
      onCambiarProyecto(d.proyectos[0]?.id ?? "");
      toast("Respaldo restaurado");
    } catch {
      toast("Ese archivo no es un respaldo válido de Pulso Obra.");
    }
  };

  return (
    <>
      {nube && <Equipo m={nube.m} usuarioEmail={nube.email} onCambiarEmpresa={nube.cambiarEmpresa} onSalir={nube.salir} />}
      {!admin && p && (
        <div className="panel">
          <span className="lab">Proyecto actual</span>
          <h2>{p.nombre}</h2>
          <p className="hint">Meta de PPC: {p.meta} %. Solo un administrador puede cambiar los catálogos y la meta.</p>
        </div>
      )}
      {admin && p && (
        <div className="panel">
          <span className="lab">Proyecto actual</span>
          <label className="field"><span>Nombre</span><input type="text" defaultValue={p.nombre} key={p.id + "n"} onBlur={(e) => e.target.value.trim() && editar({ nombre: e.target.value.trim() })} /></label>
          <label className="field"><span>Meta de PPC (%)</span><input type="number" min={1} max={100} defaultValue={p.meta} key={p.id + "m"} onBlur={(e) => editar({ meta: Math.min(100, Math.max(1, Number(e.target.value) || 85)) })} /></label>
          <label className="field"><span>Contratistas (uno por línea)</span><textarea rows={7} defaultValue={p.contratistas.join("\n")} key={p.id + "c"} onBlur={(e) => editar({ contratistas: lineas(e.target.value) })} /></label>
          <label className="field"><span>Zonas (una por línea)</span><textarea rows={6} defaultValue={p.zonas.join("\n")} key={p.id + "z"} onBlur={(e) => editar({ zonas: lineas(e.target.value) })} /></label>
          <label className="field"><span>Causas de no cumplimiento (CÓDIGO - descripción, una por línea)</span>
            <textarea rows={8} defaultValue={p.causas.map((c) => `${c.codigo} - ${c.descripcion}`).join("\n")} key={p.id + "k"}
              onBlur={(e) => editar({ causas: lineas(e.target.value).map((l) => { const i = l.indexOf("-"); return i < 0 ? { codigo: l.toUpperCase().slice(0, 6), descripcion: l } : { codigo: l.slice(0, i).trim().toUpperCase(), descripcion: l.slice(i + 1).trim() }; }) })} />
          </label>
          <p className="hint">Si cambias el nombre de un contratista o el código de una causa, los registros anteriores conservan el nombre con el que se capturaron.</p>
          <BotonConfirmar onConfirm={() => {
            actualizar((d) => {
              d.proyectos = d.proyectos.filter((x) => x.id !== p.id);
              for (const k of ["conteos", "incumplimientos", "restricciones", "plan", "narracion"] as const) (d[k] as { proyectoId: string }[]) = d[k].filter((x) => x.proyectoId !== p.id);
            });
            onCambiarProyecto(db.proyectos.find((x) => x.id !== p.id)?.id ?? "");
            toast("Proyecto borrado");
          }}>Borrar este proyecto y sus datos</BotonConfirmar>
        </div>
      )}
      {admin && <div className="panel">
        <span className="lab">Proyectos</span>
        <label className="field"><span>Nuevo proyecto</span>
          <div className="pl-nr"><input type="text" value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} placeholder="Ej. Torre Norte" /><button type="button" className="mini" onClick={crear}>Crear</button></div>
        </label>
        <button type="button" className="btn ghost" onClick={() => { let id = ""; actualizar((d) => { id = cargarDemo(d, hoy()); }); onCambiarProyecto(id); toast("Proyecto demo cargado"); }}>Cargar proyecto demo</button>
      </div>}
      <div className="panel">
        <span className="lab">Respaldo</span>
        <p className="hint">{nube ? "Tus datos se guardan en la nube de la empresa y una copia en este teléfono. El respaldo es un archivo extra por si lo necesitas." : "Por ahora los datos viven solo en este dispositivo. Descarga un respaldo con frecuencia; con él puedes pasar la información a otro teléfono."}</p>
        <div className="actions">
          <button type="button" className="btn ghost grow" onClick={respaldo}>Descargar respaldo</button>
          {!nube && <label className="btn ghost grow">Restaurar respaldo<input type="file" accept="application/json,.json" hidden onChange={(e) => { restaurar(e.target.files?.[0]); e.target.value = ""; }} /></label>}
        </div>
      </div>
    </>
  );
}
