/**
 * RECARGAR AL VOLVER A LA PANTALLA. SIEMPRE, Y SOLO UNA VEZ A LA VEZ.
 *
 * Las pestañas no se desmontan al salir de ellas: se quedan vivas con lo que
 * cargaron la primera vez. Cada pantalla del cliente resolvía esto a su
 * manera, y las cuatro maneras fallaban por un sitio distinto:
 *
 *   · Historial cargaba solo al montar. Nunca más. Calificabas una visita,
 *     ibas a otra pestaña, volvías, y seguía sin calificar hasta cerrar la app.
 *   · Ajustes cargaba al montar Y al enfocar — que en el primer enfoque son
 *     el mismo instante. Dos veces lo mismo en cada apertura.
 *   · Mi turno se saltaba el primer enfoque a propósito, para no repetir la
 *     carga del montaje, y con eso dependía de que el montaje y el enfoque
 *     llegaran en el orden que se esperaba.
 *
 * Aquí es una sola regla: CADA enfoque recarga, incluido el primero, y el
 * montaje no carga nada por su cuenta. Así no hay doble viaje al abrir ni una
 * pantalla vieja al volver.
 *
 * Y NUNCA DOS A LA VEZ. Entre el enfoque, el reloj y los avisos en vivo, dos
 * cargas se solapan con facilidad, y la que sale antes puede volver después:
 * la vieja pisaría a la nueva y la pantalla retrocedería. Si llega una
 * petición con otra en curso, se apunta y se hace UNA más al terminar — con
 * lo último que haya, que es lo único que importa.
 */
import { useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'

export function useRecargaAlEnfocar(cargar: () => Promise<unknown>) {
  const enCurso = useRef(false)
  const pendiente = useRef(false)
  // La función se guarda en una ref para que `correr` sea estable: si
  // cambiara con cada render, el enfoque la tomaría por nueva y recargaría.
  const fn = useRef(cargar)
  fn.current = cargar

  const correr = useCallback(async (): Promise<void> => {
    if (enCurso.current) { pendiente.current = true; return }
    enCurso.current = true
    try { await fn.current() }
    catch { /* cada pantalla ya enseña su propio fallo; aquí no se traga nada nuevo */ }
    finally {
      enCurso.current = false
      if (pendiente.current) { pendiente.current = false; void correr() }
    }
  }, [])

  useFocusEffect(useCallback(() => { void correr() }, [correr]))
  return correr
}
