// Locale por defecto para fechas. Español neutro (no atado a un país).
// Cuando se soporten más países, pasar el locale del negocio a fechaLarga.
export const LOCALE_DEFAULT = 'es'

/** Fecha larga tipo "lunes, 2 de julio". Locale configurable. */
export function fechaLarga(d: Date = new Date(), locale: string = LOCALE_DEFAULT): string {
  try {
    return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
  } catch {
    return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  }
}

/** Formatea un monto con su moneda: "RD$ 1,200". `moneda` viene del negocio. */
export function dinero(monto?: number | string | null, moneda = ''): string {
  const n = Number(monto ?? 0)
  const num = isNaN(n) ? 0 : n
  return `${moneda ? moneda + ' ' : ''}${num.toLocaleString()}`.trim()
}

/** Fecha "YYYY-MM-DD" en hora LOCAL (no UTC). Evita que de noche "hoy" salte a mañana. */
export function fechaISOLocal(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** "YYYY-MM-DD" → Date LOCAL. `new Date(iso)` lo leería como UTC y en América
 *  eso adelanta el día entero: la agenda mostraría mañana creyendo que es hoy. */
export function fechaDeISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

/** Suma (o resta) días sobre una fecha ISO local. */
export function sumarDias(iso: string, n: number): string {
  const d = fechaDeISO(iso)
  d.setDate(d.getDate() + n)
  return fechaISOLocal(d)
}

/**
 * LOS CUATRO RELOJES DE UNA SILLA OCUPADA.
 *
 * Pedido desde el teléfono: el estado del barbero debería decir cuándo empezó,
 * cuánto lleva, cuánto le falta y a qué hora termina. Las dos horas las calcula
 * el servidor (migración 79: `desde` y `fin_estimado`) porque la hora que
 * importa es la del local; aquí solo se restan y se escriben.
 *
 * `faltan` puede salir NEGATIVO a propósito: eso es exactamente la señal de que
 * ese corte se está pasando de su tiempo, y taparlo con un cero sería esconder
 * lo único que hay que ver.
 */
export function relojesDeSilla(desde?: string | null, fin?: string | null) {
  if (!desde) return null
  const ini = new Date(desde).getTime()
  const finMs = fin ? new Date(fin).getTime() : null
  const ahora = Date.now()
  const lleva = Math.max(0, Math.round((ahora - ini) / 60000))
  const faltan = finMs == null ? null : Math.round((finMs - ahora) / 60000)
  const hhmm = (ms: number) => {
    const d = new Date(ms)
    return hora12(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
  }
  return {
    inicio: hhmm(ini),
    lleva,
    faltan,
    fin: finMs == null ? null : hhmm(finMs),
    /** Se pasó del tiempo del servicio. */
    tarde: faltan != null && faltan < 0,
  }
}

/** Formatea una hora "HH:MM" o "HH:MM:SS" a 12 horas con AM/PM. */
export function hora12(t?: string | null): string {
  if (!t) return ''
  const parts = t.split(':')
  let h = parseInt(parts[0], 10)
  const m = parts[1] ?? '00'
  if (isNaN(h)) return t
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${m} ${ap}`
}
