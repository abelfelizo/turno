export const COLORS = {
  primary: '#1a1a2e',
  gold: '#C9A84C',
  success: '#2e7d32',
  successLight: '#e8f5e9',
  danger: '#c62828',
  dangerLight: '#ffebee',
  warning: '#e65100',
  warningLight: '#fff8e1',
  info: '#1565c0',
  infoLight: '#e3f2fd',
  purple: '#4527a0',
  purpleLight: '#ede7f6',
  bg: '#ffffff',
  surface: '#f8f8f8',
  border: '#f0f0f0',
  text: '#111111',
  textLight: '#888888',
}

export const KEYS = {
  USER_ID: 'turno_user_id',
  ROL: 'turno_rol',
  NEGOCIO_ID: 'turno_negocio_id',
  PERFIL_ID: 'turno_perfil_id',
}

export const ESTADOS_CITA = {
  creada: 'creada',
  confirmada: 'confirmada',
  no_confirmada: 'no_confirmada',
  en_camino: 'en_camino',
  atendida: 'atendida',
  no_llego: 'no_llego',
  cola_prioritaria: 'cola_prioritaria',
  cancelada: 'cancelada',
} as const

export const ESTADOS_COLA = {
  en_fila: 'en_fila',
  llamado: 'llamado',
  en_camino: 'en_camino',
  atendido: 'atendido',
  expirado: 'expirado',
  reinsertado: 'reinsertado',
  abandonado: 'abandonado',
} as const

export const PRIORIDAD_COLA = {
  cita_prioritaria: 1,
  digital: 2,
  fisica: 3,
} as const

export const TIEMPOS_DEFAULT = {
  anticipacion_minima_horas: 2,
  ventana_llegada_min: 10,
  gracia_cita_min: 5,
  aviso_turno_min: 20,
} as const
