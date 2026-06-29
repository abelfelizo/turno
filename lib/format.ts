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
