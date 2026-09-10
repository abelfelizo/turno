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
 * de volver: la app no tiene gesto de deslizar hacia atrás.
 */
import { ReactNode } from 'react'
import {
  Modal, View, ScrollView, StyleSheet, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, useWindowDimensions,
} from 'react-native'
import { COLORS } from '../constants'

export default function Hoja({ visible, onClose, children }: {
  visible: boolean
  onClose: () => void
  children: ReactNode
}) {
  const { height } = useWindowDimensions()
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
        <View style={[s.hoja, { maxHeight: height * 0.88 }]}>
          <View style={s.agarre} />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const s = StyleSheet.create({
  fondo: { flex: 1, justifyContent: 'flex-end' },
  telon: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  hoja: { backgroundColor: COLORS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 10, paddingBottom: 34 },
  // La barrita de arriba: dice "esto se cierra" sin escribirlo.
  agarre: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border, marginBottom: 14 },
})
