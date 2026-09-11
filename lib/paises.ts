/**
 * PAÍSES, MONEDAS Y ZONAS HORARIAS.
 *
 * Toda Latinoamérica, más los sitios donde vive el barbero que se fue. Era una
 * lista de trece en un carrusel horizontal, y eso tenía dos problemas: faltaba
 * medio continente, y un carrusel esconde lo que no cabe — quien no veía su país
 * en los tres primeros no tenía forma de saber si estaba más allá o no estaba.
 * Ahora es un desplegable con buscador, que es lo que pidió el piloto.
 *
 * De cada país salen dos cosas que la app necesita y que el dueño no debería
 * tener que saber: la MONEDA en la que cobra y la ZONA HORARIA con la que el
 * servidor decide si su fila está abierta. Elegir el país las propone; la
 * moneda se puede cambiar después, porque hay locales que cobran en dólares en
 * sitios donde la moneda es otra — en Venezuela y Cuba es casi la norma.
 *
 * EL ORDEN NO ES ALFABÉTICO Y ES A PROPÓSITO: primero donde de verdad se está
 * usando esto, después el resto del continente por orden. Quien abre el
 * selector en Santo Domingo no debería tener que bajar hasta la R.
 */
export type Pais = { codigo: string; nombre: string; moneda: string; tz: string }

export const PAISES: Pais[] = [
  // El Caribe de donde viene Turno, y donde se va el que emigra.
  { codigo: 'DO', nombre: 'República Dominicana', moneda: 'DOP', tz: 'America/Santo_Domingo' },
  { codigo: 'US', nombre: 'Estados Unidos', moneda: 'USD', tz: 'America/New_York' },
  { codigo: 'PR', nombre: 'Puerto Rico', moneda: 'USD', tz: 'America/Puerto_Rico' },
  { codigo: 'HT', nombre: 'Haití', moneda: 'HTG', tz: 'America/Port-au-Prince' },
  { codigo: 'CU', nombre: 'Cuba', moneda: 'CUP', tz: 'America/Havana' },
  { codigo: 'ES', nombre: 'España', moneda: 'EUR', tz: 'Europe/Madrid' },
  // Norte y Centroamérica.
  { codigo: 'MX', nombre: 'México', moneda: 'MXN', tz: 'America/Mexico_City' },
  { codigo: 'GT', nombre: 'Guatemala', moneda: 'GTQ', tz: 'America/Guatemala' },
  { codigo: 'BZ', nombre: 'Belice', moneda: 'BZD', tz: 'America/Belize' },
  { codigo: 'SV', nombre: 'El Salvador', moneda: 'USD', tz: 'America/El_Salvador' },
  { codigo: 'HN', nombre: 'Honduras', moneda: 'HNL', tz: 'America/Tegucigalpa' },
  { codigo: 'NI', nombre: 'Nicaragua', moneda: 'NIO', tz: 'America/Managua' },
  { codigo: 'CR', nombre: 'Costa Rica', moneda: 'CRC', tz: 'America/Costa_Rica' },
  { codigo: 'PA', nombre: 'Panamá', moneda: 'PAB', tz: 'America/Panama' },
  // Sudamérica.
  { codigo: 'CO', nombre: 'Colombia', moneda: 'COP', tz: 'America/Bogota' },
  { codigo: 'VE', nombre: 'Venezuela', moneda: 'VES', tz: 'America/Caracas' },
  { codigo: 'EC', nombre: 'Ecuador', moneda: 'USD', tz: 'America/Guayaquil' },
  { codigo: 'PE', nombre: 'Perú', moneda: 'PEN', tz: 'America/Lima' },
  { codigo: 'BO', nombre: 'Bolivia', moneda: 'BOB', tz: 'America/La_Paz' },
  { codigo: 'BR', nombre: 'Brasil', moneda: 'BRL', tz: 'America/Sao_Paulo' },
  { codigo: 'PY', nombre: 'Paraguay', moneda: 'PYG', tz: 'America/Asuncion' },
  { codigo: 'UY', nombre: 'Uruguay', moneda: 'UYU', tz: 'America/Montevideo' },
  { codigo: 'AR', nombre: 'Argentina', moneda: 'ARS', tz: 'America/Argentina/Buenos_Aires' },
  { codigo: 'CL', nombre: 'Chile', moneda: 'CLP', tz: 'America/Santiago' },
]

/** Las monedas que se pueden elegir a mano, con su símbolo para el selector. */
export const MONEDAS: { codigo: string; etiqueta: string }[] = [
  { codigo: 'DOP', etiqueta: 'RD$ · peso dominicano' },
  { codigo: 'USD', etiqueta: 'US$ · dólar' },
  { codigo: 'EUR', etiqueta: '€ · euro' },
  { codigo: 'HTG', etiqueta: 'G · gourde haitiano' },
  { codigo: 'CUP', etiqueta: '$ · peso cubano' },
  { codigo: 'MXN', etiqueta: '$ · peso mexicano' },
  { codigo: 'GTQ', etiqueta: 'Q · quetzal' },
  { codigo: 'BZD', etiqueta: 'BZ$ · dólar beliceño' },
  { codigo: 'HNL', etiqueta: 'L · lempira' },
  { codigo: 'NIO', etiqueta: 'C$ · córdoba' },
  { codigo: 'CRC', etiqueta: '₡ · colón' },
  { codigo: 'PAB', etiqueta: 'B/. · balboa' },
  { codigo: 'COP', etiqueta: '$ · peso colombiano' },
  { codigo: 'VES', etiqueta: 'Bs · bolívar' },
  { codigo: 'PEN', etiqueta: 'S/ · sol' },
  { codigo: 'BOB', etiqueta: 'Bs · boliviano' },
  { codigo: 'BRL', etiqueta: 'R$ · real' },
  { codigo: 'PYG', etiqueta: '₲ · guaraní' },
  { codigo: 'UYU', etiqueta: '$U · peso uruguayo' },
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
