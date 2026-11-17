import { useEffect, useState } from "react";
import { formato, nivel } from "../lib/ppc";
import { leerFoto } from "../data/store";

export function Medidor({ ppc, meta }: { ppc: number | null; meta: number }) {
  return (
    <div className="meter">
      <i className={ppc == null ? "" : `bg-${nivel(ppc, meta)}`} style={{ width: `${ppc ?? 0}%` }} />
      <span className="goal" style={{ left: `${meta}%` }} title={`Meta ${meta} %`} />
    </div>
  );
}

export function Ppc({ ppc, meta, className = "" }: { ppc: number | null; meta: number; className?: string }) {
  return <span className={`num lv-${nivel(ppc, meta)} ${className}`}>{formato(ppc)}</span>;
}

export function Vacio({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <b>{titulo}</b>
      {children}
    </div>
  );
}

export function Foto({ id }: { id: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let u = "";
    leerFoto(id).then((b) => b && setUrl((u = URL.createObjectURL(b))));
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [id]);
  return url ? <img className="foto-img" src={url} alt="Evidencia" /> : null;
}

let avisar: (m: string) => void = () => {};
export const toast = (m: string) => avisar(m);

export function Toast() {
  const [msg, setMsg] = useState("");
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    avisar = (m) => { setMsg(m); clearTimeout(t); t = setTimeout(() => setMsg(""), 2600); };
  }, []);
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}

/** Botón que pide un segundo toque para confirmar (sin diálogos del navegador). */
export function BotonConfirmar({ children, onConfirm, className = "btn danger" }: { children: React.ReactNode; onConfirm: () => void; className?: string }) {
  const [armado, setArmado] = useState(false);
  useEffect(() => {
    if (!armado) return;
    const t = setTimeout(() => setArmado(false), 4000);
    return () => clearTimeout(t);
  }, [armado]);
  return (
    <button type="button" className={className} onClick={() => (armado ? (setArmado(false), onConfirm()) : setArmado(true))}>
      {armado ? "¿Seguro? Toca otra vez" : children}
    </button>
  );
}

/* ---------- Componentes con estilo iOS ---------- */

const TRAZOS: Record<string, string> = {
  hoy: "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4 9 2 2 4-4",
  planear: "M9 4h6M9 4a1 1 0 0 0-1 1v1h8V5a1 1 0 0 0-1-1M8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2M9 11h6M9 15h4",
  restric: "M12 4 3 19h18L12 4Zm0 6v4m0 3v.01",
  reporte: "M5 20V11M12 20V5M19 20v-7M3 20h18",
  ajustes: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z",
  izq: "m15 5-7 7 7 7",
  der: "m9 5 7 7-7 7",
  mas: "M12 5v14M5 12h14",
  nube: "M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9H7Z",
};

export function Icono({ n, tam = 24 }: { n: keyof typeof TRAZOS | string; tam?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={TRAZOS[n]} />
    </svg>
  );
}

/** Anillo de progreso al estilo de los anillos de actividad. */
export function Anillo({ ppc, meta, tam = 120, grosor = 14, etiqueta }: { ppc: number | null; meta: number; tam?: number; grosor?: number; etiqueta?: string }) {
  const r = (tam - grosor) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, ppc ?? 0));
  return (
    <div className="anillo" style={{ width: tam, height: tam }}>
      <svg width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`} aria-hidden="true">
        <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke="var(--fill)" strokeWidth={grosor} />
        <circle className={`arco st-${nivel(ppc, meta)}`} cx={tam / 2} cy={tam / 2} r={r} fill="none" strokeWidth={grosor} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} transform={`rotate(-90 ${tam / 2} ${tam / 2})`} />
      </svg>
      <div className="anillo-txt">
        <b className={`num lv-${nivel(ppc, meta)}`}>{formato(ppc)}</b>
        {etiqueta && <span>{etiqueta}</span>}
      </div>
    </div>
  );
}

/** Hoja modal que sube desde abajo, con barra Cancelar / título / acción. */
export function Hoja({ titulo, onCerrar, accion, onAccion, children }: { titulo: string; onCerrar: () => void; accion?: string; onAccion?: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", esc);
    document.body.classList.add("con-hoja");
    return () => { document.removeEventListener("keydown", esc); document.body.classList.remove("con-hoja"); };
  }, [onCerrar]);
  return (
    <div className="hoja-fondo" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <section className="hoja" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="hoja-asa" />
        <header className="hoja-barra">
          <button type="button" className="txt-btn" onClick={onCerrar}>Cancelar</button>
          <b>{titulo}</b>
          {accion && onAccion ? <button type="button" className="txt-btn fuerte" onClick={onAccion}>{accion}</button> : <span />}
        </header>
        <div className="hoja-cuerpo">{children}</div>
      </section>
    </div>
  );
}

export function Segmentado<T extends string>({ opciones, valor, onCambio }: { opciones: [T, string][]; valor: T; onCambio: (v: T) => void }) {
  return (
    <div className="segmentado" role="tablist">
      {opciones.map(([v, t]) => (
        <button type="button" role="tab" key={v} aria-selected={v === valor} onClick={() => onCambio(v)}>{t}</button>
      ))}
    </div>
  );
}
