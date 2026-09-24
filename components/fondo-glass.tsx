/**
 * EL FONDO DEL CRISTAL: la luz del poste de barbero, muy desenfocada, como se
 * ve a través de una vidriera (rojo, blanco y azul en diagonal) más un halo
 * azul abajo. Es lo que da color al cristal, que no tiene color propio.
 *
 * Son dos imágenes pre-renderizadas (assets/fondo-dia.jpg y fondo-noche.jpg)
 * y no un desenfoque en vivo: un desenfoque de pantalla completa en cada
 * pantalla costaría batería y fotogramas; una imagen no cuesta nada.
 */
import { ReactElement } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import { GLASS, NOCHE } from '../constants'

const FONDO = NOCHE ? require('../assets/fondo-noche.jpg') : require('../assets/fondo-dia.jpg')

export default function FondoGlass() {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: GLASS.base }]}>
      <Image source={FONDO} style={StyleSheet.absoluteFill} resizeMode="cover" />
    </View>
  )
}

/**
 * Cada pantalla lleva su propio fondo (`screenLayout` de los navegadores).
 * Si el fondo fuera uno solo y las pantallas transparentes, las pestañas que
 * siguen montadas detrás se verían a través de la que está delante.
 */
export function capaGlass({ children }: { children: ReactElement }) {
  return (
    <View style={{ flex: 1 }}>
      <FondoGlass />
      {children}
    </View>
  )
}
