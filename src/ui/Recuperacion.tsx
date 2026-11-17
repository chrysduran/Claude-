import { Component, type ReactNode } from "react";

/** Si algo falla al dibujar, en vez de una pantalla en blanco se ofrece recargar y descargar un respaldo de emergencia. */
export class Recuperacion extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  respaldo = () => {
    const datos: Record<string, unknown> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (k.startsWith("bitacora-lps") || k.startsWith("pulso-obra")) datos[k] = localStorage.getItem(k);
      }
    } catch { /* sin acceso al almacenamiento */ }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 1)], { type: "application/json" }));
    a.download = `pulso-obra-emergencia-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="bienvenida in">
        <h1>Algo salió mal</h1>
        <p>Tus datos siguen guardados en este teléfono. Recarga la app; si el problema sigue, descarga el respaldo de emergencia y envíalo a soporte.</p>
        <button type="button" className="btn" onClick={() => location.reload()}>Recargar</button>
        <button type="button" className="btn ghost" onClick={this.respaldo}>Descargar respaldo de emergencia</button>
        <p className="hint">Detalle: {this.state.error.message}</p>
      </main>
    );
  }
}
