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
