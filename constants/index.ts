import { Appearance } from 'react-native'
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
/**
 * CRISTAL PROPIO (docs/diseno-turno/CRISTAL.md; muestra aprobada el 23 sep).
 *
 * Dos temas, DÍA (cristal perla) y NOCHE (cristal ahumado), elegidos por el
 * ajuste del teléfono AL ABRIR la app: los estilos son estáticos, así que un
 * cambio de tema con la app abierta se ve al volver a abrirla.
 *
 * Regla del diseño: el cristal no tiene color propio. El color lo pone el
 * fondo (la luz del poste, components/fondo-glass.tsx); solo se pintan
 * enteros los botones principales y las tarjetas protagonistas (tu turno,
 * «¡es tu turno!», las cajas oscuras de dato).
 */
export const NOCHE = Appearance.getColorScheme() === 'dark'

const light = {
  bg: '#ECEEF3',
  surface: 'rgba(255,255,255,0.55)',
  ink: '#0B0B0C',
  text2: '#3D3F46',
  text3: '#5A5D66',
  disabled: '#A5A8B0',
  border: 'rgba(11,11,12,0.10)',
  divider: 'rgba(11,11,12,0.07)',
  tabBorder: 'rgba(255,255,255,0.75)',
  red: '#E1251B',
  redText: '#C21D14',
  blue: '#1E4FD8',
  green: '#157A41',
  onInk: '#FFFFFF',
  onInkMuted: '#B9BCC7',
  inkDivider: '#3A3A3A',
  inkPill: '#1F1F1F',
}

const dark: typeof light = {
  bg: '#0A0B0F',
  surface: 'rgba(255,255,255,0.08)',
  ink: '#F4F5F8',
  text2: '#B9BCC7',
  text3: '#9A9EAB',
  disabled: '#5C5F68',
  border: 'rgba(255,255,255,0.12)',
  divider: 'rgba(255,255,255,0.08)',
  tabBorder: 'rgba(255,255,255,0.09)',
  red: '#E1251B',
  redText: '#FF7A70',
  blue: '#8FAEFF',
  green: '#34C77B',
  onInk: '#0A0B0F',
  onInkMuted: '#B9BCC7',
  inkDivider: '#3A3A3A',
  inkPill: '#1F1F1F',
}

export const THEME = { light, dark }
const T = NOCHE ? dark : light

/** Las superficies de cristal del tema en uso. */
export const GLASS = NOCHE ? {
  base: '#0A0B0F',
  fill: 'rgba(255,255,255,0.045)',
  fillStrong: 'rgba(255,255,255,0.08)',
  fillSoft: 'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.09)',
  hairline: 'rgba(255,255,255,0.08)',
  /** Caja oscura de dato: en la noche, cristal ahumado un poco más denso. */
  ink: 'rgba(255,255,255,0.07)',
  scrim: 'rgba(0,0,0,0.5)',
  tinte: 'dark' as const,
  radioCard: 22,
  radioFila: 18,
  radioBoton: 28,
} : {
  base: '#ECEEF3',
  fill: 'rgba(255,255,255,0.34)',
  fillStrong: 'rgba(255,255,255,0.62)',
  fillSoft: 'rgba(255,255,255,0.22)',
  border: 'rgba(255,255,255,0.75)',
  hairline: 'rgba(11,11,12,0.07)',
  ink: 'rgba(11,11,12,0.88)',
  scrim: 'rgba(11,11,12,0.22)',
  tinte: 'light' as const,
  radioCard: 22,
  radioFila: 18,
  radioBoton: 28,
}
export type Theme = typeof light

export const COLORS = {
  ...T,
  // ── compat NAVAJA → TURNO (no usar en código nuevo) ──
  // `surface` es el fondo de tarjeta: aquí, el cristal.
  surface: GLASS.fill,
  redDark: T.redText,
  redLight: T.surface,
  /** Rojo legible sobre la tinta. */
  redSoft: '#FF5A4F',
  blueLight: T.surface,
  /** Superficie PINTADA oscura (tarjetas protagonistas, pantallas de marca): oscura en los dos temas. */
  carbon: NOCHE ? '#15161C' : '#0B0B0C',
  carbonEl: NOCHE ? '#1D1E25' : '#1A1A1A',
  carbonBorder: NOCHE ? '#2C2E37' : '#2A2A2A',
  primary: T.ink,
  gold: T.red,
  purple: T.ink,
  purpleLight: T.surface,
  text: T.ink,
  textMid: T.text2,
  textLight: T.text3,
  line: T.border,
  canvas: T.bg,
  surfaceAlt: T.surface,
  borderSoft: T.divider,
  onCarbon: '#FFFFFF',
  onCarbonMid: '#B9BCC7',
  carbonDash: '#3A3A3A',
  success: T.green,
  successLight: T.surface,
  // Señales sobre la tinta, subidas para leerse en negro.
  okNoche: '#34C77B',
  azulNoche: '#8FAEFF',
  ambarNoche: '#A3A3A3',
  danger: T.redText,
  dangerLight: T.surface,
  warning: T.text2,
  warningLight: T.surface,
  info: T.blue,
  infoLight: T.surface,
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
