/**
 * EL LOGO DE TURNO (dirección C, «Ticket») — docs/diseno-turno/Logo C - Ticket.dc.html.
 *
 * Un ticket de turno de 110×76 con radio 4 y muescas semicirculares a media
 * altura; a la izquierda un talón de 28 con el poste, separado por una línea
 * discontinua; en el cuerpo, una T (barra 46×10, tronco 10×32).
 *
 * Se dibuja con vistas y no con SVG para no sumar una librería nativa (que
 * pediría un APK nuevo): las muescas son círculos del color del fondo, y el
 * poste es el mismo componente de la app. `fondo` tiene que ser el color de
 * lo que hay detrás, o las muescas se ven como lunares.
 *
 * `positive`: ticket negro y T blanca. `negative`: ticket blanco y T negra.
 */
import { View, Text, StyleSheet } from 'react-native'
import { COLORS, FONTS } from '../constants'
import { Pole } from './ui'

export function TurnoSimbolo({ ancho = 30, variante = 'positive', fondo = COLORS.bg }: {
  ancho?: number; variante?: 'positive' | 'negative'; fondo?: string
}) {
  const k = ancho / 110
  const alto = Math.round(76 * k)
  const tinta = variante === 'positive' ? COLORS.ink : '#FFFFFF'
  const letra = variante === 'positive' ? '#FFFFFF' : COLORS.ink
  const muesca = Math.max(4, Math.round(16 * k))
  const trazos = Math.max(3, Math.round(alto / (7 * Math.max(k, 0.3))))
  return (
    <View style={{ width: ancho, height: alto, borderRadius: Math.max(2, 4 * k), backgroundColor: tinta, overflow: 'hidden' }}>
      <Pole height="auto" animado={false} ancho={Math.max(2, 4.5 * k)}
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 28 * k }} />
      {/* La línea discontinua entre el talón y el cuerpo. */}
      <View style={{ position: 'absolute', left: 28 * k - Math.max(1, k), top: 6 * k, bottom: 6 * k, width: Math.max(1, 2 * k), justifyContent: 'space-between' }}>
        {Array.from({ length: trazos }).map((_, i) => (
          <View key={i} style={{ height: Math.max(1, 3 * k), backgroundColor: letra }} />
        ))}
      </View>
      {/* La T. */}
      <View style={{ position: 'absolute', left: 46 * k, top: 18 * k, width: 46 * k, height: 10 * k, backgroundColor: letra }} />
      <View style={{ position: 'absolute', left: 64 * k, top: 28 * k, width: 10 * k, height: 32 * k, backgroundColor: letra }} />
      {/* Las muescas: círculos del color del fondo que muerden los lados. */}
      <View style={[st.muesca, { width: muesca, height: muesca, borderRadius: muesca / 2, backgroundColor: fondo, left: -muesca / 2, top: (alto - muesca) / 2 }]} />
      <View style={[st.muesca, { width: muesca, height: muesca, borderRadius: muesca / 2, backgroundColor: fondo, right: -muesca / 2, top: (alto - muesca) / 2 }]} />
    </View>
  )
}

/** Símbolo + «Turno». La tipografía de la marca está pendiente: 17/700 provisional. */
export default function TurnoLogo({ variante = 'positive', ancho = 30, fondo = COLORS.bg, tamanoTexto = 17 }: {
  variante?: 'positive' | 'negative'; ancho?: number; fondo?: string; tamanoTexto?: number
}) {
  return (
    <View style={st.fila} accessibilityRole="image" accessibilityLabel="Turno">
      <TurnoSimbolo ancho={ancho} variante={variante} fondo={fondo} />
      <Text style={[st.palabra, { fontSize: tamanoTexto, color: variante === 'positive' ? COLORS.ink : '#FFFFFF' }]}>Turno</Text>
    </View>
  )
}

const st = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  palabra: { fontFamily: FONTS.semibold, letterSpacing: -0.2 },
  muesca: { position: 'absolute' },
})
