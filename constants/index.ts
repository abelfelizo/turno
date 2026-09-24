import { Appearance } from 'react-native'
// Login de producción: alta por correo con código OTP. El antiguo "modo prueba"
// (cuenta fija dev@turno.test) se eliminó por seguridad — daba acceso de dueño a
// cualquiera con el APK. Para cambiar de panel se usa <CambiarRol />.

// SISTEMA VISUAL TURNO — «Cristal propio» + sus Reglas (docs/diseno-turno/REGLAS.md).
// (Sustituye al handoff v3 y a su radio 8.)
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

/**
 * REGLAS DEL SISTEMA VISUAL (lámina «Reglas» del lienzo «Turno · Sistema
 * visual Cristal», aprobada el 24 sep). Resumen para quien toque estilos:
 *
 *  1. Cada superficie trae sus colores de texto. Sobre cristal y hojas se usan
 *     los de `COLORS` (ink / text2 / text3 / disabled / redText / blue /
 *     green); sobre una superficie pintada, los de `SOBRE.<superficie>`.
 *     Nunca un color escrito a mano dentro de una pieza.
 *  2. Prohibido: texto con transparencia, grises de día sobre superficie
 *     pintada, apagar con opacidad, y el rojo del poste (#E1251B) como texto
 *     o botón — ese rojo es solo del poste y del logo (`POSTE_ROJO`).
 *  3. Botones: 52 (principal) y 44 (en tarjetas, filas e iconos). El radio es
 *     siempre la mitad del alto.
 *  4. Radios: pastilla · 36 hoja · 28 pintada y diálogo · 22 tarjeta de
 *     cristal · 18 fila · 16 caja interna, día y hora · círculo. Nada más.
 *  5. Letra: nunca por debajo de 12; el 11 solo en rótulos en mayúsculas y
 *     nombres de pestaña o de día, en negrita. Números siempre en mono.
 *  6. De noche el cristal es AHUMADO (oscurece el fondo); de día, blanco.
 *     Cada texto se mide contra el peor punto de la foto de fondo: ≥ 4,5 : 1.
 */
const light = {
  bg: '#ECEEF3',
  surface: 'rgba(255,255,255,0.66)',
  ink: '#0B0B0C',
  text2: '#3D3F46',
  // Medidos también sobre la foto SIN cristal, en su punto más oscuro (200,209,238): todos ≥ 4,5.
  text3: '#55585F',
  disabled: '#55585F',
  border: 'rgba(11,11,12,0.10)',
  divider: 'rgba(11,11,12,0.07)',
  tabBorder: 'rgba(255,255,255,0.8)',
  /** Rojo de RELLENO (botones, hora elegida, tarjeta «¡es tu turno!»). Para texto: `redText`. */
  red: '#C81E17',
  redText: '#AD1911',
  blue: '#1A47C8',
  green: '#0F6534',
  onInk: '#FFFFFF',
  onInkMuted: '#B9BCC7',
  inkDivider: '#3A3C46',
  inkPill: '#1F2027',
}

const dark: typeof light = {
  bg: '#0A0B0F',
  surface: 'rgba(34,35,42,0.62)',
  ink: '#F4F5F8',
  text2: '#B9BCC7',
  // Medidos también sobre la foto SIN cristal, en su punto más claro (63,54,66): 4,7 y 4,5.
  text3: '#A1A5B2',
  disabled: '#9EA2AF',
  border: 'rgba(255,255,255,0.12)',
  divider: 'rgba(255,255,255,0.08)',
  tabBorder: 'rgba(255,255,255,0.10)',
  red: '#C81E17',
  redText: '#FF7A70',
  blue: '#8FAEFF',
  green: '#34C77B',
  onInk: '#0A0B0F',
  onInkMuted: '#B9BCC7',
  inkDivider: '#3A3C46',
  inkPill: '#1F2027',
}

export const THEME = { light, dark }
const T = NOCHE ? dark : light

/** El rojo del poste y del logo. NUNCA como texto ni como botón (Regla 2). */
export const POSTE_ROJO = '#E1251B'

/**
 * LAS SUPERFICIES PINTADAS y el texto que va encima de cada una (Regla 1).
 * Son iguales de día y de noche. Lo que va dentro de una de ellas usa SOLO
 * estos colores: t1 principal · t2 secundario · t3 ayuda · dis apagado.
 * Las señales de color (ok, azul, pausa, rojo) solo existen sobre la tinta.
 */
