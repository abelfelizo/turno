// Login de producción: alta por correo con código OTP. El antiguo "modo prueba"
// (cuenta fija dev@turno.test) se eliminó por seguridad — daba acceso de dueño a
// cualquiera con el APK. Para cambiar de panel se usa <CambiarRol />.

// ─────────────────────────────────────────────────────────────────
// Sistema visual TURNO (reemplaza NAVAJA por completo).
// Regla: neutros puros (blanco/negro) dominan. Rojo y azul SOLO como acento.
// Los nombres "compat" existen para no romper pantallas antiguas; apuntan a
// valores del sistema nuevo. No los uses en código nuevo.
// ─────────────────────────────────────────────────────────────────

const light = {
  bg: '#FFFFFF',
  surface: '#F4F4F4',
  ink: '#0B0B0C',
  text2: '#5C5C5C',
  text3: '#6B6B6B',
  disabled: '#B5B5B5',
  border: '#E6E6E6',
  divider: '#F0F0F0',
  tabBorder: '#EDEDED',
  red: '#E1251B',
  redText: '#C21D14',
  blue: '#1E4FD8',
  green: '#1F9D55',
  onInk: '#FFFFFF',
  onInkMuted: '#B5B5B5',
  inkDivider: '#3A3A3A',
  inkPill: '#1F1F1F',
}

const dark: typeof light = {
  bg: '#0B0B0C',
  surface: '#1A1A1A',
  ink: '#FFFFFF',
  text2: '#A3A3A3',
  text3: '#A3A3A3',
  disabled: '#5C5C5C',
  border: '#2A2A2A',
  divider: '#1F1F1F',
  tabBorder: '#1F1F1F',
  red: '#FF5A4F',
  redText: '#FF5A4F',
  blue: '#6E93FF',
  green: '#34C77B',
  onInk: '#0B0B0C',
  onInkMuted: '#5C5C5C',
  inkDivider: '#E6E6E6',
  inkPill: '#F4F4F4',
}

export const THEME = { light, dark }
export type Theme = typeof light

export const COLORS = {
  ...light,
  // ── compat NAVAJA → TURNO (no usar en código nuevo) ──
  redDark: light.redText,
  redLight: light.surface,
  blueLight: light.surface,
  carbon: light.ink,
  carbonEl: '#1A1A1A',
  carbonBorder: '#2A2A2A',
  primary: light.ink,
  gold: light.red,
  purple: light.ink,
  purpleLight: light.surface,
  text: light.ink,
  textMid: light.text2,
  textLight: light.text3,
  line: light.border,
  canvas: light.bg,
  surfaceAlt: light.surface,
  borderSoft: light.divider,
  success: light.green,
  successLight: light.surface,
  danger: light.redText,
  dangerLight: light.surface,
  warning: light.text2,
  warningLight: light.surface,
  info: light.blue,
  infoLight: light.surface,
}

// Tipografía PROVISIONAL. El cliente definirá la familia final:
// cambia SOLO estas líneas. No uses Anton ni Plus Jakarta Sans.
export const FONTS = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  bold: 'Geist_700Bold',
  mono: 'GeistMono_500Medium',
  monoBold: 'GeistMono_700Bold',
  // compat
  display: 'Geist_700Bold',
  extrabold: 'Geist_700Bold',
} as const

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const
export const SCREEN_PADDING = 20
export const SECTION_GAP = 22

// Radio por defecto = 8 para TODO (botones, cards, chips, inputs, tickets).
export const RADIUS = { sm: 8, md: 8, lg: 8, xl: 8, pill: 999 } as const

export const TYPE = {
  number: { fontFamily: FONTS.monoBold, fontSize: 112, letterSpacing: -4, lineHeight: 112 },
  h1: { fontFamily: FONTS.bold, fontSize: 28, letterSpacing: -0.6 },
  h2: { fontFamily: FONTS.bold, fontSize: 40, letterSpacing: -1 },
  title: { fontFamily: FONTS.semibold, fontSize: 18 },
  body: { fontFamily: FONTS.regular, fontSize: 15 },
  bodyStrong: { fontFamily: FONTS.semibold, fontSize: 15 },
  meta: { fontFamily: FONTS.regular, fontSize: 13 },
  overline: { fontFamily: FONTS.bold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  tab: { fontFamily: FONTS.semibold, fontSize: 11 },
} as const

// compat
export const FONT = {
  display: TYPE.h1,
  title: TYPE.title,
  subtitle: TYPE.bodyStrong,
  body: TYPE.body,
  caption: TYPE.meta,
  label: TYPE.overline,
} as const

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

// Color de texto por estado (listas). Heros de pantalla: ver components/ui.tsx → StatusHero.
export const ESTADO_COLOR: Record<string, keyof Theme> = {
  en_fila: 'text3',
  llamado: 'red',
  en_camino: 'blue',
  en_silla: 'red',
  atendido: 'text3',
  atendida: 'text3',
  expirado: 'disabled',
  abandonado: 'disabled',
  reinsertado: 'text3',
  creada: 'text3',
  confirmada: 'ink',
  no_confirmada: 'text3',
  no_llego: 'redText',
  cola_prioritaria: 'ink',
  cancelada: 'disabled',
  disponible: 'green',
  descanso: 'text3',
}

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

// ── Suscripción (modelo "por asiento, con piso y tope") ───────────
// ⚠️ MONTOS PLACEHOLDER: ajústalos a tu mercado.
export const SUSCRIPCION = {
  minimo: 500,
  maximo: 2000,
  moneda: 'RD$',
  periodo: 'mes',
  dias_prueba: 30,
} as const
