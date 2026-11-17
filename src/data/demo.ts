import type { BaseDatos, Causa, Proyecto } from "../types";
import { claveSemana, diasDeSemana, lunesDe, sumarDias } from "../lib/fechas";
import { uid } from "./store";

/** Catálogo inicial de causas de no cumplimiento. Cada proyecto puede editarlo. */
export const CAUSAS_BASE: Causa[] = [
  { codigo: "MAT", descripcion: "Material" },
  { codigo: "MO", descripcion: "Mano de obra insuficiente" },
  { codigo: "EQ", descripcion: "Equipo o herramienta" },
  { codigo: "INF", descripcion: "Información o diseño" },
  { codigo: "PRE", descripcion: "Actividad previa no terminada" },
  { codigo: "CLI", descripcion: "Decisión del cliente" },
  { codigo: "CLIMA", descripcion: "Clima" },
  { codigo: "PLAN", descripcion: "Error de planeación o sobrecarga" },
  { codigo: "CAL", descripcion: "Calidad o retrabajo" },
  { codigo: "SEG", descripcion: "Seguridad" },
  { codigo: "LOG", descripcion: "Logística o acceso al área" },
  { codigo: "OTRA", descripcion: "Otra causa" },
];

export const ESPECIALIDADES_BASE = ["Instalaciones", "Cancelería", "Tablaroca", "Pisos y acabados", "Albañilería", "Carpintería", "Herrería"];

export function proyectoNuevo(nombre: string): Proyecto {
  return {
    id: uid(),
    nombre,
    meta: 85,
    contratistas: [...ESPECIALIDADES_BASE],
    zonas: ["Sótano", "PB", ...Array.from({ length: 12 }, (_, i) => `N${i + 1}`), "Azotea", "Fachada", "General"],
    causas: CAUSAS_BASE.map((c) => ({ ...c })),
    creado: Date.now(),
  };
}

/** Proyecto de ejemplo con datos inventados para conocer la app. */
export function cargarDemo(db: BaseDatos, hoy: string): string {
  const p = proyectoNuevo("Proyecto demo · Torre residencial");
  db.proyectos.push(p);
  const lunes = lunesDe(hoy);
  const dias = diasDeSemana(lunes).filter((d) => d <= hoy);
  const planes = [5, 2, 4, 1, 8, 4, 2];
  // Historial de 7 semanas para que Análisis muestre tendencia y patrones (datos inventados).
  const causasHist = ["MAT", "PRE", "INF", "CAL", "LOG"];
  for (let w = 7; w >= 1; w--) {
    const l = sumarDias(lunes, -7 * w);
    diasDeSemana(l).forEach((f, di) =>
      p.contratistas.forEach((c, ci) => {
        db.conteos.push({ id: `${p.id}|${f}|${c}`, proyectoId: p.id, fecha: f, contratista: c, planeadas: planes[ci] + ((di + ci + w) % 2), actualizado: Date.now() });
        const fallas = ((w * 7 + di * 3 + ci * 5) % (w === 5 || w === 6 ? 3 : w === 4 ? 4 : 6) === 0 ? 1 : 0) + (w === 6 && di < 4 && ci !== 2 ? 1 : 0);
        const pisosRepite = c === "Pisos y acabados" && w <= 3 && di % 2 === 0;
        for (let k = 0; k < fallas + (pisosRepite ? 1 : 0); k++)
          db.incumplimientos.push({
            id: uid(), proyectoId: p.id, fecha: f, contratista: c, actividad: pisosRepite && k === fallas ? `Piso cerámico depto ${700 + di * 100 + ci}` : `Actividad ${di + 1}-${ci + 1}`,
            zona: `N${(di + ci) % 12 + 1}`, causa: pisosRepite && k === fallas ? "MO" : causasHist[(w + di + ci) % causasHist.length],
            notas: "", contramedida: "", responsable: "", fechaCompromiso: "", fotoId: "", creado: Date.now(), actualizado: Date.now(),
          });
      }),
    );
  }
  dias.forEach((f, di) =>
    p.contratistas.forEach((c, ci) =>
      db.conteos.push({ id: `${p.id}|${f}|${c}`, proyectoId: p.id, fecha: f, contratista: c, planeadas: planes[ci] + ((di + ci) % 2), actualizado: Date.now() }),
    ),
  );
  const incs: [number, string, string, string, string, string][] = [
    [0, "Pisos y acabados", "Piso cerámico depto 1204", "N12", "MO", "Reforzar cuadrilla con 2 oficiales"],
    [1, "Cancelería", "Aluminio depto 1101", "N11", "MAT", "Confirmar entrega con proveedor"],
    [1, "Pisos y acabados", "Franja de piso depto 905", "N9", "MO", ""],
    [2, "Tablaroca", "Plafón pasillo nivel 8", "N8", "PRE", "Liberar instalación eléctrica antes"],
    [3, "Instalaciones", "Pruebas hidráulicas depto 703", "N7", "CAL", "Revisión conjunta antes de la prueba"],
  ];
  incs.filter(([d]) => d < dias.length).forEach(([d, c, a, z, causa, cm], i) =>
    db.incumplimientos.push({
      id: uid(), proyectoId: p.id, fecha: dias[d], contratista: c, actividad: a, zona: z, causa, notas: "",
      contramedida: cm, responsable: cm ? "Residente" : "", fechaCompromiso: cm ? sumarDias(dias[d], 2) : "", fotoId: "", creado: Date.now() + i, actualizado: Date.now(),
    }),
  );
  const r = (n: number, asunto: string, zona: string, contratista: string, dias_: number, estado: "Abierta" | "En proceso" | "Liberada") =>
    db.restricciones.push({
      id: uid(), proyectoId: p.id, numero: n, asunto, detalle: "", zona, contratista, responsable: "Gerencia de obra",
      fechaIdentificada: sumarDias(hoy, -10), fechaCompromiso: sumarDias(hoy, dias_), fechaCierre: estado === "Liberada" ? sumarDias(hoy, -1) : "", estado, observaciones: "", actualizado: Date.now(),
    });
  r(1, "Definición de acabados en áreas comunes", "General", "Carpintería", 3, "En proceso");
  r(2, "Entrega de cancelería nivel 11", "N11", "Cancelería", -1, "Abierta");
  r(3, "Liberación de montacargas", "Fachada", "Albañilería", -2, "Liberada");
  const prox = claveSemana(sumarDias(lunes, 7));
  const acts = ["Tablaroca 1a cara", "Instalación eléctrica", "Tablaroca 2a cara", "Piso y azulejo", "Pintura 1a mano", "Cancelería", "Carpintería"];
  const esp = ["Tablaroca", "Instalaciones", "Tablaroca", "Pisos y acabados", "Tablaroca", "Cancelería", "Carpintería"];
  [7, 8, 9, 10].forEach((n) =>
    [1, 2, 3].forEach((d) =>
      [0, 1, 2].forEach((k) => {
        const j = (n + d + k * 2) % acts.length;
        db.plan.push({ id: uid(), proyectoId: p.id, semana: prox, grupo: `Nivel ${n}`, unidad: `${n}0${d}`, actividad: acts[j], especialidad: esp[j], retrasada: (n + d + k) % 9 === 0, decision: null, motivo: "", actualizado: Date.now() });
      }),
    ),
  );
  return p.id;
}
