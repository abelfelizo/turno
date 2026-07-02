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
