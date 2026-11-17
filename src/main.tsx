import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { Recuperacion } from "./ui/Recuperacion";
import { hayVersionNueva } from "./ui/comun";
import "./styles.css";

// La versión nueva no se aplica sola (podría recargar la app a media captura): se avisa y el usuario decide.
const aplicar = registerSW({ immediate: true, onNeedRefresh: () => hayVersionNueva(() => void aplicar(true)) });

// Pide al navegador que no borre los datos guardados aunque la app pase días sin abrirse (importante en iPhone).
void navigator.storage?.persist?.().catch(() => {});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Recuperacion>
      <App />
    </Recuperacion>
  </StrictMode>,
);
