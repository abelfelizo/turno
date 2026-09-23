// Login de producción: alta por correo con código OTP. El antiguo "modo prueba"
// (cuenta fija dev@turno.test) se eliminó por seguridad — daba acceso de dueño a
// cualquiera con el APK. Para cambiar de panel se usa <CambiarRol />.

// SISTEMA VISUAL TURNO — handoff v3 (docs/diseno-turno-v3/README.md).
//
// Regla: neutros puros (blanco/negro) dominan; rojo y azul SOLO como acento.
// Radio 8, sin sombras, todos los números en mono. Reemplaza a NAVAJA.
//
// `THEME` es el sistema nuevo (claro y oscuro). `COLORS` conserva los nombres
// de siempre como alias con los valores nuevos: la app los lee en más de mil
// sitios y así no se rompe nada.
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

/**
 * LIQUID GLASS (docs/diseno-turno/README.md § 6). La app entera se pinta sobre
 * un fondo con manchas de color (components/fondo-glass.tsx) y las superficies
 * son vidrio: blanco translúcido, borde blanco y radios grandes. El desenfoque
 * real (BlurView) va en la barra de pestañas y en las hojas; las tarjetas usan
 * el blanco translúcido, que sobre un fondo liso se lee igual y no cuesta nada.
 */
export const GLASS = {
  base: '#F2F2F2',
  fill: 'rgba(255,255,255,0.45)',
  fillStrong: 'rgba(255,255,255,0.72)',
  fillSoft: 'rgba(255,255,255,0.30)',
  border: 'rgba(255,255,255,0.75)',
  hairline: 'rgba(11,11,12,0.07)',
  ink: 'rgba(11,11,12,0.9)',
  scrim: 'rgba(11,11,12,0.28)',
  radioCard: 22,
  radioFila: 18,
  radioBoton: 28,
}
export type Theme = typeof light

export const COLORS = {
  ...light,
  // ── compat NAVAJA → TURNO (no usar en código nuevo) ──
  // Diferencia deliberada con el v3: aquí `surface` sigue siendo BLANCO. En
  // las pantallas `COLORS.surface` siempre significó «fondo de tarjeta», y el
  // v3 pide justo eso: tarjetas blancas con borde de 1 px. El gris del sistema
  // nuevo es `surfaceAlt` (o `THEME.light.surface`).
  surface: light.bg,
  redDark: light.redText,
  redLight: light.surface,
  /** Rojo legible sobre la tinta. */
  redSoft: '#FF5A4F',
  blueLight: light.surface,
  carbon: light.ink,
  carbonEl: '#1A1A1A',
  carbonBorder: '#2A2A2A',
  primary: light.ink,
  gold: light.red,
  purple: light.ink,
  purpleLight: light.surface,
  text: light.ink,
  // En vidrio el texto secundario sube de contraste (README § 6).
  textMid: '#3D3D3D',
  textLight: '#555555',
  line: light.border,
  canvas: light.bg,
  surfaceAlt: light.surface,
  borderSoft: light.divider,
  onCarbon: light.onInk,
  onCarbonMid: light.onInkMuted,
  carbonDash: light.inkDivider,
  success: light.green,
  successLight: light.surface,
  // Señales sobre la tinta, subidas para leerse en negro.
  okNoche: '#34C77B',
  azulNoche: '#6E93FF',
  // El v3 no tiene ámbar: la pausa se dice en el gris de «descanso» del oscuro.
  ambarNoche: '#A3A3A3',
  danger: light.redText,
  dangerLight: light.surface,
  warning: light.text2,
  warningLight: light.surface,
  info: light.blue,
  infoLight: light.surface,
}

// Tipografía PROVISIONAL (cargada en app/_layout.tsx). El cliente definirá la
// familia final: cambia SOLO estas líneas. No uses Anton ni Plus Jakarta Sans.
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

// Color de texto por estado (listas).
export const ESTADO_COLOR: Record<string, keyof Theme> = {
  en_fila: 'text3',
  llamado: 'red',
  en_camino: 'blue',
  en_silla: 'red',
  atendiendo: 'red',
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
// El cliente es gratis. El barbero independiente paga el mínimo.
// El dueño paga mínimo × asientos (empleados + él mismo si atiende),
// con PISO en el mínimo y TOPE en el máximo: todo dueño paga al menos el
// mínimo (cuota de gestión del local), incluso el rentista que no atiende.
// Un dueño-barbero solo paga el mínimo.
// ⚠️ MONTOS PLACEHOLDER: ajústalos a tu mercado. En IAP, el precio real
// lo define el producto de App Store / Google Play; estos valores son
// para mostrar el plan y calcular asientos en la app.
export const SUSCRIPCION = {
  minimo: 500,        // precio por asiento / por barbero independiente
  maximo: 2000,       // tope mensual del dueño
  moneda: 'RD$',
  periodo: 'mes',
  // Estos 30 días SÍ existen desde la migración 86: el local nace con una
  // suscripción en prueba que caduca a los 30 de crearse, y turno_suscripcion()
  // dice cuántos quedan. Antes este número no lo leía nadie — ni la app ni la
  // base— y era solo una promesa escrita aquí.
  //
  // Quien lo cambie: cambiarlo aquí NO mueve nada. El 30 de verdad está en el
  // disparador turno_abrir_prueba (migración 86); los dos tienen que ir juntos.
  dias_prueba: 30,
} as const
