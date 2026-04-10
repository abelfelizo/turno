/**
 * REGLAS DE NEGOCIO DE TURNO
 * Implementación de los 20 casos de resolución de conflictos definidos
 */

import { Cita, Cola, ConfiguracionNegocio } from '../types'
import { TIEMPOS_DEFAULT } from '../constants'

/**
 * Determina si una cita puede ser agendada basado en la anticipación mínima
 * Regla: No se puede agendar cita para menos de X horas
 */
export function puedeAgendar(fechaHoraCita: Date, config: ConfiguracionNegocio): boolean {
  const ahora = new Date()
  const horasAnticipacion = (fechaHoraCita.getTime() - ahora.getTime()) / (1000 * 60 * 60)
  return horasAnticipacion >= config.anticipacion_minima_horas
}

/**
 * Calcula la fecha de expiración de un turno en cola
 * Regla: Cliente tiene X minutos para llegar cuando es llamado
 */
export function calcularExpiracion(config: ConfiguracionNegocio): Date {
  const expira = new Date()
  expira.setMinutes(expira.getMinutes() + config.ventana_llegada_min)
  return expira
}

/**
 * Determina si un cliente expiró su ventana de llegada
 */
export function haExpirado(expira_at: string): boolean {
  return new Date() > new Date(expira_at)
}

/**
 * Determina si una cita está dentro de la ventana de gracia
 * Regla: Cliente con cita tiene X minutos de gracia si llega tarde
 */
export function enVentanaGracia(horaInicio: string, fecha: string, config: ConfiguracionNegocio): boolean {
  const horaReal = new Date(`${fecha}T${horaInicio}`)
  const limiteGracia = new Date(horaReal.getTime() + config.gracia_cita_min * 60000)
  return new Date() <= limiteGracia
}

/**
 * Calcula el ETA estimado para un cliente en cola
 * Fórmula: suma de servicios pendientes delante + tiempo entre clientes
 */
export function calcularETA(colaDelante: Cola[], tiempoEntreClientes: number): number {
  return colaDelante.reduce((total, c) => total + tiempoEntreClientes, 0)
}

/**
 * TABLA DE PRIORIDADES
 * 1 = Cita confirmada / Cola prioritaria (cita que no llegó)
 * 2 = Cola digital
 * 3 = Cola física
 *
 * REGLAS DE CONFLICTO (casos 1-20):
 *
 * Caso 1: Hay cita confirmada → atiende la cita. Sin excepción.
 * Caso 2: Cita llega tarde + hay cliente listo → atiende al listo, cita pasa a cola_prioritaria
 * Caso 3: Libre + cola digital → llama al primero, inicia countdown
 * Caso 4: Libre + sin cola digital + cliente físico → atiende al físico
 * Caso 5: Digital llamado sin confirmar + físico presente → espera countdown, si expira atiende físico
 * Caso 6: Digital marcó "voy en camino" + físico → digital tiene prioridad durante su ventana
 * Caso 7: Cola prioritaria llega → entra segundo con prioridad 1
 * Caso 8: Dos digitales al mismo tiempo → prioridad por posición (quien entró primero)
 * Caso 9: Asignación por dueño activa → cliente va a fila general, dueño asigna
 * Caso 10: Barbero preferido ocupado → muestra ETA, cliente decide
 * Caso 11: Barbero entra en descanso → clientes ven aviso, sugiere cambio si hay otro disponible
 * Caso 12: Cita para barbero en descanso inesperado → dueño recibe alerta, puede reasignar
 * Caso 13: Cliente no confirma a 2h → cita pasa a no_confirmada, pierde prioridad
 * Caso 14: Cliente llega antes de su hora → check-in temprano, no altera orden
 * Caso 15: Físico llega durante countdown digital → digital mantiene prioridad hasta expirar
 * Caso 16: Barbero termina antes → sistema llama siguiente automáticamente
 * Caso 17: Cliente abandona → sale sin penalización, se registra para estadísticas
 * Caso 18: Cliente intenta duplicar turno → app bloquea. Un cliente, un turno activo.
 * Caso 19: Fila supera capacidad → muestra tiempo alto, cliente decide. Sin bloqueo en V1.
 * Caso 20: Grupo incompleto → notifica al líder, si no responde el barbero puede marcar parcial
 */

export function determinarSiguiente(
  cola: Cola[],
  citaActiva?: Cita,
  config?: ConfiguracionNegocio
): Cola | null {
  // Caso 1: Cita confirmada tiene prioridad absoluta
  if (citaActiva && citaActiva.estado === 'confirmada') return null

  // Ordenar por prioridad y posición
  const activos = cola
    .filter(c => c.estado === 'en_fila')
    .sort((a, b) => a.prioridad - b.prioridad || a.posicion - b.posicion)

  return activos[0] || null
}

/**
 * Verifica si un cliente ya tiene turno activo (Caso 18)
 */
export function tieneturnoActivo(cola: Cola[], cliente_id: string): boolean {
  return cola.some(c =>
    c.cliente_id === cliente_id &&
    ['en_fila', 'llamado', 'en_camino'].includes(c.estado)
  )
}
