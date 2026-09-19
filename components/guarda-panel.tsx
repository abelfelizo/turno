/**
 * LA GUARDA QUE NO EXISTÍA.
 *
 * Hasta ahora el rol se comprobaba UNA vez, en app/index.tsx, al arrancar en
 * frío. Después, nunca más. Los tres _layout.tsx montaban sus pestañas sin
 * mirar la sesión, así que cualquier cosa que llevara a una ruta de otro panel
 * —un push, un `replace` a medias, una pantalla que se quedó montada al
 * cambiar de panel— pintaba ese panel entero sin una sola queja.
 *
 * Se veía de dos formas, y las dos las reportó el piloto:
 *
 *   · LAS PESTAÑAS DE UN ROL CON EL CONTENIDO DE OTRO. Las pestañas las pone
 *     el layout de la carpeta; el contenido lo pintan pantallas que leen la
 *     sesión por su cuenta. Si la sesión dice una cosa y la carpeta otra, cada
 *     mitad obedece a su jefe y sale una app que no es de nadie.
 *
 *   · PANTALLAS VACÍAS O A MEDIAS. Al pasar a cliente, la sesión se guarda a
 *     propósito con `perfil_id: undefined` (no eres barbero en ese panel). Una
 *     pantalla de barbero que siga viva lo lee, consulta con un perfil que no
 *     existe y se pinta sin datos: con pinta de rota, no de vacía.
 *
 * POR QUÉ NO SE PINTA NADA MIENTRAS SE COMPRUEBA. Pintar primero y corregir
 * después es exactamente el fallo que se está arreglando: el usuario ve medio
 * segundo del panel equivocado, con datos reales de otro local. La primera
 * comprobación es una lectura de AsyncStorage —milisegundos— así que se espera.
 * Las siguientes NO vuelven a bloquear: una vez validado, el panel se queda
 * pintado mientras se revalida, y solo desaparece si de verdad deja de
 * corresponder. Así no parpadea al ir y volver entre pestañas.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import type { ReactNode } from 'react'
import { getSesion } from '../lib/storage'
import { INICIO_DE_PANEL } from '../lib/paneles'
import { COLORS } from '../constants'
import type { PanelActivo } from '../types'

export default function GuardaPanel({ panel, children }: { panel: PanelActivo; children: ReactNode }) {
  // null = todavía no se ha comprobado nunca. No es lo mismo que "está mal":
  // por eso son tres estados y no un booleano.
  const [correcto, setCorrecto] = useState<boolean | null>(null)
  const router = useRouter()

  // Se pone a `true` AL MONTAR, no solo al declararlo. React puede montar,
  // limpiar y volver a montar el mismo componente (modo estricto, recarga en
  // caliente); si la limpieza lo deja en `false` y nadie lo devuelve a `true`,
  // la comprobación se completa pero ya no se atreve a tocar el estado — y la
  // pantalla se queda en el spinner para siempre.
  const vivo = useRef(true)
  useEffect(() => {
    vivo.current = true
    return () => { vivo.current = false }
  }, [])

  const comprobar = useCallback(async () => {
    try {
      const ss = await getSesion()
      if (!vivo.current) return

      // Sin sesión no se adivina: index.tsx es quien sabe resolver a dónde va
      // esta persona, y hacerlo aquí sería tener esa lógica en dos sitios.
      if (!ss?.panel) { setCorrecto(false); router.replace('/'); return }

      if (ss.panel !== panel) {
        setCorrecto(false)
        router.replace(INICIO_DE_PANEL[ss.panel] as any)
        return
      }
      setCorrecto(true)
    } catch {
      // Si la sesión no se puede ni leer, lo que NO se puede hacer es dejar a
      // la persona mirando un spinner: eso no tiene salida desde el teléfono.
      // Se la manda al arranque, que sabe llevarla al login si hace falta.
      if (vivo.current) { setCorrecto(false); router.replace('/') }
    }
  }, [panel, router])

  // DOS DISPARADORES A PROPÓSITO, Y NO ES REDUNDANCIA.
  //
  // `useFocusEffect` es el que hace el trabajo de verdad: revalida cada vez que
  // se vuelve a esta carpeta, que es cuando el panel puede haber cambiado. Pero
  // si por lo que sea no llegara a dispararse dentro de un layout, esta pantalla
  // se quedaría en el spinner PARA SIEMPRE, sin salida posible desde el
  // teléfono: exactamente la avería que no nos podemos permitir mandar por
  // aire. El `useEffect` de montaje es el seguro: corre siempre, una vez, y
  // garantiza que la primera comprobación termina pase lo que pase.
  useEffect(() => { comprobar() }, [comprobar])
  useFocusEffect(useCallback(() => { comprobar() }, [comprobar]))

  if (correcto !== true) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={COLORS.red} size="large" />
      </View>
    )
  }
  return <>{children}</>
}
