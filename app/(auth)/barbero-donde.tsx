import { useState } from 'react'
import { useRouter } from 'expo-router'
import { OnbScreen, Opcion, BotonPrimario } from '../../components/onb'
import { borrador } from '../../lib/onboarding'

/**
 * ¿DÓNDE TRABAJAS?
 *
 * Del teléfono vinieron dos cosas que se resuelven en esta pantalla:
 *
 *   «¿Un barbero siempre debe tener local o no? Si el local no tiene app, ¿qué
 *    pasa?»
 *   «Desde el onboarding solo se crean 3 usuarios: cliente, barbero y dueño.»
 *
 * La primera destapó que el barbero que alquila un sillón en una barbería que NO
 * usa Turno se quedaba fuera en la pantalla uno: "trabajo en una barbería" le
 * pedía el CÓDIGO de un local que no existe en la app.
 *
 * La respuesta NO es una cuarta puerta en bienvenida — los usuarios son tres y
 * él es un barbero como cualquier otro. Es una pregunta más dentro de su propio
 * camino, que es donde toca: primero qué haces, después dónde.
 *
 * Por dentro las dos ramas acaban igual de bien: turno_perfiles.negocio_id es
 * NOT NULL, así que el barbero SIEMPRE tiene un negocio. Lo que cambia es si se
 * mete en uno que ya existe o si se monta el suyo de una silla.
 */
export default function BarberoDonde() {
  const router = useRouter()
  const [donde, setDonde] = useState<'local' | 'solo' | undefined>(
    borrador.solo === true ? 'solo' : borrador.solo === false ? 'local' : undefined,
  )

  function continuar() {
    if (donde === 'solo') {
      borrador.solo = true
      // En un local de uno, "alquilo mi asiento" es literalmente lo que es:
      // manda él en sus precios y sus horarios, y desde la migración 93 paga SU
      // silla sin depender de que ningún local pague por él.
      borrador.tipoNegocio = 'espacios_rentados'
      borrador.atiende = true
      router.push('/(auth)/negocio-config')
    } else {
      borrador.solo = false
      router.push('/(auth)/barbero-codigo')
    }
  }

  return (
    <OnbScreen paso="Tu trabajo · 2 de 4" titulo="¿Dónde trabajas?"
      subtitulo="Mandas tú en tus precios y tus horarios en los dos casos. Esto solo decide si te unes a un local que ya está en Turno o si montas el tuyo.">
      <Opcion label="En una barbería que usa Turno"
        desc="Te piden el código del local. El dueño tiene que aceptarte: entrar a un local lo firman los dos."
        seleccionado={donde === 'local'} onPress={() => setDonde('local')} />
      <Opcion label="Por mi cuenta"
        desc="Alquilas un sillón, trabajas a domicilio o tienes tu propio espacio. Te montamos tu código, tu fila y tu agenda."
        seleccionado={donde === 'solo'} onPress={() => setDonde('solo')} />
      <BotonPrimario texto="Continuar" onPress={continuar} disabled={!donde} />
    </OnbScreen>
  )
}
