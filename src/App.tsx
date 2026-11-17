import { useEffect, useState } from "react";
import type { Restriccion } from "./types";
import { actualizar, alAlmacenamientoLleno, alBloqueo, useDatos } from "./data/store";
import { abrirEmpresa, cerrarEmpresa, nubeActiva, sb, type Membresia } from "./data/nube";
import { Acceso } from "./ui/Acceso";
import { cargarDemo, proyectoNuevo } from "./data/demo";
import { corta, DIAS, diasDeSemana, hoy, lunesDe, semanaIso, sumarDias } from "./lib/fechas";
import { calcular, formato, nivel } from "./lib/ppc";
import { Anillo, Avisos, Icono, Segmentado, toast, Toast, useEnLinea } from "./ui/comun";
import { Captura } from "./ui/Captura";
import { Planear } from "./ui/Planear";
import { Restricciones } from "./ui/Restricciones";
import { Semana } from "./ui/Semana";
import { Analisis } from "./ui/Analisis";
import { Ajustes } from "./ui/Ajustes";

const PESTANAS = [
  ["cap", "Hoy", "hoy"],
  ["pla", "Planear", "planear"],
  ["res", "Restricciones", "restric"],
  ["rep", "Reporte", "reporte"],
  ["aju", "Ajustes", "ajustes"],
] as const;
type Pestana = (typeof PESTANAS)[number][0];
const TITULOS: Record<Pestana, string> = { cap: "Hoy", pla: "Planear", res: "Restricciones", rep: "Reporte", aju: "Ajustes" };

const recordar = <T,>(k: string, v?: T): T | undefined => {
  try {
    if (v === undefined) return JSON.parse(localStorage.getItem(k) ?? "null") ?? undefined;
    localStorage.setItem(k, JSON.stringify(v));
  } catch { /* sin almacenamiento: no se recuerda */ }
  return v;
};

export interface Nube {
  m: Membresia;
  email: string;
  pendientes: number;
  cambiarEmpresa: () => void;
  salir: () => void;
}

export default function App() {
  if (!nubeActiva) return <Principal nube={null} />;
  return <Acceso>{(m, cambiar, salir) => <ConNube key={m.empresaId} m={m} cambiar={cambiar} salir={salir} />}</Acceso>;
}

function ConNube({ m, cambiar, salir }: { m: Membresia; cambiar: () => void; salir: () => void }) {
  const [pendientes, setPendientes] = useState(0);
  const [email, setEmail] = useState("");
  const [lista, setLista] = useState(false);
  useEffect(() => {
    sb!.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    void abrirEmpresa(m, { avisar: toast, pendientes: setPendientes }).finally(() => setLista(true));
    return () => cerrarEmpresa();
  }, [m.empresaId]);
  if (!lista) return <main className="bienvenida in"><p>Abriendo {m.nombre}…</p></main>;
  return <Principal nube={{ m, email, pendientes, cambiarEmpresa: cambiar, salir }} />;
}

