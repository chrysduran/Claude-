import { useEffect, useState } from "react";
import { cambiarRol, crearInvitacion, hayDatosLocales, importarLocales, miembros, quitarMiembro, type Membresia, type Miembro, type Rol } from "../data/nube";
import { BotonConfirmar, toast } from "./comun";

const NOMBRE_ROL: Record<Rol, string> = { admin: "Administrador", supervisor: "Supervisor", lectura: "Solo lectura" };

/** Sección de Ajustes en modo nube: empresa, equipo, invitaciones y sesión. */
export function Equipo({ m, usuarioEmail, onCambiarEmpresa, onSalir }: { m: Membresia; usuarioEmail: string; onCambiarEmpresa: () => void; onSalir: () => void }) {
  const [lista, setLista] = useState<Miembro[]>([]);
  const [rolInv, setRolInv] = useState<Rol>("supervisor");
  const [codigo, setCodigo] = useState("");
  const esAdmin = m.rol === "admin";

  const cargar = () => miembros(m.empresaId).then(setLista).catch(() => toast("No se pudo cargar el equipo. Revisa tu conexión."));
  useEffect(() => { void cargar(); }, [m.empresaId]);

  const invitar = async () => {
    try { setCodigo(await crearInvitacion(m.empresaId, rolInv)); } catch (e) { toast((e as Error).message); }
  };

  const copiar = async () => {
    const texto = `Te invito a ${m.nombre} en Pulso Obra. Entra a ${location.origin}, inicia sesión con tu correo y usa el código ${codigo} (vale 7 días).`;
    try { await navigator.clipboard.writeText(texto); toast("Invitación copiada"); } catch { toast(`Código: ${codigo}`); }
  };

  return (
    <div className="panel">
      <span className="lab">Empresa</span>
      <h2>{m.nombre}</h2>
      <p className="hint">Entraste como {usuarioEmail} · {NOMBRE_ROL[m.rol]}</p>

      <span className="lab">Equipo</span>
      {lista.map((x) => (
        <div className="pl-nr" key={x.usuarioId}>
          <span className="miembro">{x.email || "Usuario"}</span>
          {esAdmin && x.email !== usuarioEmail ? (
            <>
              <select aria-label={`Rol de ${x.email}`} value={x.rol} onChange={async (e) => { try { await cambiarRol(m.empresaId, x.usuarioId, e.target.value as Rol); void cargar(); } catch (er) { toast((er as Error).message); } }}>
                {(Object.keys(NOMBRE_ROL) as Rol[]).map((r) => <option key={r} value={r}>{NOMBRE_ROL[r]}</option>)}
              </select>
              <BotonConfirmar className="mini" onConfirm={async () => { try { await quitarMiembro(m.empresaId, x.usuarioId); void cargar(); } catch (er) { toast((er as Error).message); } }}>Quitar</BotonConfirmar>
            </>
          ) : <span className="hint">{NOMBRE_ROL[x.rol]}</span>}
        </div>
      ))}

      {esAdmin && (
        <>
          <span className="lab">Invitar</span>
          <div className="pl-nr">
            <select aria-label="Rol de la invitación" value={rolInv} onChange={(e) => setRolInv(e.target.value as Rol)}>
              {(Object.keys(NOMBRE_ROL) as Rol[]).map((r) => <option key={r} value={r}>{NOMBRE_ROL[r]}</option>)}
            </select>
            <button type="button" className="mini" onClick={invitar}>Generar código</button>
          </div>
          {codigo && (
            <div className="codigo-inv">
              <b className="num">{codigo}</b>
              <span className="hint">Vale 7 días y un solo uso.</span>
              <button type="button" className="mini" onClick={copiar}>Copiar invitación</button>
            </div>
          )}
          <p className="hint">Supervisor: captura y edita. Solo lectura: consulta. Administrador: además configura proyectos e invita.</p>
        </>
      )}

      {esAdmin && hayDatosLocales() && (
        <>
          <span className="lab">Datos de este teléfono</span>
          <p className="hint">Antes de usar la nube capturaste proyectos solo en este teléfono. Puedes copiarlos a la empresa para que tu equipo los vea.</p>
          <button type="button" className="btn ghost" onClick={() => { const n = importarLocales(); toast(n ? `${n} proyecto(s) copiados a ${m.nombre}` : "Esos proyectos ya están en la empresa"); }}>Copiar mis proyectos a la empresa</button>
        </>
      )}

      <div className="actions">
        <button type="button" className="btn ghost grow" onClick={onCambiarEmpresa}>Cambiar de empresa</button>
        <button type="button" className="btn ghost grow" onClick={onSalir}>Cerrar sesión</button>
      </div>
    </div>
  );
}
