/**
 * LAS PIEZAS QUE SE REPITEN EN LAS PANTALLAS, CON LA LÍNEA GRÁFICA DE TURNO.
 *
 * Mismo nombre y misma forma de uso que en D2 —las pantallas no cambian—, con
 * el aspecto del handoff (docs/diseno-turno/README.md):
 *   · Encabezado: el subtítulo encima (14, gris) y el título h1 28/700.
 *   · Rótulo: overline 12/700 en mayúsculas espaciadas, sin raya.
 *   · Pestañas: segmento de chips; el activo en tinta con texto blanco.
 *   · Cifras: celdas con borde fino y el número en mono.
 */
import { ReactNode } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { COLORS, FONTS } from '../constants'

export function Encabezado({ titulo, sub, derecha }: { titulo: string; sub?: string | null; derecha?: ReactNode }) {
  return (
    <View style={s.cab}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {!!sub && <Text style={s.sub} numberOfLines={2}>{sub}</Text>}
        <Text style={s.titulo} numberOfLines={2}>{titulo}</Text>
      </View>
      {derecha}
    </View>
  )
}

/** Rótulo de sección (overline). `accion` va a la derecha, en azul.
 *  `sinRaya` se acepta por compatibilidad: ya no hay raya. */
export function Rotulo({ children, accion, onAccion, style }: {
  children: ReactNode; accion?: string; onAccion?: () => void; sinRaya?: boolean; style?: any
}) {
  return (
    <View style={[{ marginTop: 22, marginBottom: 4 }, style]}>
      <View style={s.rotFila}>
        <Text style={s.rot}>{children}</Text>
        {!!accion && (
          <TouchableOpacity onPress={onAccion} hitSlop={10} accessibilityRole="button">
            <Text style={s.rotAccion}>{accion}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

/** Segmento: el elegido en tinta con texto blanco; los demás con borde. */
export function Pestanas<K extends string>({ opciones, valor, onCambio }: {
  opciones: readonly { k: K; l: string }[]; valor: K; onCambio: (k: K) => void
}) {
  return (
    <View style={s.pest}>
      {opciones.map(o => {
        const on = o.k === valor
        return (
          <TouchableOpacity key={o.k} onPress={() => onCambio(o.k)} style={[s.pestBtn, on && s.pestOn]}
            accessibilityRole="tab" accessibilityState={{ selected: on }} activeOpacity={0.85}>
            <Text style={[s.pestT, on && s.pestTOn]} numberOfLines={1}>{o.l}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

/** Una fila de cifras, cada una en su celda; los números en mono. */
export function Cifras({ items }: { items: { n: string | number; l: string; color?: string }[] }) {
  return (
    <View style={s.cifras}>
      {items.map(it => (
        <View key={it.l} style={s.cifra}>
          <Text style={[s.cifraN, it.color ? { color: it.color } : null]} numberOfLines={1} adjustsFontSizeToFit>{it.n}</Text>
          <Text style={s.cifraL} numberOfLines={1}>{it.l}</Text>
        </View>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  cab: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  titulo: { fontFamily: FONTS.bold, fontSize: 28, lineHeight: 34, color: COLORS.ink, letterSpacing: -0.6 },
  sub: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textMid, marginBottom: 4 },
  rotFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rot: { flexShrink: 1, fontFamily: FONTS.bold, fontSize: 12, letterSpacing: 1, color: COLORS.textMid, textTransform: 'uppercase' },
  rotAccion: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.blue },
  pest: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  pestBtn: { minHeight: 36, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center' },
  pestOn: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  pestT: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.textMid },
  pestTOn: { color: '#FFFFFF' },
  cifras: { flexDirection: 'row', gap: 8 },
  cifra: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 12 },
  cifraN: { fontFamily: FONTS.mono, fontSize: 24, lineHeight: 28, color: COLORS.ink, letterSpacing: -0.5 },
  cifraL: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 4 },
})
