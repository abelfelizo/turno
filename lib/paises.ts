/**
 * PAÍSES, MONEDAS Y ZONAS HORARIAS.
 *
 * La lista es corta a propósito. Turno se está probando en República Dominicana
 * y crece por donde crece el barbero dominicano: el que se va a Nueva York, el
 * que abre en Santiago de Chile, el que vuelve a Haití. Un selector con los 195
 * países del mundo es peor para todos ellos que uno con doce y una salida.
 *
 * De cada país salen dos cosas que la app necesita y que el dueño no debería
 * tener que saber: la MONEDA en la que cobra y la ZONA HORARIA con la que el
 * servidor decide si su fila está abierta. Elegir el país las propone; la
 * moneda se puede cambiar después, porque hay locales que cobran en dólares en
 * sitios donde la moneda es otra.
 */
export type Pais = { codigo: string; nombre: string; moneda: string; tz: string }

export const PAISES: Pais[] = [
  { codigo: 'DO', nombre: 'República Dominicana', moneda: 'DOP', tz: 'America/Santo_Domingo' },
  { codigo: 'US', nombre: 'Estados Unidos', moneda: 'USD', tz: 'America/New_York' },
  { codigo: 'PR', nombre: 'Puerto Rico', moneda: 'USD', tz: 'America/Puerto_Rico' },
  { codigo: 'HT', nombre: 'Haití', moneda: 'HTG', tz: 'America/Port-au-Prince' },
  { codigo: 'CU', nombre: 'Cuba', moneda: 'CUP', tz: 'America/Havana' },
  { codigo: 'MX', nombre: 'México', moneda: 'MXN', tz: 'America/Mexico_City' },
  { codigo: 'CO', nombre: 'Colombia', moneda: 'COP', tz: 'America/Bogota' },
  { codigo: 'VE', nombre: 'Venezuela', moneda: 'VES', tz: 'America/Caracas' },
  { codigo: 'PA', nombre: 'Panamá', moneda: 'PAB', tz: 'America/Panama' },
  { codigo: 'CR', nombre: 'Costa Rica', moneda: 'CRC', tz: 'America/Costa_Rica' },
  { codigo: 'ES', nombre: 'España', moneda: 'EUR', tz: 'Europe/Madrid' },
  { codigo: 'AR', nombre: 'Argentina', moneda: 'ARS', tz: 'America/Argentina/Buenos_Aires' },
  { codigo: 'CL', nombre: 'Chile', moneda: 'CLP', tz: 'America/Santiago' },
]

/** Las monedas que se pueden elegir a mano, con su símbolo para el selector. */
export const MONEDAS: { codigo: string; etiqueta: string }[] = [
  { codigo: 'DOP', etiqueta: 'RD$ · peso dominicano' },
  { codigo: 'USD', etiqueta: 'US$ · dólar' },
  { codigo: 'EUR', etiqueta: '€ · euro' },
  { codigo: 'HTG', etiqueta: 'G · gourde' },
  { codigo: 'CUP', etiqueta: '$ · peso cubano' },
  { codigo: 'MXN', etiqueta: '$ · peso mexicano' },
  { codigo: 'COP', etiqueta: '$ · peso colombiano' },
  { codigo: 'VES', etiqueta: 'Bs · bolívar' },
  { codigo: 'PAB', etiqueta: 'B/. · balboa' },
  { codigo: 'CRC', etiqueta: '₡ · colón' },
  { codigo: 'ARS', etiqueta: '$ · peso argentino' },
  { codigo: 'CLP', etiqueta: '$ · peso chileno' },
]

export const paisDe = (codigo?: string | null) => PAISES.find(p => p.codigo === codigo) ?? null

/** La dirección en una línea, saltándose lo que esté vacío. */
export function direccionCompleta(n: {
  direccion?: string | null; sector?: string | null; ciudad?: string | null
  referencia?: string | null; pais?: string | null
}): string {
  const partes = [n.direccion, n.sector, n.ciudad, paisDe(n.pais)?.nombre].filter(Boolean)
  const base = partes.join(', ')
  return n.referencia ? `${base}${base ? ' · ' : ''}${n.referencia}` : base
}
