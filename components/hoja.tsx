/**
 * LA HOJA QUE SUBE DESDE ABAJO, CON EL TECLADO RESUELTO.
 *
 * Reportado desde el teléfono: "cuando sale algún formulario desde abajo, el
 * teclado termina tapando lo que estoy llenando, se superpone". Pasaba en las
 * cinco hojas de la app, y en las cinco por lo mismo: la hoja está anclada al
 * borde inferior con `justifyContent: 'flex-end'`, y el teclado de Android se
 * dibuja ENCIMA sin empujar nada.
 *
 * Aquí se arregla una vez:
 *
 *   · KeyboardAvoidingView levanta la hoja lo que mide el teclado. En iOS con
 *     'padding' y en Android con 'height', que es lo que respeta cada uno.
 *   · El contenido va dentro de un ScrollView con
 *     `keyboardShouldPersistTaps="handled"`: sin eso, el primer toque en un
 *     botón con el teclado abierto solo cierra el teclado y hay que tocar dos
 *     veces — que es la otra mitad de la queja.
 *   · Se limita al 88% de la pantalla para que una hoja larga no tape la salida.
 *
 * El botón físico de atrás cierra (onRequestClose), que en Android es LA forma
 * de volver.
 *
 * Y se cierra arrastrándola hacia abajo desde la barrita, que es lo que esa
 * barrita venía prometiendo desde el primer día: ver `components/gestos.tsx`.
 */
import { ReactNode } from 'react'
import {
  Modal, View, ScrollView, StyleSheet, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, useWindowDimensions, Animated,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
import { GLASS } from '../constants'
import { useArrastrarParaCerrar, Agarre } from './gestos'

export default function Hoja({ visible, onClose, children }: {
  visible: boolean
  onClose: () => void
  children: ReactNode
}) {
  const { height } = useWindowDimensions()
  const { y, panHandlers } = useArrastrarParaCerrar(onClose)
  /**
   * LA BARRA DE ANDROID NO ES PARTE DE LA HOJA.
   *
   * La hoja se ancla al borde de abajo de la pantalla, y en Android ese borde
   * está DEBAJO de la barra de navegación (atrás, inicio, recientes): el botón
   * de confirmar quedaba tapado por ella, o medio tapado, justo donde va el
   * pulgar. Lo que mide esa barra lo da el sistema —cambia entre botones y
   * gestos, y de un teléfono a otro— así que se suma, no se adivina.
   */
  const abajo = useSafeAreaInsets().bottom
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        style={s.fondo}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Tocar fuera cierra. Es el gesto que todo el mundo intenta primero y
            hasta ahora no hacía nada: había que buscar el "Cancelar". */}
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={s.telon} />
        </TouchableWithoutFeedback>
        <Animated.View style={[s.hoja, { maxHeight: height * 0.88, paddingBottom: 26 + abajo, transform: [{ translateY: y }] }]}>
          {/* Vidrio de verdad: lo de detrás se ve desenfocado. */}
          <BlurView intensity={60} tint={GLASS.tinte} style={[StyleSheet.absoluteFill, s.vidrio]} />
          <View {...panHandlers}><Agarre /></View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const s = StyleSheet.create({
  fondo: { flex: 1, justifyContent: 'flex-end' },
  telon: { ...StyleSheet.absoluteFillObject, backgroundColor: GLASS.scrim },
  // Liquid glass: radio 32 arriba, vidrio claro con borde blanco.
  hoja: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 26, borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden', borderWidth: 1, borderColor: GLASS.border, borderBottomWidth: 0 },
  vidrio: { backgroundColor: GLASS.fillStrong },
})
