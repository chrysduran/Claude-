import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { crearEmpresa, limpiarTelefono, membresias, sb, unirse, type Membresia } from "../data/nube";
import { Toast } from "./comun";

const recordar = (k: string, v?: string) => {
  try {
    if (v === undefined) return localStorage.getItem(k) ?? "";
    localStorage.setItem(k, v);
  } catch { /* sin almacenamiento */ }
  return v ?? "";
};

/** Pantallas previas a la app en modo nube: iniciar sesión y elegir, crear o unirse a una empresa. */
export function Acceso({ children }: { children: (m: Membresia, cambiar: () => void, salir: () => void) => React.ReactNode }) {
  const [sesion, setSesion] = useState<Session | null | undefined>(undefined);
  const [lista, setLista] = useState<Membresia[] | null>(null);
  const [elegida, setElegida] = useState<string>(() => recordar("pulso-obra:empresa"));
  const [error, setError] = useState("");

  useEffect(() => {
    sb!.auth.getSession().then(({ data }) => setSesion(data.session));
    const { data } = sb!.auth.onAuthStateChange((_e, s) => setSesion(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // Al cargar las empresas, se borran del teléfono las copias de empresas de las que el usuario ya no es miembro.
  const cargar = () => membresias().then((l) => { limpiarTelefono(l.map((m) => m.empresaId)); setLista(l); }).catch(() => setError("No se pudieron cargar tus empresas. Revisa tu conexión y vuelve a abrir la app."));
  useEffect(() => { if (sesion) void cargar(); else setLista(null); }, [sesion?.user.id]);

  const salir = async () => {
    await sb!.auth.signOut().catch(() => {});
    limpiarTelefono([]); // nadie más que use este teléfono ve los datos de la empresa
    setElegida("");
    recordar("pulso-obra:empresa", "");
  };

  if (sesion === undefined) return <main className="bienvenida in"><p>Cargando…</p></main>;
  if (!sesion) return <IniciarSesion />;
  if (!lista) return <main className="bienvenida in"><p>{error || "Cargando tus empresas…"}</p></main>;

  const actual = lista.find((m) => m.empresaId === elegida) ?? (lista.length === 1 ? lista[0] : undefined);
  if (actual) {
    return <>{children(actual, () => { setElegida(""); recordar("pulso-obra:empresa", ""); void cargar(); }, salir)}</>;
  }
  return (
    <ElegirEmpresa
      lista={lista}
      email={sesion.user.email ?? ""}
      onElegir={(id) => { setElegida(id); recordar("pulso-obra:empresa", id); }}
      onListo={async (id) => { await cargar(); setElegida(id); recordar("pulso-obra:empresa", id); }}
      onSalir={salir}
    />
  );
}

function IniciarSesion() {
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const pedir = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) return setMsg("Escribe un correo válido.");
    setOcupado(true); setMsg("");
    const { error } = await sb!.auth.signInWithOtp({ email: e, options: { emailRedirectTo: location.origin } });
    setOcupado(false);
    if (error) return setMsg(error.message.includes("rate") ? "Espera un minuto antes de pedir otro código." : `No se pudo enviar el correo: ${error.message}`);
    setEnviado(true);
  };

  const verificar = async () => {
    setOcupado(true); setMsg("");
    const { error } = await sb!.auth.verifyOtp({ email: email.trim().toLowerCase(), token: codigo.trim(), type: "email" });
    setOcupado(false);
    if (error) setMsg(/rate|too many/i.test(error.message) ? "Demasiados intentos. Espera unos minutos." : "El código no es correcto o ya venció. Pide uno nuevo.");
  };

  return (
    <main className="bienvenida in">
      <img src="/icon.svg" alt="" width={72} height={72} />
      <h1>Pulso Obra</h1>
      <p className="lema">El pulso diario de tu obra.</p>
      {!enviado ? (
        <>
          <p>Escribe tu correo y te mandamos un código para entrar. No necesitas contraseña.</p>
          <label className="field"><span>Correo</span>
            <input type="email" autoComplete="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="send" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && pedir()} />
          </label>
          <button type="button" className="btn" disabled={ocupado} onClick={pedir}>{ocupado ? "Enviando…" : "Enviarme el código"}</button>
        </>
      ) : (
        <>
          <p>Te mandamos un código a <b>{email}</b>. Escríbelo aquí, o abre el enlace del correo en este teléfono.</p>
          <label className="field"><span>Código</span>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" enterKeyHint="go" maxLength={8} autoFocus value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && verificar()} />
          </label>
          <button type="button" className="btn" disabled={ocupado || codigo.length < 6} onClick={verificar}>{ocupado ? "Verificando…" : "Entrar"}</button>
          <button type="button" className="btn ghost" onClick={() => { setEnviado(false); setCodigo(""); }}>Usar otro correo</button>
        </>
      )}
      {msg && <p className="warnline">{msg}</p>}
      <p className="hint">Al entrar aceptas el <a href="/privacidad.html">aviso de privacidad</a>.</p>
      <Toast />
    </main>
  );
}

function ElegirEmpresa({ lista, email, onElegir, onListo, onSalir }: { lista: Membresia[]; email: string; onElegir: (id: string) => void; onListo: (id: string) => Promise<void>; onSalir: () => void }) {
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const hacer = async (fn: () => Promise<string>) => {
    setOcupado(true); setMsg("");
    try { await onListo(await fn()); } catch (e) { setMsg((e as Error).message); } finally { setOcupado(false); }
  };

  return (
    <main className="bienvenida in">
      <h1>Hola</h1>
      <p>Entraste como <b>{email}</b>.</p>
      {lista.length > 0 && (
        <div className="panel">
          <h2>Tus empresas</h2>
          {lista.map((m) => (
            <button type="button" key={m.empresaId} className="btn ghost" onClick={() => onElegir(m.empresaId)}>
              {m.nombre} · {m.rol === "admin" ? "Administrador" : m.rol === "supervisor" ? "Supervisor" : "Solo lectura"}
            </button>
          ))}
        </div>
      )}
      <div className="panel">
        <h2>Unirme a una empresa</h2>
        <p className="hint">Pídele a un administrador un código de invitación.</p>
        <div className="pl-nr">
          <input type="text" value={codigo} placeholder="Código de 8 caracteres" maxLength={8} autoCapitalize="characters" autoCorrect="off" spellCheck={false} onChange={(e) => setCodigo(e.target.value.toUpperCase())} />
          <button type="button" className="mini" disabled={ocupado || codigo.trim().length < 6} onClick={() => hacer(() => unirse(codigo))}>Unirme</button>
        </div>
      </div>
      <div className="panel">
        <h2>Crear mi empresa</h2>
        <p className="hint">Quedarás como administrador y podrás invitar a tu equipo.</p>
        <div className="pl-nr">
          <input type="text" value={nombre} placeholder="Nombre de la empresa" maxLength={120} onChange={(e) => setNombre(e.target.value)} />
          <button type="button" className="mini" disabled={ocupado || !nombre.trim()} onClick={() => hacer(() => crearEmpresa(nombre))}>Crear</button>
        </div>
      </div>
      {msg && <p className="warnline">{msg}</p>}
      <button type="button" className="btn ghost" onClick={onSalir}>Cerrar sesión</button>
    </main>
  );
}
