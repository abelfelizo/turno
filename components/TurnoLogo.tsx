/**
 * EL LOGO DE TURNO (dirección C, «Ticket») — handoff v3,
 * docs/diseno-turno-v3/Logo C - Ticket.dc.html.
 */
import { View, Text } from 'react-native'
import Svg, { Defs, Pattern, Rect, ClipPath, Path, G, Line } from 'react-native-svg'
import { useId } from 'react'
import { FONTS } from '../constants'

/** Símbolo "ticket" de Turno. negative = ticket blanco, T negra. */
export function TurnoMark({ size = 30, negative = false }: { size?: number; negative?: boolean }) {
  // Ids propios por instancia: dos logos en la misma pantalla no se pisan el patrón.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const h = size * 76 / 110
  const body = negative ? '#FFFFFF' : '#0B0B0C'
  const fg = negative ? '#0B0B0C' : '#FFFFFF'
  return (
    <Svg width={size} height={h} viewBox="0 0 110 76">
      <Defs>
        <Pattern id={`tp${uid}`} width={18} height={18} patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
          <Rect width={4.5} height={18} fill="#E1251B" />
          <Rect x={4.5} width={4.5} height={18} fill="#FFFFFF" />
          <Rect x={9} width={4.5} height={18} fill="#1E4FD8" />
          <Rect x={13.5} width={4.5} height={18} fill="#FFFFFF" />
        </Pattern>
        <ClipPath id={`tc${uid}`}><Path d="M6 2h98a4 4 0 0 1 4 4v24a8 8 0 0 0 0 16v24a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V46a8 8 0 0 0 0-16V6a4 4 0 0 1 4-4z" /></ClipPath>
      </Defs>
      <G clipPath={`url(#tc${uid})`}>
        <Rect width={110} height={76} fill={body} />
        <Rect width={28} height={76} fill={`url(#tp${uid})`} />
      </G>
      <Line x1={28} y1={6} x2={28} y2={70} stroke={fg} strokeWidth={2} strokeDasharray="3 4" />
      <Rect x={46} y={18} width={46} height={10} fill={fg} />
      <Rect x={64} y={28} width={10} height={32} fill={fg} />
    </Svg>
  )
}

/** Logo horizontal: símbolo + wordmark (tipografía provisional). */
export function TurnoLogo({ size = 30, negative = false }: { size?: number; negative?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <TurnoMark size={size} negative={negative} />
      <Text style={{ fontFamily: FONTS.bold, fontSize: size * 0.57, letterSpacing: -0.2, color: negative ? '#FFFFFF' : '#0B0B0C' }}>Turno</Text>
    </View>
  )
}