function Principal({ nube }: { nube: Nube | null }) {
  const db = useDatos();
  const enLinea = useEnLinea();
  const admin = !nube || nube.m.rol === "admin";
  const [proyectoId, setProyectoId] = useState<string>(() => recordar<string>("lps:proyecto") ?? "");
  const [pestana, setPestana] = useState<Pestana>(() => {
    const g = recordar<string>("lps:pestana");
    return PESTANAS.some(([k]) => k === g) ? (g as Pestana) : "cap";
  });
  const [vistaRep, setVistaRep] = useState<"sem" | "ana">("sem");
  const [dia, setDia] = useState(hoy());
  const [prefill, setPrefill] = useState<Partial<Restriccion> | null>(null);
  const lunes = lunesDe(dia);

  useEffect(() => {
    alAlmacenamientoLleno(() => toast("El dispositivo no tiene espacio para guardar. Descarga un respaldo en Ajustes."));
    alBloqueo(toast);
  }, []);
  useEffect(() => { recordar("lps:proyecto", proyectoId); }, [proyectoId]);
  useEffect(() => { recordar("lps:pestana", pestana); }, [pestana]);

  const p = db.proyectos.find((x) => x.id === proyectoId) ?? db.proyectos[0] ?? null;

  if (!p && !admin) {
    return (
      <main className="bienvenida in">
        <h1>{nube!.m.nombre}</h1>
        <p>Todavía no hay proyectos en esta empresa. Pídele al administrador que cree el primero.</p>
        <button type="button" className="btn ghost" onClick={nube!.cambiarEmpresa}>Cambiar de empresa</button>
        <button type="button" className="btn ghost" onClick={nube!.salir}>Cerrar sesión</button>
        <Toast />
      </main>
    );
  }

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
  const conDias = pestana === "cap" || pestana === "rep";
  const irSemana = (n: number) => setDia(sumarDias(lunes, 7 * n));
  const nombreDia = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][dias.indexOf(dia)];
  const titulo = pestana === "cap" ? (dia === hoy() ? "Hoy" : nombreDia) : TITULOS[pestana];

  return (
    <div className="app">
      <header className="barra">
        <div className="barra-fila">
          <div className="contexto">
            <span className="contexto-emp">{nube ? nube.m.nombre : "Pulso Obra"}</span>
            {db.proyectos.length > 1 ? (
              <select aria-label="Proyecto" value={p.id} onChange={(e) => setProyectoId(e.target.value)}>{db.proyectos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
            ) : <span className="contexto-proy">{p.nombre}</span>}
          </div>
          {nube && (nube.pendientes > 0 || !enLinea) && (
            <span className="pend" role="status" title="Todo se guarda en el teléfono y se envía en cuanto haya conexión">
              <Icono n="nube" tam={14} /> {nube.pendientes > 0 ? `${nube.pendientes} sin enviar` : "Sin señal"}
            </span>
          )}
          <div className="semana">
            <button type="button" aria-label="Semana anterior" onClick={() => irSemana(-1)}><Icono n="izq" tam={18} /></button>
            <span className="num">S{semanaIso(lunes).semana}</span>
            <button type="button" aria-label="Semana siguiente" onClick={() => irSemana(1)}><Icono n="der" tam={18} /></button>
          </div>
        </div>
      </header>

      <main className="contenido">
        <Avisos />
        <div className="titular">
          <h1>{titulo}</h1>
          <span className="subtitulo num">{pestana === "cap" ? `${corta(dia)} · Semana ${semanaIso(lunes).semana}` : `Semana ${semanaIso(lunes).semana} · ${corta(lunes)} – ${corta(sumarDias(lunes, 5))}`}</span>
        </div>

        {conDias && (
          <div className="dias" role="group" aria-label="Día de la semana">
            {dias.map((d, i) => (
              <button type="button" key={d} aria-pressed={d === dia} className={d === hoy() ? "hoy" : ""} onClick={() => setDia(d)}>
                <small>{DIAS[i].slice(0, 1)}</small><b className="num">{Number(d.slice(8))}</b>
              </button>
            ))}
          </div>
        )}

        {pestana === "cap" && (
          <section className="resumen" aria-label="PPC">
            <Anillo ppc={rDia.ppc} meta={p.meta} tam={132} grosor={16} etiqueta="del día" />
            <div className="resumen-datos">
              <div><span className="lab">Cumplidas</span><b className="num">{rDia.cumplidas}<small>/{rDia.planeadas}</small></b></div>
              <div><span className="lab">Semana</span><b className={`num lv-${nivel(rSem.ppc, p.meta)}`}>{formato(rSem.ppc)}</b></div>
              <div><span className="lab">Meta</span><b className="num">{p.meta}%</b></div>
            </div>
          </section>
        )}

        <section className="view">
          {pestana === "cap" && <Captura p={p} dia={dia} />}
          {pestana === "pla" && <Planear p={p} lunes={lunes} onRestriccion={(r) => { setPrefill(r); setPestana("res"); window.scrollTo(0, 0); }} />}
          {pestana === "res" && <Restricciones p={p} lunes={lunes} prefill={prefill} onPrefillUsado={() => setPrefill(null)} />}
          {pestana === "rep" && (
            <>
              <Segmentado opciones={[["sem", "Semana"], ["ana", "Análisis"]]} valor={vistaRep} onCambio={setVistaRep} />
              {vistaRep === "sem" ? <Semana p={p} lunes={lunes} dia={dia} /> : <Analisis p={p} lunes={lunes} />}
            </>
          )}
          {pestana === "aju" && <Ajustes p={p} onCambiarProyecto={setProyectoId} nube={nube} />}
        </section>
      </main>

      <nav className="tabbar" role="tablist" aria-label="Secciones">
        {PESTANAS.map(([k, t, ic]) => (
          <button type="button" role="tab" key={k} aria-selected={pestana === k} onClick={() => { if (pestana === k) window.scrollTo({ top: 0, behavior: "smooth" }); else { setPestana(k); window.scrollTo(0, 0); } }}>
            <Icono n={ic} tam={25} />
            <span>{t}</span>
          </button>
        ))}
      </nav>
      <Toast />
    </div>
  );
}
