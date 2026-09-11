import { useState } from 'react'
import { useRouter } from 'expo-router'
import { OnbScreen, Opcion, BotonPrimario } from '../../components/onb'
import { borrador, resetBorrador } from '../../lib/onboarding'
import type { TipoServicio } from '../../types'

/**
 * EL BARBERO QUE TRABAJA POR SU CUENTA.
 *
 * Reportado desde el teléfono: «¿un barbero siempre debe tener local o no? Si
 * el local no tiene app, ¿qué pasa?».
 *
 * Pasa que se quedaba fuera en la pantalla uno. Las tres puertas de bienvenida
 * eran "Tengo una barbería" —él no la tiene, alquila un sillón—, "Trabajo en
 * una barbería" —que pide el CÓDIGO de un local que no está en la app, porque
 * su casero no la usa— y "Soy cliente". El único camino correcto era el
 * primero, y es justo el que nunca iba a pulsar.
 *
 * Y si lo pulsaba, la siguiente le preguntaba «¿alquilas asientos o tienes
 * empleados?» y él no hace ninguna de las dos: tenía que elegir al azar.
 *
 * Por dentro no hay nada nuevo. turno_perfiles.negocio_id es NOT NULL, así que
 * el barbero solo SIEMPRE tiene un negocio; lo que es opcional es que haya
 * alguien más dentro. Esta pantalla monta ese negocio de una silla sin hacerle
 * ninguna de las dos preguntas que no le tocan:
 *
 *   · tipo 'espacios_rentados', que en un local de uno significa exactamente lo
 *     que él es: alguien que manda en sus precios, sus horarios y su agenda. Y
 *     desde la migración 93 es también lo que hace que pague SU silla y no
 *     dependa de que un local pague por él.
 *   · atiende = true, que es toda la razón por la que se está dando de alta.
 */
export default function SoloTipo() {
  const router = useRouter()
  const [tipoServicio, setTipoServicio] = useState<TipoServicio | undefined>(borrador.tipoServicio)

  function continuar() {
    resetBorrador()
    borrador.solo = true
    borrador.tipoNegocio = 'espacios_rentados'
    borrador.atiende = true
    borrador.tipoServicio = tipoServicio ?? 'barbero'
    router.push('/(auth)/negocio-config')
  }

  return (
    <OnbScreen paso="Lo tuyo · 1 de 2" titulo="¿A qué te dedicas?"
      subtitulo="Montamos tu espacio con tu código, tu fila y tu agenda. Mandas tú en tus precios y tus horarios, trabajes donde trabajes.">
      <Opcion label="Barbería" desc="Cortes, barba y demás."
        seleccionado={tipoServicio === 'barbero'} onPress={() => setTipoServicio('barbero')} />
      <Opcion label="Manicure / Pedicure" desc="Uñas y cuidado de manos y pies."
        seleccionado={tipoServicio === 'manicuri_pedicuri'} onPress={() => setTipoServicio('manicuri_pedicuri')} />
      <BotonPrimario texto="Continuar" onPress={continuar} disabled={!tipoServicio} />
    </OnbScreen>
  )
}