export const SOBRE = {
  tinta: {
    fondo: '#15161C', elevado: '#1F2027', borde: '#2C2E37', linea: '#3A3C46',
    t1: '#FFFFFF', t2: '#B9BCC7', t3: '#9A9EAB', dis: '#9A9EAB',
    ok: '#34C77B', azul: '#8FAEFF', pausa: '#A3A3A3', rojo: '#FF7A70',
  },
  degradado: {
    fondo: '#782446', elevado: 'rgba(255,255,255,0.12)', borde: 'rgba(255,255,255,0.6)', linea: 'rgba(255,255,255,0.28)',
    t1: '#FFFFFF', t2: '#F3DCE2', t3: '#F3DCE2', dis: '#F3DCE2',
  },
  rojo: {
    fondo: '#C81E17', elevado: 'rgba(255,255,255,0.12)', borde: 'rgba(255,255,255,0.6)', linea: 'rgba(255,255,255,0.28)',
    t1: '#FFFFFF', t2: '#FFE1DE', t3: '#FFE1DE', dis: '#FFE1DE',
  },
  azul: {
    fondo: '#1E4FD8', elevado: 'rgba(255,255,255,0.12)', borde: 'rgba(255,255,255,0.6)', linea: 'rgba(255,255,255,0.28)',
    t1: '#FFFFFF', t2: '#DCE4FF', t3: '#DCE4FF', dis: '#DCE4FF',
  },
} as const
export type Superficie = keyof typeof SOBRE

/** Botón principal sobre superficie pintada: blanco con texto negro (Regla 3). */
export const BOTON_CLARO = { fondo: '#FFFFFF', texto: '#0B0B0C' } as const

/** Los siete radios (Regla 4). `pill` = la mitad del alto. */
export const RADIO = {
  pill: 999,
  hoja: 36,
  pintada: 28,
  tarjeta: 22,
  fila: 18,
  caja: 16,
} as const

/** Las superficies de cristal del tema en uso (Regla 6). */
export const GLASS = NOCHE ? {
  base: '#0A0B0F',
  /** Cristal AHUMADO: oscurece el fondo en vez de aclararlo. */
  fill: 'rgba(20,21,27,0.45)',
  fillStrong: 'rgba(34,35,42,0.62)',
  fillSoft: 'rgba(20,21,27,0.30)',
  border: 'rgba(255,255,255,0.10)',
  hairline: 'rgba(255,255,255,0.08)',
  /** Caja de dato: la TINTA, igual en los dos temas. Su texto: SOBRE.tinta. */
  ink: SOBRE.tinta.fondo,
  scrim: 'rgba(0,0,0,0.5)',
  /** Hoja que sube desde abajo: SÓLIDA, para que su texto se lea igual sobre cualquier pantalla. */
  hoja: '#1B1C21',
  tinte: 'dark' as const,
  radioCard: RADIO.tarjeta,
  radioFila: RADIO.fila,
  radioBoton: 26,
} : {
  base: '#ECEEF3',
  fill: 'rgba(255,255,255,0.45)',
  fillStrong: 'rgba(255,255,255,0.66)',
  fillSoft: 'rgba(255,255,255,0.28)',
  border: 'rgba(255,255,255,0.8)',
  hairline: 'rgba(11,11,12,0.07)',
  ink: SOBRE.tinta.fondo,
  scrim: 'rgba(11,11,12,0.22)',
  hoja: '#F4F5F8',
  tinte: 'light' as const,
  radioCard: RADIO.tarjeta,
  radioFila: RADIO.fila,
  radioBoton: 26,
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
  redSoft: SOBRE.tinta.rojo,
  blueLight: T.surface,
  /** La TINTA: superficie pintada oscura, igual en los dos temas. Su texto: onCarbon / onCarbonMid. */
  carbon: SOBRE.tinta.fondo,
  carbonEl: SOBRE.tinta.elevado,
  carbonBorder: SOBRE.tinta.borde,
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
  onCarbon: SOBRE.tinta.t1,
  onCarbonMid: SOBRE.tinta.t2,
  carbonDash: SOBRE.tinta.linea,
  success: T.green,
  successLight: T.surface,
  // Señales sobre la tinta.
  okNoche: SOBRE.tinta.ok,
  azulNoche: SOBRE.tinta.azul,
  ambarNoche: SOBRE.tinta.pausa,
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

// compat: usa RADIO (Regla 4).
export const RADIUS = { sm: RADIO.caja, md: RADIO.fila, lg: RADIO.tarjeta, xl: RADIO.pintada, pill: 999 } as const

export const TYPE = {
  number: { fontFamily: FONTS.monoBold, fontSize: 112, letterSpacing: -4, lineHeight: 112 },
  h1: { fontFamily: FONTS.bold, fontSize: 30, letterSpacing: -0.8 },
  h2: { fontFamily: FONTS.bold, fontSize: 40, letterSpacing: -1 },
  title: { fontFamily: FONTS.semibold, fontSize: 17 },
  body: { fontFamily: FONTS.regular, fontSize: 15 },
  bodyStrong: { fontFamily: FONTS.semibold, fontSize: 15 },
  meta: { fontFamily: FONTS.regular, fontSize: 13 },
  overline: { fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
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
  llamado: 'redText',
  en_camino: 'blue',
  en_silla: 'redText',
  atendiendo: 'redText',
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
