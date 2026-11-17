import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
  compartir: "M12 15V3m0 0L8 7m4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1",
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

const sinMovimiento = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Hoja modal que sube desde abajo, con barra Cancelar / título / acción.
 * Se cierra con Cancelar, tocando fuera, con Escape o deslizándola hacia abajo. Si hay cambios sin guardar (`sucio`),
 * pide confirmar antes de descartarlos. Se acomoda sobre el teclado del teléfono y regresa el foco al cerrar.
 */
export function Hoja({ titulo, onCerrar, accion, onAccion, sucio = false, children }: { titulo: string; onCerrar: () => void; accion?: string; onAccion?: () => void; sucio?: boolean; children: React.ReactNode }) {
  const fondo = useRef<HTMLDivElement>(null);
  const hoja = useRef<HTMLElement>(null);
  const [confirmar, setConfirmar] = useState(false);
  const vivo = useRef({ onCerrar, sucio, confirmar, saliendo: false });
  vivo.current = { ...vivo.current, onCerrar, sucio, confirmar };

  const salir = () => {
    if (vivo.current.saliendo) return;
    vivo.current.saliendo = true;
    const h = hoja.current, f = fondo.current;
    if (!h || !f || sinMovimiento()) return vivo.current.onCerrar();
    h.style.transition = "transform .24s cubic-bezier(.4, 0, 1, 1)";
    h.style.transform = "translateY(100%)";
    f.style.transition = "background-color .24s ease";
    f.style.backgroundColor = "transparent";
    setTimeout(() => vivo.current.onCerrar(), 230);
  };
  /** Cierra; si hay cambios sin guardar, la primera vez solo pide confirmar. Devuelve si cerró. */
  const intentar = () => {
    if (vivo.current.sucio && !vivo.current.confirmar) { setConfirmar(true); return false; }
    salir();
    return true;
  };

  useEffect(() => {
    if (!confirmar) return;
    const t = setTimeout(() => setConfirmar(false), 4000);
    return () => clearTimeout(t);
  }, [confirmar]);

  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    const h = hoja.current!;
    h.focus({ preventScroll: true });
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); intentar(); }
      if (e.key !== "Tab") return;
      // El foco no se sale de la hoja.
      const focos = [...h.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href]")].filter((x) => !x.hasAttribute("disabled") && !x.hidden && (x as HTMLInputElement).type !== "file");
      if (!focos.length) return;
      const primero = focos[0], ultimo = focos[focos.length - 1];
      if (e.shiftKey && (document.activeElement === primero || document.activeElement === h)) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    };
    document.addEventListener("keydown", tecla);
    document.body.classList.add("con-hoja");
    // En el teléfono, la hoja ocupa solo la parte visible sobre el teclado.
    const vv = window.visualViewport;
    const ajustar = () => {
      const f = fondo.current;
      if (!f || !vv) return;
      f.style.height = `${vv.height}px`;
      f.style.top = `${vv.offsetTop}px`;
    };
    ajustar();
    vv?.addEventListener("resize", ajustar);
    vv?.addEventListener("scroll", ajustar);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.classList.remove("con-hoja");
      vv?.removeEventListener("resize", ajustar);
      vv?.removeEventListener("scroll", ajustar);
      antes?.focus?.({ preventScroll: true });
    };
  }, []);

  // Deslizar hacia abajo desde el asa o la barra para cerrar.
  const arrastre = useRef<{ y: number; t: number; dy: number } | null>(null);
  const alBajar = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    arrastre.current = { y: e.clientY, t: e.timeStamp, dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    hoja.current!.style.transition = "none";
  };
  const alMover = (e: React.PointerEvent) => {
    const a = arrastre.current;
    if (!a) return;
    a.dy = Math.max(0, e.clientY - a.y);
    hoja.current!.style.transform = `translateY(${a.dy}px)`;
  };
  const alSoltar = (e: React.PointerEvent) => {
    const a = arrastre.current;
    if (!a) return;
    arrastre.current = null;
    const rapido = a.dy / Math.max(1, e.timeStamp - a.t) > 0.55 && a.dy > 30;
    if ((a.dy > 120 || rapido) && intentar()) return;
    const h = hoja.current!;
    h.style.transition = "transform .28s cubic-bezier(.2, .9, .25, 1)";
    h.style.transform = "";
  };

  return (
    <div className="hoja-fondo" ref={fondo} onClick={(e) => e.target === e.currentTarget && intentar()}>
      <section className="hoja" ref={hoja} role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1}>
        <div className="hoja-agarre" onPointerDown={alBajar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={alSoltar}>
          <div className="hoja-asa" />
          <header className="hoja-barra">
            <button type="button" className={`txt-btn ${confirmar ? "peligro" : ""}`} onClick={intentar}>{confirmar ? "Descartar" : "Cancelar"}</button>
            <b>{titulo}</b>
            {accion && onAccion ? <button type="button" className="txt-btn fuerte" onClick={onAccion}>{accion}</button> : <span />}
          </header>
        </div>
        {confirmar && <p className="hoja-aviso" role="alert">Hay cambios sin guardar. Toca Descartar para salir sin guardarlos.</p>}
        <div className="hoja-cuerpo">{children}</div>
      </section>
    </div>
  );
}

