/**
 * EL FONDO DEL LIQUID GLASS: gris claro con tres manchas desenfocadas —roja
 * arriba a la izquierda, azul a la derecha, tinta abajo— como en
 * docs/diseno-turno/Turno App - Glass.dc.html. Se dibuja una vez, detrás de
 * toda la app; las pantallas son transparentes y el vidrio se apoya en esto.
 *
 * Las manchas son degradados radiales (react-native-svg): se ven como un
 * círculo muy desenfocado sin tener que desenfocar nada en cada fotograma.
 */
import { ReactElement } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import Svg, { Defs, RadialGradient, Stop, Rect, Circle } from 'react-native-svg'
import { GLASS } from '../constants'

export default function FondoGlass() {
  const { width: w, height: h } = useWindowDimensions()
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: GLASS.base }]}>
      <Svg width={w} height={h}>
        <Defs>
          <RadialGradient id="rojo" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#E1251B" stopOpacity={0.55} />
            <Stop offset="0.55" stopColor="#E1251B" stopOpacity={0.22} />
            <Stop offset="1" stopColor="#E1251B" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="azul" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#1E4FD8" stopOpacity={0.5} />
            <Stop offset="0.55" stopColor="#1E4FD8" stopOpacity={0.2} />
            <Stop offset="1" stopColor="#1E4FD8" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="tinta" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#0B0B0C" stopOpacity={0.18} />
            <Stop offset="1" stopColor="#0B0B0C" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={w} height={h} fill={GLASS.base} />
        <Circle cx={-10} cy={80} r={300} fill="url(#rojo)" />
        <Circle cx={w + 30} cy={h * 0.48} r={290} fill="url(#azul)" />
        <Circle cx={60} cy={h - 120} r={250} fill="url(#tinta)" />
      </Svg>
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
