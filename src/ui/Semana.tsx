import type { Proyecto } from "../types";
import { actualizar, useDatos } from "../data/store";
import { claveSemana, corta, DIAS, diasDeSemana } from "../lib/fechas";
import { calcular, formato, nivel } from "../lib/ppc";
import { excelSemana } from "../lib/exportar";
import { Medidor, toast, Vacio } from "./comun";

export function Semana({ p, lunes, dia }: { p: Proyecto; lunes: string; dia: string }) {
  const db = useDatos();
  const dias = diasDeSemana(lunes);
  const semana = claveSemana(lunes);
  const conteos = db.conteos.filter((c) => c.proyectoId === p.id);
  const incs = db.incumplimientos.filter((i) => i.proyectoId === p.id);
  const incSem = incs.filter((i) => dias.includes(i.fecha));
  const porC = p.contratistas.map((c) => ({ c, ...calcular(conteos, incs, dias, [c]) })).filter((x) => x.planeadas).sort((a, b) => (a.ppc ?? 101) - (b.ppc ?? 101));
  const cuenta: Record<string, number> = {};
  incSem.forEach((i) => (cuenta[i.causa] = (cuenta[i.causa] || 0) + 1));
  const causas = Object.entries(cuenta).sort((a, b) => b[1] - a[1]);
  const desc = (cod: string) => p.causas.find((c) => c.codigo === cod)?.descripcion ?? cod;
  const notas = (c: string) => db.narracion.find((n) => n.id === `${p.id}|${semana}|${c}`)?.notas ?? "";

  const descargar = async () => {
    try {
      const blob = await excelSemana(db, p, lunes);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Pulso_Obra_${p.nombre.replace(/[^\w]+/g, "_")}_${semana}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch {
      toast("No se pudo generar el Excel.");
    }
  };

  return (
    <>
      <div className="panel">
        <h2>PPC diario</h2>
        <div className="scroll">
          <table className="t">
            <thead><tr><th>Día</th><th className="r">Plan.</th><th className="r">Cumpl.</th><th className="r">Inc.</th><th className="r">PPC</th></tr></thead>
            <tbody>
              {dias.map((d, i) => {
                const r = calcular(conteos, incs, [d], p.contratistas);
                return (
                  <tr key={d} className={d === dia ? "sel" : ""}>
                    <td>{DIAS[i]} {corta(d)}</td><td className="r num">{r.planeadas}</td><td className="r num">{r.cumplidas}</td><td className="r num">{r.incumplidas}</td>
                    <td className="r"><b className={`num lv-${nivel(r.ppc, p.meta)}`}>{formato(r.ppc)}</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel">
        <h2>PPC por contratista</h2>
        {porC.length ? (
          <div className="bars">
            {porC.map((x) => (
              <div className="barrow" key={x.c}>
                <span>{x.c}</span>
                <span className={`v num lv-${nivel(x.ppc, p.meta)}`}>{formato(x.ppc)} <small>{x.cumplidas}/{x.planeadas}</small></span>
                <Medidor ppc={x.ppc} meta={p.meta} />
              </div>
            ))}
          </div>
        ) : <Vacio titulo="Sin actividades esta semana">Captura las planeadas por día en Captura.</Vacio>}
      </div>
      <div className="panel">
        <h2>Causas de no cumplimiento · {incSem.length}</h2>
        {causas.length ? (
          <div className="bars">
            {causas.map(([c, n]) => (
              <div className="barrow" key={c}>
                <span><span className="code">{c}</span> {desc(c)}</span>
                <span className="v num">{n} <small>{Math.round((n / incSem.length) * 100)}%</small></span>
                <div className="meter"><i style={{ width: `${(n / causas[0][1]) * 100}%`, background: "var(--ink)" }} /></div>
              </div>
            ))}
          </div>
        ) : <Vacio titulo="Sin incumplimientos esta semana" />}
      </div>
      <div className="panel">
        <h2>Seguimiento por contratista</h2>
        <p className="hint">Lo que se hizo y lo que faltó en la semana. Se guarda al salir del cuadro.</p>
        {p.contratistas.filter((c) => calcular(conteos, incs, dias, [c]).planeadas || notas(c)).map((c) => (
          <label className="field" key={c}>
            <span>{c}</span>
            <textarea defaultValue={notas(c)} rows={3} onBlur={(e) => {
              const v = e.target.value.trim();
              if (v === notas(c)) return;
              const id = `${p.id}|${semana}|${c}`;
              actualizar((d) => { d.narracion = [...d.narracion.filter((n) => n.id !== id), { id, proyectoId: p.id, semana, contratista: c, notas: v, actualizado: Date.now() }]; });
              toast("Seguimiento guardado");
            }} />
          </label>
        ))}
      </div>
      <button type="button" className="btn" onClick={descargar}>Descargar Excel de la semana</button>
      {calcular(conteos, incs, dias, p.contratistas).planeadas === 0 && <p className="hint">El Excel incluye incumplimientos, PPC diario, PPC por contratista, restricciones y la planeación de la semana siguiente.</p>}
    </>
  );
}
