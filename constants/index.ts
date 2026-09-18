// Login de producción: alta por correo con código OTP. El antiguo "modo prueba"
// (cuenta fija dev@turno.test) se eliminó por seguridad — daba acceso de dueño a
// cualquiera con el APK. Para cambiar de panel se usa <CambiarRol />.

// Sistema visual NAVAJA · Barber Co. — rojo primario, azul secundario,
// blanco y negro carbón. Tokens del handoff "Sistema Barbería".
//
// EL FONDO ES CLARO Y FRÍO, Y EL PESO LO LLEVA EL NEGRO.
// El beige de antes (#F6F5F2) apagaba la pantalla entera: sobre él ni el
// blanco de las tarjetas ni el rojo de marca levantaban, y todo se leía
// descolorido. El fondo pasa a un gris casi blanco y la tinta baja a un negro
// más profundo, así que el único objeto oscuro de cada pantalla —el ticket del
// turno— es lo que pesa. Cambiar `bg` aquí cambia la app entera: es un token,
// no un color escrito en cada pantalla.
export const COLORS = {
  red: '#E5202B',          // PRIMARIO · CTA · marca
  redDark: '#C2161F',
  redLight: '#FFF0F1',
  /** Rojo legible SOBRE carbón: el de marca no llega al contraste en oscuro. */
  redSoft: '#FF6B73',
  blue: '#1646E0',         // secundario
  blueLight: '#EDF1FE',
  carbon: '#0B0C10',       // negro carbón (oscuro)
  carbonEl: '#16181F',     // superficie oscura elevada
  carbonBorder: '#262A34',
  primary: '#0B0C10',      // compat: superficies/texto oscuros
  gold: '#E5202B',         // compat: acento → rojo
  purple: '#1646E0',       // compat: avatares → azul
  purpleLight: '#EDF1FE',
  ink: '#0B0C10',
  text: '#0B0C10',
  textMid: '#5C6270',
  textLight: '#8A90A0',
  line: '#DDE0E6',
  canvas: '#EEF0F4',
  bg: '#FAFBFC',           // fondo de pantalla
  surface: '#FFFFFF',      // tarjetas
  surfaceAlt: '#F1F3F8',
  border: '#E6E8EC',
  borderSoft: '#F0F1F4',
  /** Texto y filete sobre carbón (el ticket). */
  onCarbon: '#FFFFFF',
  onCarbonMid: '#9BA1AF',
  carbonDash: '#3A3F4C',
  success: '#0E7C46',
  successLight: '#E9F8F0',
  danger: '#C2161F',
  dangerLight: '#FFF0F1',
  warning: '#B45309',
  warningLight: '#FDF1E3',
  info: '#1646E0',
  infoLight: '#EDF1FE',
}

// Familias de fuente (cargadas en app/_layout.tsx)
export const FONTS = {
  display: 'Anton_400Regular',        // titulares, números grandes, cabeceras
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const

// ── Tokens del sistema de diseño ──────────────────────────────────
export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const
export const RADIUS = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const
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
