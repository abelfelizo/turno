// Login de producción: alta por correo con código OTP. El antiguo "modo prueba"
// (cuenta fija dev@turno.test) se eliminó por seguridad — daba acceso de dueño a
// cualquiera con el APK. Para cambiar de panel se usa <CambiarRol />.

// LÍNEA GRÁFICA DE TURNO (handoff del 23 sep, docs/diseno-turno/README.md).
//
// Dominan los neutros puros —blanco y negro—; el rojo y el azul son SOLO
// acentos. Reemplaza a NAVAJA (Anton, Plus Jakarta, carbón #0B0C10, rojo
// #E5202B, azul #1646E0).
//
// LOS NOMBRES DE SIEMPRE, CON LOS VALORES NUEVOS. La app lee estos nombres en
// más de mil sitios; cambiar los valores aquí cambia la app entera de una vez
// sin tocar la lógica de ninguna pantalla. Los nombres que el handoff añade
// (disabled, divider, tabBorder, redText) van al final.
const CLARO = {
  red: '#E1251B',          // acento: tab activa, CTA final, «llamado», «en la silla»
  redDark: '#C21D14',
  redLight: '#FDECEB',
  /** Rojo legible sobre la tinta: el de marca no llega al contraste en oscuro. */
  redSoft: '#FF5A4F',
  blue: '#1E4FD8',         // acento: «en camino», enlaces, acciones secundarias
  blueLight: '#EEF2FD',
  carbon: '#0B0B0C',       // la tinta: texto, botón principal, ticket activo
  carbonEl: '#1A1A1A',
  carbonBorder: '#2A2A2A',
  primary: '#0B0B0C',
  gold: '#E1251B',         // compat
  purple: '#1E4FD8',       // compat
  purpleLight: '#EEF2FD',
  ink: '#0B0B0C',
  text: '#0B0B0C',
  textMid: '#5C5C5C',      // text2: etiquetas de sección, subtítulos
  textLight: '#6B6B6B',    // text3: metadatos, tabs inactivas
  line: '#E6E6E6',
  canvas: '#F4F4F4',
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F4F4',   // surface del handoff: avatares, chips de fecha
  border: '#E6E6E6',
  borderSoft: '#F0F0F0',
  /** Texto y filete sobre la tinta (el ticket). */
  onCarbon: '#FFFFFF',
  onCarbonMid: '#B5B5B5',
  carbonDash: '#3A3A3A',
  success: '#1F9D55',
  successLight: '#E8F6EE',
  // SEÑALES SOBRE LA TINTA: las mismas cuatro, subidas para leerse en negro.
  okNoche: '#34C77B',
  azulNoche: '#6E93FF',
  ambarNoche: '#E8901A',
  danger: '#C21D14',
  dangerLight: '#FDECEB',
  warning: '#B45309',
  warningLight: '#FDF1E3',
  info: '#1E4FD8',
  infoLight: '#EEF2FD',
  // Nuevos del handoff.
  disabled: '#B5B5B5',
  divider: '#F0F0F0',
  tabBorder: '#EDEDED',
  redText: '#C21D14',      // rojo para texto sobre blanco («Salir»)
}

/**
 * EL OSCURO, PREPARADO Y SIN ACTIVAR. Se enciende en la fase 5
 * (docs/APLICAR-LINEA-GRAFICA.md), cuando lo claro esté visto en el teléfono.
 * En oscuro la card protagonista se invierte: fondo blanco y texto tinta.
 */
export const COLORS_OSCURO: typeof CLARO = {
  ...CLARO,
  red: '#FF5A4F', redSoft: '#FF5A4F', redText: '#FF5A4F',
  blue: '#6E93FF', info: '#6E93FF',
  ink: '#FFFFFF', text: '#FFFFFF', primary: '#FFFFFF',
  textMid: '#A3A3A3', textLight: '#A3A3A3',
  bg: '#0B0B0C', surface: '#0B0B0C', surfaceAlt: '#1A1A1A', canvas: '#1A1A1A',
  border: '#2A2A2A', line: '#2A2A2A', borderSoft: '#1F1F1F', divider: '#1F1F1F', tabBorder: '#1F1F1F',
  success: '#34C77B', okNoche: '#34C77B',
}

export const COLORS = CLARO

// FAMILIAS DE FUENTE (cargadas en app/_layout.tsx).
// La tipografía del handoff es PROVISIONAL: el cliente definirá la familia
// final. Por eso vive aquí en un solo sitio —cambiarla es cambiar estas
// líneas—. `display` era Anton; ahora es Geist en negrita, sin mayúsculas.
// Todos los números van en mono (`mono`, `monoMedium`).
export const FONTS = {
  display: 'Geist_700Bold',
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  bold: 'Geist_700Bold',
  extrabold: 'Geist_700Bold',   // el handoff no pasa de 700
  mono: 'GeistMono_700Bold',
  monoMedium: 'GeistMono_500Medium',
} as const

// ── Tokens del sistema de diseño ──────────────────────────────────
export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const
// Radio 8 por defecto en todo (botones, cards, chips, inputs, tickets). El
// estilo estándar no usa radios mayores; solo la variante Glass.
export const RADIUS = { sm: 8, md: 8, lg: 8, xl: 8, pill: 999 } as const
export const FONT = {
  display: { fontSize: 26, fontWeight: '800' },
  title: { fontSize: 19, fontWeight: '800' },
  subtitle: { fontSize: 16, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '500' },
  caption: { fontSize: 13, fontWeight: '500' },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
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
