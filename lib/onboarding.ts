/**
 * Borrador de onboarding (estado en memoria entre pantallas del flujo).
 * Se limpia al terminar. No persiste: si el usuario cierra la app a mitad,
 * vuelve a empezar el alta (aceptable en V1).
 */
import type { TipoNegocio, TipoServicio } from '../types'

export interface BorradorOnboarding {
  // común
  nombre?: string
  telefono?: string
  // dueño
  tipoNegocio?: TipoNegocio
  atiende?: boolean
  nombreNegocio?: string
  moneda?: string
  // barbero
  tipoServicio?: TipoServicio
  rol?: 'empleado' | 'barbero_renta'
  codigo?: string
  // resultado
  negocioId?: string
}

export const borrador: BorradorOnboarding = {}

export function resetBorrador() {
  for (const k of Object.keys(borrador)) delete (borrador as any)[k]
}
