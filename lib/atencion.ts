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

type ConModo = {
  modo_atencion?: string | null
  /** Migración 74: lo calcula el servidor y puede faltar (respuesta cacheada,
   *  o la llamada que lo trae falló). null = no se sabe, nunca "cerrado". */
  fila_abierta?: boolean | null
  fila_motivo?: string | null
} | null | undefined

/** ¿Este barbero TRABAJA por fila? Es su modo, no el reloj. */
export function aceptaFila(perfil: ConModo): boolean {
  return (perfil?.modo_atencion ?? 'ambos') !== 'solo_citas'
}

/**
 * ¿Se puede entrar a su fila AHORA MISMO? Esto sí mira el horario, y por eso
 * lo contesta el servidor: la hora que importa es la del local, no la del
 * teléfono, y la regla tiene que ser la misma que aplica la puerta.
 *
 * Hasta la migración 74 la pantalla solo miraba el modo, así que un barbero
 * con el horario cerrado salía con el botón encendido y el turno reventaba al
 * tocarlo. Ahora `fila_abierta` viene con cada barbero; si falta, se cae al
 * modo, que es lo que había antes: mejor un botón de más que esconderle al
 * cliente un barbero que sí está abierto.
 */
export function filaAbierta(perfil: ConModo): boolean {
  if (perfil?.fila_abierta === true) return true
  if (perfil?.fila_abierta === false) return false
  return aceptaFila(perfil)
}

/** El porqué, con las mismas palabras que daría el servidor al rechazarlo. */
export function motivoFila(perfil: ConModo): string | null {
  return perfil?.fila_motivo ?? porQueNo(perfil)
}

/**
 * El mismo motivo, listo para enseñarlo suelto en una tarjeta.
 *
 * Los textos del servidor están escritos para encajar en las dos bocas —el
 * error de la puerta y el letrero de la tarjeta— así que vienen en minúscula y
 * sin sujeto ("está en descanso", "abre de 09:00 a 18:00"). Aquí solo se les
 * levanta la primera letra. Reescribirlos en la app sería volver a tener dos
 * versiones de la misma frase.
 */
export function fraseFila(perfil: ConModo): string | null {
  const m = motivoFila(perfil)
  return m ? m.charAt(0).toUpperCase() + m.slice(1) : null
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
