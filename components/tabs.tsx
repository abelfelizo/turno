/**
 * LA BARRA DE ABAJO · liquid glass (docs/diseno-turno/README.md § 6).
 *
 * Flotante: separada 16 de los lados y del borde inferior, 68 de alto, radio
 * 32, vidrio desenfocado de verdad (BlurView) y la pestaña activa como una
 * píldora de tinta. El hueco de abajo lo sigue diciendo el sistema
 * (`useSafeAreaInsets().bottom`), no un número fijo: con gestos o con los
 * tres botones de Android la barra se aparta sola.
 *
 * La escena se recorta por encima de la barra (`sceneStyle.paddingBottom`)
 * para que lo último de cada lista no quede escondido debajo.
 */
import { StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { COLORS, FONTS, GLASS } from '../constants'

export const iconoTab = (name: keyof typeof Ionicons.glyphMap) =>
  ({ color }: { color: string; size: number }) => <Ionicons name={name} color={color} size={21} />

const ALTO = 72

export function useOpcionesTabs() {
  const insets = useSafeAreaInsets()
  const abajo = Math.max(insets.bottom, 12) + 8
  return {
    headerShown: false as const,
    sceneStyle: { backgroundColor: 'transparent', paddingBottom: ALTO + abajo + 6 },
    // La pestaña activa es una píldora de color entero: tinta de día, blanco de noche.
    tabBarActiveTintColor: COLORS.onInk,
    tabBarInactiveTintColor: COLORS.ink,
    tabBarActiveBackgroundColor: COLORS.ink,
    tabBarStyle: {
      position: 'absolute' as const,
      left: 16, right: 16, bottom: abajo,
      height: ALTO,
      paddingTop: 0, paddingBottom: 0, paddingHorizontal: 5,
      borderRadius: 36,
      borderTopWidth: 0,
      borderWidth: 1, borderColor: GLASS.border,
      backgroundColor: 'transparent',
      overflow: 'hidden' as const,
      elevation: 0,
      shadowOpacity: 0,
    },
    tabBarItemStyle: { marginVertical: 5, borderRadius: 31, overflow: 'hidden' as const, paddingTop: 5, paddingBottom: 7, height: 62 },
    tabBarLabelStyle: { fontSize: 11, lineHeight: 13, fontFamily: FONTS.semibold, marginTop: 1 },
    tabBarBackground: () => (
      <BlurView intensity={55} tint={GLASS.tinte} style={[StyleSheet.absoluteFill, { backgroundColor: GLASS.fill }]} />
    ),
  }
}
