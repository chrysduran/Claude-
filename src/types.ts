/** Modelo de datos de Bitácora LPS. Todo pertenece a un proyecto; los catálogos son configurables por proyecto. */

export interface Causa {
  codigo: string;
  descripcion: string;
}

export interface Proyecto {
  id: string;
  nombre: string;
  meta: number; // meta de PPC en %
  contratistas: string[];
  zonas: string[];
  causas: Causa[];
  creado: number;
}

/** Actividades planeadas por contratista en un día. */
export interface Conteo {
  id: string; // `${proyectoId}|${fecha}|${contratista}`
  proyectoId: string;
  fecha: string; // AAAA-MM-DD
  contratista: string;
  planeadas: number;
  actualizado: number;
}

export interface Incumplimiento {
  id: string;
  proyectoId: string;
  fecha: string;
  contratista: string;
  actividad: string;
  zona: string;
  causa: string; // código de la causa
  notas: string;
  contramedida: string;
  responsable: string;
  fechaCompromiso: string;
  fotoId: string; // referencia a la foto guardada en el dispositivo
  creado: number;
  actualizado: number;
}

export type EstadoRestriccion = "Abierta" | "En proceso" | "Liberada";

export interface Restriccion {
  id: string;
  proyectoId: string;
  numero: number;
  asunto: string;
  detalle: string;
  zona: string;
  contratista: string;
  responsable: string;
  fechaIdentificada: string;
  fechaCompromiso: string;
  fechaCierre: string;
  estado: EstadoRestriccion;
  observaciones: string;
  actualizado: number;
}

export type Decision = "si" | "no" | null;

/** Actividad candidata para la planeación de una semana (importada del plan maestro o agregada a mano). */
export interface ActividadPlan {
  id: string;
  proyectoId: string;
  semana: string; // AAAA-Www (semana ISO)
  grupo: string; // nivel, frente o área
  unidad: string; // departamento, tramo, eje…
  actividad: string;
  especialidad: string;
  retrasada: boolean;
  decision: Decision;
  motivo: string;
  actualizado: number;
}

export interface Narracion {
  id: string; // `${proyectoId}|${semana}|${contratista}`
  proyectoId: string;
  semana: string;
  contratista: string;
  notas: string;
  actualizado: number;
}

export interface BaseDatos {
  version: 1;
  proyectos: Proyecto[];
  conteos: Conteo[];
  incumplimientos: Incumplimiento[];
  restricciones: Restriccion[];
  plan: ActividadPlan[];
  narracion: Narracion[];
}
