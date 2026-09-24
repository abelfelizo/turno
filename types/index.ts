// ==================== ROLES ====================
export type RolUsuario = 'dueno' | 'barbero_renta' | 'empleado' | 'cliente'
export type TipoServicio = 'barbero' | 'manicuri_pedicuri' | 'masajista' | 'facial'

/**
 * CÓMO SE LLAMA CADA OFICIO, EN UN SOLO SITIO.
 *
 * Antes esto vivía escrito a mano en cuatro pantallas: el selector del
 * onboarding del profesional, el del negocio, el mapa `TIPO` del dashboard del
 * dueño y un ternario en sus estadísticas. Con dos oficios se aguantaba; al
 * añadir masajista y facial, cuatro copias son cuatro sitios donde olvidarse
 * de uno — y olvidarse aquí no da error, solo deja la pantalla en blanco o
 * diciendo "Barbería" de una masajista.
 *
 * `nombre` es cómo se le llama a la PERSONA ("¿a qué te dedicas?") y `local`
 * cómo se llama al NEGOCIO ("¿qué se hace aquí?"), que no siempre es lo mismo:
 * quien corta el pelo es barbero y su local es una barbería.
 */
export const OFICIOS: { id: TipoServicio; nombre: string; local: string; desc?: string }[] = [
  { id: 'barbero',          nombre: 'Barbería',           local: 'Barbería',       desc: 'Cortes, barba, arreglos.' },
  { id: 'manicuri_pedicuri', nombre: 'Manicure / Pedicure', local: 'Uñas & Spa',     desc: 'Manos, pies o las dos cosas.' },
  { id: 'masajista',        nombre: 'Masajes',            local: 'Masajes',        desc: 'Masaje y relajación.' },
  { id: 'facial',           nombre: 'Faciales',           local: 'Estética facial', desc: 'Limpieza y tratamientos de cara.' },
]

/** El nombre del oficio de una persona. Nunca devuelve vacío. */
export function nombreOficio(t?: string | null) {
  return OFICIOS.find(o => o.id === t)?.nombre ?? 'Servicio'
}
export type TipoNegocio = 'espacios_rentados' | 'empleados'
export type EstadoActual = 'disponible' | 'ocupado' | 'descanso' | 'inactivo'

// ==================== ESTADOS ====================
export type EstadoCita = 'creada' | 'confirmada' | 'no_confirmada' | 'en_camino' | 'atendida' | 'no_llego' | 'cola_prioritaria' | 'cancelada'
export type EstadoCola = 'en_fila' | 'llamado' | 'en_camino' | 'atendido' | 'expirado' | 'reinsertado' | 'abandonado'
export type TipoCola = 'digital' | 'fisica'
export type PrioridadCola = 1 | 2 | 3

// ==================== ENTIDADES ====================
export interface Negocio {
  id: string
  nombre: string
  tipo: TipoNegocio
  codigo_acceso: string
  moneda: string
  direccion?: string
  telefono?: string
  activo: boolean
  created_at: string
}

export interface Usuario {
  id: string
  nombre: string
  telefono: string
  tipo_usuario: 'profesional' | 'cliente'
  no_shows: number
  llegadas_tarde: number
  abandonos: number
  created_at: string
}

export interface Perfil {
  id: string
  usuario_id: string
  negocio_id: string
  tipo_servicio: TipoServicio
  foto_url?: string
  activo: boolean
  aprobado: boolean
  domicilio_activo: boolean
  estado_actual: EstadoActual
  usuario?: Usuario
  negocio?: Negocio
}

export interface Servicio {
  id: string
  perfil_id: string
  nombre: string
  duracion_min: number
  precio: number
  activo: boolean
}

export interface Horario {
  id: string
  perfil_id: string
  dia_semana: number
  hora_inicio: string
  hora_fin: string
  tiempo_entre_clientes: number
  activo: boolean
}

export interface Cita {
  id: string
  perfil_id: string
  cliente_id: string
  negocio_id: string
  servicio_id: string
  grupo_id?: string
  fecha: string
  hora_inicio: string
  hora_fin: string
  estado: EstadoCita
  confirmada_at?: string
  en_camino_at?: string
  llegada_at?: string
  atendida_at?: string
  cancelada_by?: 'cliente' | 'barbero' | 'sistema'
  perfil?: Perfil
  cliente?: Usuario
  servicio?: Servicio
}

export interface Cola {
  id: string
  negocio_id: string
  perfil_id?: string
  cliente_id: string
  servicio_id: string
  grupo_id?: string
  tipo_cola: TipoCola
  prioridad: PrioridadCola
  posicion: number
  estado: EstadoCola
  cita_origen_id?: string
  llamado_at?: string
  en_camino_at?: string
  atendido_at?: string
  expira_at?: string
  created_at: string
  cliente?: Usuario
  servicio?: Servicio
  perfil?: Perfil
}

export interface PreferenciasCliente {
  id: string
  usuario_id: string
  negocio_id: string
  perfil_preferido_id?: string
  tipo_corte?: string
  largo?: string
  barba?: string
  alergias?: string
  notas?: string
  foto_referencia_url?: string
}

export interface ConfiguracionNegocio {
  id: string
  negocio_id: string
  anticipacion_minima_horas: number
  ventana_llegada_min: number
  gracia_cita_min: number
  puntos_activos: boolean
  puntos_por_visita?: number
  visitas_para_gratis?: number
  asignacion_por_dueno: boolean
  doble_servicio_activo: boolean
}

export interface Grupo {
  id: string
  negocio_id: string
  lider_id: string
  mismo_barbero: boolean
  perfil_id?: string
  total_personas: number
  personas_presentes?: number
  confirmado_parcial: boolean
  ajustado_por?: 'lider' | 'barbero'
  estado: 'en_espera' | 'siendo_atendido' | 'completado' | 'cancelado'
}

export interface HistorialVisita {
  id: string
  perfil_id: string
  cliente_id: string
  negocio_id: string
  servicio_id: string
  precio_cobrado: number
  origen: 'cita' | 'cola_digital' | 'cola_fisica' | 'cola_prioritaria'
  duracion_real_min?: number
  fecha: string
  perfil?: Perfil
  servicio?: Servicio
}

// ==================== SESION LOCAL ====================
/** Panel activo. Un dueño que atiende tiene UNA membresía pero DOS paneles:
 *  el del negocio ("barberia") y el de su propia silla ("silla"). */
export type PanelActivo = 'cliente' | 'barberia' | 'silla'

export interface SesionLocal {
  usuario_id: string
  perfil_id?: string
  negocio_id?: string
  rol: RolUsuario
  panel?: PanelActivo
}
