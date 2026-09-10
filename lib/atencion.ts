/**
 * POR DÓNDE ACEPTA TRABAJO UN BARBERO (migración 70).
 *
 * `turno_perfiles.modo_atencion` vale 'ambos', 'solo_citas' o 'solo_fila', y el
 * servidor ya lo hace cumplir: turno_perfil_acepta cierra la entrada a la fila,
 * la lista de huecos y la reserva según el modo. Estas dos funciones son para
 * que la app no OFREZCA lo que el servidor va a rechazar — un botón que siempre
 * da error es peor que no tener botón.
 *
 * Viven aquí y no dentro de cada pantalla porque la misma pregunta se hace en
 * tres sitios (la fila del cliente, el listado de barberos y la reserva), y una
 * regla copiada tres veces se corrige dos.
 *
 * Ojo con el `?? 'ambos'`: los perfiles anteriores a la migración 70 pueden
 * llegar sin el campo si la respuesta viene cacheada, y el silencio tiene que
 * significar "como siempre", nunca "cerrado".
 */

type ConModo = { modo_atencion?: string | null } | null | undefined

/** ¿Puede un cliente meterse en su fila desde el teléfono? */
export function aceptaFila(perfil: ConModo): boolean {
  return (perfil?.modo_atencion ?? 'ambos') !== 'solo_citas'
}

/** ¿Puede un cliente reservarle una hora? */
export function aceptaCitas(perfil: ConModo): boolean {
  return (perfil?.modo_atencion ?? 'ambos') !== 'solo_fila'
}

/** Cómo explicárselo al cliente cuando una de las dos vías no está. */
export function porQueNo(perfil: ConModo): string | null {
  const m = perfil?.modo_atencion ?? 'ambos'
  if (m === 'solo_citas') return 'Trabaja solo con cita'
  if (m === 'solo_fila') return 'Trabaja por orden de llegada'
  return null
}
