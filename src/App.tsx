import { useEffect, useState } from "react";
import type { Restriccion } from "./types";
import { actualizar, alAlmacenamientoLleno, useDatos } from "./data/store";
import { cargarDemo, proyectoNuevo } from "./data/demo";
import { corta, DIAS, diasDeSemana, hoy, lunesDe, semanaIso, sumarDias } from "./lib/fechas";
import { calcular } from "./lib/ppc";
import { Medidor, Ppc, toast, Toast } from "./ui/comun";
import { Captura } from "./ui/Captura";
import { Planear } from "./ui/Planear";
import { Restricciones } from "./ui/Restricciones";
import { Semana } from "./ui/Semana";
import { Analisis } from "./ui/Analisis";
import { Ajustes } from "./ui/Ajustes";

const PESTANAS = [
  ["cap", "Captura"],
  ["pla", "Planear"],
  ["res", "Restricciones"],
  ["sem", "Semana"],
  ["ana", "Análisis"],
  ["aju", "Ajustes"],
] as const;
type Pestana = (typeof PESTANAS)[number][0];

const recordar = <T,>(k: string, v?: T): T | undefined => {
  try {
    if (v === undefined) return JSON.parse(localStorage.getItem(k) ?? "null") ?? undefined;
    localStorage.setItem(k, JSON.stringify(v));
  } catch { /* sin almacenamiento: no se recuerda */ }
  return v;
};

export default function App() {
  const db = useDatos();
  const [proyectoId, setProyectoId] = useState<string>(() => recordar<string>("lps:proyecto") ?? "");
  const [pestana, setPestana] = useState<Pestana>(() => recordar<Pestana>("lps:pestana") ?? "cap");
  const [dia, setDia] = useState(hoy());
  const [prefill, setPrefill] = useState<Partial<Restriccion> | null>(null);
  const lunes = lunesDe(dia);

  useEffect(() => { alAlmacenamientoLleno(() => toast("El dispositivo no tiene espacio para guardar. Descarga un respaldo en Ajustes.")); }, []);
  useEffect(() => { recordar("lps:proyecto", proyectoId); }, [proyectoId]);
  useEffect(() => { recordar("lps:pestana", pestana); }, [pestana]);

  const p = db.proyectos.find((x) => x.id === proyectoId) ?? db.proyectos[0] ?? null;

  if (!p) {
    return (
      <main className="bienvenida in">
        <img src="/icon.svg" alt="" width={72} height={72} />
        <h1>Pulso Obra</h1>
        <p className="lema">El pulso diario de tu obra.</p>
        <p>Captura el PPC, las causas de no cumplimiento, las restricciones y la planeación semanal del Last Planner desde el celular.</p>
        <button type="button" className="btn" onClick={() => { const np = proyectoNuevo("Mi proyecto"); actualizar((d) => { d.proyectos.push(np); }); setProyectoId(np.id); setPestana("aju"); }}>Crear mi proyecto</button>
        <button type="button" className="btn ghost" onClick={() => { let id = ""; actualizar((d) => { id = cargarDemo(d, hoy()); }); setProyectoId(id); }}>Ver un proyecto de ejemplo</button>
        <Toast />
      </main>
    );
  }

  const dias = diasDeSemana(lunes);
  const conteos = db.conteos.filter((c) => c.proyectoId === p.id);
  const incs = db.incumplimientos.filter((i) => i.proyectoId === p.id);
  const rDia = calcular(conteos, incs, [dia], p.contratistas);
  const rSem = calcular(conteos, incs, dias, p.contratistas);
  const muestraDia = pestana === "cap" || pestana === "sem";
  const irSemana = (n: number) => setDia(sumarDias(lunes, 7 * n));

  return (
    <>
      <header className="band">
        <div className="in">
          <div className="brandrow">
            <div className="marca"><b>Pulso Obra</b>
              {db.proyectos.length > 1 ? (
                <select aria-label="Proyecto" value={p.id} onChange={(e) => setProyectoId(e.target.value)}>{db.proyectos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
              ) : <span>{p.nombre}</span>}
            </div>
          </div>
          <div className="wkrow">
            <button type="button" className="nav" aria-label="Semana anterior" onClick={() => irSemana(-1)}>‹</button>
            <div className="wk"><b className="num">Semana {semanaIso(lunes).semana}</b><span className="num">{corta(lunes)} – {corta(sumarDias(lunes, 5))} {lunes.slice(0, 4)}</span></div>
            <button type="button" className="nav" aria-label="Semana siguiente" onClick={() => irSemana(1)}>›</button>
          </div>
          <div className="days" role="group" aria-label="Día de la semana">
            {dias.map((d, i) => (
              <button type="button" key={d} aria-pressed={d === dia} className={d === hoy() ? "today" : ""} onClick={() => setDia(d)}>
                <small>{DIAS[i]}</small><b className="num">{Number(d.slice(8))}</b>
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="in">
        {muestraDia && (
          <section className="ppc" aria-label="PPC">
            <div className="kpi">
              <span className="lab">PPC {DIAS[dias.indexOf(dia)]} {corta(dia)}</span>
              <Ppc ppc={rDia.ppc} meta={p.meta} className="big" />
              <Medidor ppc={rDia.ppc} meta={p.meta} />
              <span className="det num">{rDia.planeadas ? `${rDia.cumplidas} de ${rDia.planeadas} cumplidas` : "Sin actividades planeadas"}</span>
            </div>
            <div className="kpi">
              <span className="lab">PPC semana</span>
              <Ppc ppc={rSem.ppc} meta={p.meta} className="mid" />
              <Medidor ppc={rSem.ppc} meta={p.meta} />
              <span className="det num">{rSem.planeadas ? `${rSem.cumplidas} de ${rSem.planeadas}` : ""} · meta {p.meta} %</span>
            </div>
          </section>
        )}

        <nav className="tabs" role="tablist">
          {PESTANAS.map(([k, t]) => (
            <button type="button" role="tab" key={k} aria-selected={pestana === k} onClick={() => setPestana(k)}>{t}</button>
          ))}
        </nav>

        <section className="view">
          {pestana === "cap" && <Captura p={p} dia={dia} />}
          {pestana === "pla" && <Planear p={p} lunes={lunes} onRestriccion={(r) => { setPrefill(r); setPestana("res"); window.scrollTo(0, 0); }} />}
          {pestana === "res" && <Restricciones p={p} lunes={lunes} prefill={prefill} onPrefillUsado={() => setPrefill(null)} />}
          {pestana === "sem" && <Semana p={p} lunes={lunes} dia={dia} />}
          {pestana === "ana" && <Analisis p={p} lunes={lunes} />}
          {pestana === "aju" && <Ajustes p={p} onCambiarProyecto={setProyectoId} />}
        </section>
      </div>
      <Toast />
    </>
  );
}
