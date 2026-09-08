// Login de producción: alta por correo con código OTP. El antiguo "modo prueba"
// (cuenta fija dev@turno.test) se eliminó por seguridad — daba acceso de dueño a
// cualquiera con el APK. Para cambiar de panel se usa <CambiarRol />.

// Sistema visual NAVAJA · Barber Co. — rojo primario, azul secundario,
// blanco y negro carbón. Tokens del handoff "Sistema Barbería".
export const COLORS = {
  red: '#E5202B',          // PRIMARIO · CTA · marca
  redDark: '#C2161F',
  redLight: '#FCE7E8',
  blue: '#1646E0',         // secundario
  blueLight: '#E7ECFD',
  carbon: '#16171C',       // negro carbón (oscuro)
  carbonEl: '#20222A',     // superficie oscura elevada
  carbonBorder: '#2C2E37',
  primary: '#16171C',      // compat: superficies/texto oscuros
  gold: '#E5202B',         // compat: acento → rojo
  purple: '#1646E0',       // compat: avatares → azul
  purpleLight: '#E7ECFD',
  ink: '#14151A',
  text: '#14151A',
  textMid: '#4A4B52',
  textLight: '#9A9CA6',
  line: '#D8D6D1',
  canvas: '#EBE8E3',
  bg: '#F6F5F2',           // fondo de pantalla
  surface: '#FFFFFF',      // tarjetas
  surfaceAlt: '#F1EFEB',
  border: '#E6E4E0',
  borderSoft: '#EFEDE9',
  success: '#1E7E34',
  successLight: '#E6F4EA',
  danger: '#C2161F',
  dangerLight: '#FCE7E8',
  warning: '#B45309',
  warningLight: '#FBEEDA',
  info: '#1646E0',
  infoLight: '#E7ECFD',
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
  dias_prueba: 30,
} as const