/* ---------- Estado del teléfono: conexión, versión nueva e instalación ---------- */

const suscribirRed = (f: () => void) => {
  window.addEventListener("online", f);
  window.addEventListener("offline", f);
  return () => { window.removeEventListener("online", f); window.removeEventListener("offline", f); };
};
/** ¿El teléfono tiene conexión? */
export const useEnLinea = () => useSyncExternalStore(suscribirRed, () => navigator.onLine, () => true);

let aplicarVersion: (() => void) | null = null;
const oyentesVersion = new Set<() => void>();
/** La app avisa que hay una versión nueva en lugar de recargarse sola a media captura. */
export function hayVersionNueva(aplicar: () => void) {
  aplicarVersion = aplicar;
  oyentesVersion.forEach((o) => o());
}

interface EventoInstalar extends Event { prompt: () => Promise<unknown> }
let instalar: EventoInstalar | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); instalar = e as EventoInstalar; oyentesVersion.forEach((o) => o()); });
  window.addEventListener("appinstalled", () => { instalar = null; oyentesVersion.forEach((o) => o()); });
}

const instalada = () => matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const CLAVE_AVISO = "pulso-obra:aviso-instalar";

/** Avisos discretos arriba del contenido: versión nueva lista, o cómo instalar la app en el teléfono. */
export function Avisos() {
  useSyncExternalStore((o) => (oyentesVersion.add(o), () => oyentesVersion.delete(o)), () => `${!!aplicarVersion}${!!instalar}`);
  const [oculto, setOculto] = useState(() => { try { return localStorage.getItem(CLAVE_AVISO) === "1"; } catch { return false; } });
  const ocultar = () => { setOculto(true); try { localStorage.setItem(CLAVE_AVISO, "1"); } catch { /* sin almacenamiento */ } };

  if (aplicarVersion) {
    return (
      <div className="aviso" role="status">
        <span><b>Hay una versión nueva.</b> Actualiza cuando termines lo que estás capturando.</span>
        <button type="button" className="mini" onClick={() => aplicarVersion?.()}>Actualizar</button>
      </div>
    );
  }
  if (oculto || instalada()) return null;
  if (instalar) {
    return (
      <div className="aviso">
        <span><b>Instala Pulso Obra.</b> Ábrela desde tu pantalla de inicio, también sin señal.</span>
        <button type="button" className="mini" onClick={() => { void instalar?.prompt(); ocultar(); }}>Instalar</button>
        <button type="button" className="aviso-x" aria-label="Cerrar aviso" onClick={ocultar}>×</button>
      </div>
    );
  }
  if (esIOS()) {
    return (
      <div className="aviso">
        <span><b>Instala Pulso Obra en tu iPhone.</b> En Safari toca Compartir <Icono n="compartir" tam={16} /> y luego «Agregar a inicio».</span>
        <button type="button" className="aviso-x" aria-label="Cerrar aviso" onClick={ocultar}>×</button>
      </div>
    );
  }
  return null;
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
