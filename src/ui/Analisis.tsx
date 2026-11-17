import type { Proyecto } from "../types";
import { useDatos } from "../data/store";
import { claveSemana, diasDeSemana, lunesDe, sumarDias } from "../lib/fechas";
import { calcular, nivel, patrones } from "../lib/ppc";
import { Vacio } from "./comun";

/** Las barras usan el 84 % de la altura; el resto queda para la etiqueta del valor. Barras y meta comparten escala. */
const ESCALA = 0.84;

export function Analisis({ p, lunes }: { p: Proyecto; lunes: string }) {
  const db = useDatos();
  const conteos = db.conteos.filter((c) => c.proyectoId === p.id);
  const incs = db.incumplimientos.filter((i) => i.proyectoId === p.id);
  const lunesConDatos = [...new Set(conteos.map((c) => lunesDe(c.fecha)))].filter((l) => l <= lunes).sort();
  const ult8 = lunesConDatos.slice(-8);
  if (!ult8.length) return <Vacio titulo="Aún sin historial">El análisis aparece en cuanto haya semanas capturadas.</Vacio>;

  const ult4 = Array.from({ length: 4 }, (_, i) => sumarDias(lunes, -7 * (3 - i)));
  const sem4 = ult4.map(claveSemana);
  const inc4 = incs.filter((i) => ult4.some((l) => diasDeSemana(l).includes(i.fecha))).map((i) => ({ ...i, semana: claveSemana(i.fecha) }));
  const pats = patrones(inc4, sem4).slice(0, 8);
  const desc = (cod: string) => p.causas.find((c) => c.codigo === cod)?.descripcion ?? cod;
  const causas = [...new Set(inc4.map((i) => i.causa))].sort((a, b) => inc4.filter((i) => i.causa === b).length - inc4.filter((i) => i.causa === a).length);
  const cons = [...new Set(inc4.map((i) => i.contratista))];
  const n2 = (k: string, c: string) => inc4.filter((i) => i.causa === k && i.contratista === c).length;
  const mx = Math.max(1, ...causas.flatMap((k) => cons.map((c) => n2(k, c))));

  return (
    <>
      <div className="panel">
        <span className="lab">Tendencia</span>
        <h2>PPC semanal</h2>
        <div className="trend">
          <div className="goal" style={{ bottom: `${p.meta * ESCALA}%` }}><span>Meta {p.meta}%</span></div>
          {ult8.map((l) => {
            const r = calcular(conteos, incs, diasDeSemana(l), p.contratistas);
            return (
              <div className="col" key={l}>
                <b className={`num lv-${nivel(r.ppc, p.meta)}`}>{r.ppc == null ? "—" : Math.round(r.ppc)}</b>
                <i className={`bg-${nivel(r.ppc, p.meta)}`} style={{ height: `${(r.ppc ?? 0) * ESCALA}%` }} />
              </div>
            );
          })}
        </div>
        <div className="tlab">{ult8.map((l) => <span key={l}>S{claveSemana(l).slice(-2)}</span>)}</div>
      </div>
      <div className="panel">
        <span className="lab">Patrones · últimas 4 semanas</span>
        <h2>Causas que se repiten</h2>
        {pats.length ? pats.map((x) => (
          <div className="pat" key={x.contratista + x.causa}>
            <span className="code">{x.causa}</span>
            <div>
              <b>{x.contratista}</b> · {desc(x.causa)}
              <br />
              <span className="hint">{x.racha >= 2 ? `${x.racha} semanas seguidas (S${x.desde.slice(-2)}–S${x.hasta.slice(-2)})` : "Recurrente"} · {x.casos} casos{x.activa ? " · sigue activa" : ""}</span>
            </div>
          </div>
        )) : <p className="hint">Ninguna combinación de contratista y causa se repite dos semanas seguidas.</p>}
        <p className="hint">Llévalas a la junta para un análisis de 5 porqués.</p>
      </div>
      <div className="panel">
        <span className="lab">Últimas 4 semanas</span>
        <h2>Causa × contratista</h2>
        {inc4.length ? (
          <div className="scroll">
            <table className="t heat">
              <thead><tr><th>Causa</th>{cons.map((c) => <th className="r" key={c} title={c}>{c.split(" ")[0].slice(0, 10)}</th>)}<th className="r">Total</th></tr></thead>
              <tbody>
                {causas.map((k) => (
                  <tr key={k}>
                    <td><span className="code" title={desc(k)}>{k}</span></td>
                    {cons.map((c) => {
                      const n = n2(k, c);
                      return <td key={c} className="h num" style={n ? { background: `color-mix(in srgb, var(--bad) ${Math.round(15 + (70 * n) / mx)}%, transparent)`, color: n / mx > 0.5 ? "#fff" : undefined } : undefined}>{n || ""}</td>;
                    })}
                    <td className="r num"><b>{inc4.filter((i) => i.causa === k).length}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Vacio titulo="Sin incumplimientos en las últimas 4 semanas" />}
      </div>
    </>
  );
}
