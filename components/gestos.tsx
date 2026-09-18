/**
 * LOS DOS GESTOS QUE LA GENTE INTENTA SIN QUE NADIE SE LOS ENSEÑE.
 *
 * Arrastrar una hoja hacia abajo para cerrarla, y deslizar desde el borde
 * izquierdo para volver. Los dos estaban prometidos por la interfaz y no
 * pasaba nada: la hoja tiene su barrita gris arriba —que en todas las apps
 * significa "esto se arrastra"— y las pantallas de dentro tienen flecha de
 * volver, que es el sitio donde el pulgar espera poder empujar.
 *
 * POR QUÉ CON PanResponder Y NO CON gesture-handler.
 * `react-native-gesture-handler` haría esto mejor —corre en el hilo de la UI y
 * no se pelea con los ScrollView— pero es código NATIVO: entra con un APK
 * nuevo, no por actualización por aire. PanResponder viene dentro de React
 * Native, así que estos dos gestos llegan al teléfono que ya tiene la app
 * instalada. La diferencia se nota en un caso concreto, anotado abajo.
 */
import { useRef } from 'react'
import { Animated, PanResponder, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { COLORS } from '../constants'

/**
 * ARRASTRAR HACIA ABAJO PARA CERRAR.
 *
 * Devuelve el desplazamiento para pintarlo y los manejadores para pegarlos
 * DONDE SE AGARRA, no en la hoja entera: si el gesto se escucha sobre todo el
 * contenido, el ScrollView de dentro deja de poder desplazarse y la hoja larga
 * se vuelve inservible. Por eso la barrita de arriba es la zona de arrastre, y
 * es la razón de que sea más alta de lo que parece.
 *
 * Cierra si el dedo baja más del umbral O si lo sueltas con velocidad: un
 * empujón corto y rápido es tan intencional como un arrastre largo, y pedir
 * los dos a la vez es lo que hace que un gesto se sienta agarrotado.
 */
export function useArrastrarParaCerrar(onClose: () => void, opciones?: { umbral?: number }) {
  const umbral = opciones?.umbral ?? 110
  const y = useRef(new Animated.Value(0)).current

  // El cierre se guarda en una ref porque el PanResponder se crea UNA vez: si
  // se capturara la función del primer render, cerraría con datos viejos.
  const cerrar = useRef(onClose)
  cerrar.current = onClose

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => { if (g.dy > 0) y.setValue(g.dy) },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > umbral || g.vy > 0.6) {
          // Se va hacia abajo y AL TERMINAR avisa: cerrar antes deja la hoja
          // desmontándose a media animación y se ve un salto.
          Animated.timing(y, { toValue: 900, duration: 180, useNativeDriver: true })
            .start(() => { y.setValue(0); cerrar.current() })
        } else {
          Animated.spring(y, { toValue: 0, bounciness: 2, useNativeDriver: true }).start()
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(y, { toValue: 0, bounciness: 2, useNativeDriver: true }).start()
      },
    }),
  ).current

  return { y, panHandlers: responder.panHandlers }
}

/**
 * LA BARRITA DE ARRASTRE, que ahora hace lo que promete.
 * Va con los `panHandlers` del hook puestos encima.
 */
export function Agarre() {
  return (
    <View style={s.agarreZona}>
      <View style={s.agarre} />
    </View>
  )
}

/**
 * DESLIZAR DESDE EL BORDE IZQUIERDO PARA VOLVER.
 *
 * Se pega al contenedor de la pantalla, no a un trozo invisible en el canto:
 * una tira que capture toques taparía la flecha de volver, que vive justo ahí.
 * En vez de eso, el gesto NO se reclama al tocar —los botones siguen
 * funcionando igual— y solo se reclama al mover, cuando ya se sabe que el dedo
 * va hacia la derecha y que empezó pegado al borde.
 *
 * `pageX - dx` es dónde empezó el dedo: el evento da la posición actual, y el
 * acumulado del gesto es lo que hay que restarle para saber de dónde salió.
 *
 * LÍMITE CONOCIDO: dentro de un ScrollView que ya se está desplazando, el
 * scroll se queda con el gesto y este no llega. Empezando quieto desde el
 * borde —que es como se hace— funciona. Resolverlo del todo pide
 * gesture-handler, que es nativo: anotado para la próxima versión.
 */
export function useGestoVolver(alVolver?: () => void) {
  const router = useRouter()

  const volver = useRef<() => void>(() => {})
  volver.current = alVolver ?? (() => { if (router.canGoBack()) router.back() })

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (e, g) => {
        const salida = e.nativeEvent.pageX - g.dx
        return salida < 30 && g.dx > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5
      },
      onPanResponderRelease: (_e, g) => { if (g.dx > 55 || g.vx > 0.5) volver.current() },
    }),
  ).current

  return responder.panHandlers
}

const s = StyleSheet.create({
  // Alta a propósito: es la zona que se agarra, no solo la raya que se ve.
  agarreZona: { paddingTop: 6, paddingBottom: 10, alignItems: 'center' },
  agarre: { width: 38, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
})
