/**
 * LA BARRA DE ABAJO, RESPETANDO LOS BOTONES DEL TELÉFONO.
 *
 * Reportado desde el teléfono: "los controles del móvil tapan parte del menú".
 * Los tres paneles tenían la barra escrita a mano con `height: 84` y
 * `paddingBottom: 26`, dos números fijos que salieron de un teléfono concreto.
 * En uno con barra de gestos alta —o con los tres botones de Android— el
 * sistema dibuja encima y se come las etiquetas.
 *
 * La altura no se adivina: la dice el sistema. `useSafeAreaInsets().bottom` es
 * exactamente el hueco que hay que dejar, y en un teléfono sin nada abajo vale
 * cero y la barra queda como estaba.
 *
 * Vive aquí y no copiado tres veces porque son la misma barra: cuando la de
 * cliente se arregle sola y la de barbero no, se nota.
 */
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { COLORS } from '../constants'

export const iconoTab = (name: keyof typeof Ionicons.glyphMap) =>
  ({ color, size }: { color: string; size: number }) => <Ionicons name={name} color={color} size={size} />

export function useOpcionesTabs() {
  const insets = useSafeAreaInsets()
  // 12 es el aire que la barra necesita por debajo del texto cuando el sistema
  // no reserva nada; con gestos o botones, manda el sistema.
  const abajo = Math.max(insets.bottom, 12)
  return {
    headerShown: false as const,
    tabBarActiveTintColor: COLORS.red,
    tabBarInactiveTintColor: COLORS.textLight,
    tabBarStyle: {
      height: 58 + abajo,
      paddingBottom: abajo,
      paddingTop: 8,
      borderTopColor: COLORS.border,
    },
    tabBarLabelStyle: { fontSize: 11, fontWeight: '700' as const },
  }
}
