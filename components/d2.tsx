/**
 * PIEZAS D2 QUE SE REPITEN EN LAS PANTALLAS CLARAS.
 *
 * Cada pantalla del barbero las dibujaba a su manera: el rótulo de sección en
 * gris con o sin raya, las pestañas como botones con borde, el título a veces
 * centrado. En los tableros D2 son siempre las mismas tres piezas, así que
 * viven aquí una vez: el título en Anton a la izquierda, el rótulo con su
 * raya negra de 2 px, y las pestañas subrayadas en rojo.
 */
import { ReactNode } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { COLORS, FONTS } from '../constants'

export function Encabezado({ titulo, sub, derecha }: { titulo: string; sub?: string | null; derecha?: ReactNode }) {
  return (
    <View style={s.cab}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.titulo} numberOfLines={2}>{titulo}</Text>
        {!!sub && <Text style={s.sub} numberOfLines={2}>{sub}</Text>}
      </View>
      {derecha}
    </View>
  )
}

/** Rótulo de sección con su raya. `accion` va a la derecha, en azul. */
export function Rotulo({ children, accion, onAccion, sinRaya, style }: {
  children: ReactNode; accion?: string; onAccion?: () => void; sinRaya?: boolean; style?: any
}) {
  return (
    <View style={[{ marginTop: 24 }, style]}>
      <View style={s.rotFila}>
        <Text style={s.rot}>{children}</Text>
        {!!accion && (
          <TouchableOpacity onPress={onAccion} hitSlop={10} accessibilityRole="button">
            <Text style={s.rotAccion}>{accion}</Text>
          </TouchableOpacity>
        )}
      </View>
      {!sinRaya && <View style={s.raya} />}
    </View>
  )
}

/** Pestañas subrayadas: la elegida en negro con la barra roja debajo. */
export function Pestanas<K extends string>({ opciones, valor, onCambio }: {
  opciones: readonly { k: K; l: string }[]; valor: K; onCambio: (k: K) => void
}) {
  return (
    <View style={s.pest}>
      {opciones.map(o => {
        const on = o.k === valor
        return (
          <TouchableOpacity key={o.k} onPress={() => onCambio(o.k)} style={[s.pestBtn, on && s.pestOn]}
            accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <Text style={[s.pestT, on && s.pestTOn]} numberOfLines={1}>{o.l}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

/** Una fila de cifras separadas por filetes, como en los tableros. */
export function Cifras({ items }: { items: { n: string | number; l: string; color?: string }[] }) {
  return (
    <View style={s.cifras}>
      {items.map((it, i) => (
        <View key={it.l} style={[s.cifra, i > 0 && { paddingLeft: 14 }, i < items.length - 1 && s.cifraSep]}>
          <Text style={[s.cifraN, it.color ? { color: it.color } : null]} numberOfLines={1} adjustsFontSizeToFit>{it.n}</Text>
          <Text style={s.cifraL} numberOfLines={1}>{it.l}</Text>
        </View>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  cab: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  titulo: { fontFamily: FONTS.display, fontSize: 30, lineHeight: 35, color: COLORS.ink, textTransform: 'uppercase', letterSpacing: 0.4 },
  sub: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.textMid, marginTop: 4 },
  rotFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rot: { flexShrink: 1, fontFamily: FONTS.extrabold, fontSize: 11, letterSpacing: 2, color: COLORS.textLight, textTransform: 'uppercase' },
  rotAccion: { fontFamily: FONTS.extrabold, fontSize: 12.5, color: COLORS.blue },
  raya: { height: 2, backgroundColor: COLORS.ink, marginTop: 8 },
  pest: { flexDirection: 'row', gap: 22, marginTop: 16, borderBottomWidth: 2, borderBottomColor: COLORS.ink },
  pestBtn: { paddingBottom: 10, marginBottom: -2, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  pestOn: { borderBottomColor: COLORS.red },
  pestT: { fontFamily: FONTS.semibold, fontSize: 13.5, color: COLORS.textMid },
  pestTOn: { fontFamily: FONTS.extrabold, color: COLORS.ink },
  cifras: { flexDirection: 'row', borderTopWidth: 2, borderTopColor: COLORS.ink, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  cifra: { flex: 1, paddingVertical: 13, minWidth: 0 },
  cifraSep: { borderRightWidth: 1, borderRightColor: COLORS.border },
  cifraN: { fontFamily: FONTS.display, fontSize: 28, lineHeight: 33, color: COLORS.ink },
  cifraL: { fontFamily: FONTS.semibold, fontSize: 11.5, color: COLORS.textMid, marginTop: 2 },
})
