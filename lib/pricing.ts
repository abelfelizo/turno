import { SUSCRIPCION } from '../constants'
import { dinero } from './format'

export type Plan = {
  clave: 'gratis' | 'independiente' | 'dueno' | 'cubierto'
  titulo: string
  detalle: string
  monto: number
  montoTexto: string
  asientos?: number
  topado?: boolean
}

/**
 * Monto del dueño: mínimo × asientos, con piso en el mínimo y tope en el
 * máximo. El piso cubre al dueño rentista (0 asientos propios): paga el
 * mínimo como cuota de gestión del local, aunque no atienda ni tenga
 * empleados. Sus barberos independientes pagan su propio plan aparte.
 */
export function montoDueno(asientos: number): number {
  const porAsientos = SUSCRIPCION.minimo * Math.max(asientos, 0)
  return Math.min(Math.max(porAsientos, SUSCRIPCION.minimo), SUSCRIPCION.maximo)
}

const M = SUSCRIPCION.moneda
const per = `/${SUSCRIPCION.periodo}`

/** Plan del dueño según los asientos que cubre (empleados + él si atiende). */
export function planDueno(asientos: number): Plan {
  const monto = montoDueno(asientos)
  const topado = SUSCRIPCION.minimo * asientos >= SUSCRIPCION.maximo && asientos > 0
  const detalle = asientos <= 0
    ? 'Cuota de gestión del local. Tus barberos independientes pagan su propio plan aparte.'
    : asientos === 1
      ? 'Cubre tu asiento. Al agregar barberos, sube por asiento hasta el tope.'
      : topado
        ? `Cubre ${asientos} asientos · tope alcanzado.`
        : `Cubre ${asientos} asientos (${dinero(SUSCRIPCION.minimo, M)} c/u).`
  return { clave: 'dueno', titulo: 'Plan del local', detalle, monto, montoTexto: `${dinero(monto, M)}${per}`, asientos, topado }
}

/** Barbero independiente (renta): paga su propio mínimo. */
export function planIndependiente(): Plan {
  return { clave: 'independiente', titulo: 'Tu suscripción', detalle: 'Trabajas de forma independiente y cubres tu propio asiento.', monto: SUSCRIPCION.minimo, montoTexto: `${dinero(SUSCRIPCION.minimo, M)}${per}` }
}

/** Empleado: lo cubre el dueño del local. */
export function planCubierto(): Plan {
  return { clave: 'cubierto', titulo: 'Tu suscripción', detalle: 'Incluida: la cubre el dueño del local.', monto: 0, montoTexto: 'Incluida' }
}

/** Cliente: siempre gratis. */
export function planGratis(): Plan {
  return { clave: 'gratis', titulo: 'Tu cuenta', detalle: 'Como cliente, Turno siempre es gratis para ti.', monto: 0, montoTexto: 'Gratis' }
}
