/**
 * LAS PIEZAS DE UNA HOJA D2 — título, opción, dato, nota, pie y botones.
 *
 * Nacieron con las hojas de Mi silla (components/hojas-silla) y las usa
 * también la agenda: una hoja que sube desde abajo se lee igual en cualquier
 * pantalla. Van dentro de components/hoja, que pone el scroll, el teclado y
 * el hueco de la barra de Android.
 */
import { ReactNode } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS } from '../constants'

export function Titulo({ children }: { children: ReactNode }) {
  return <Text style={s.titulo}>{children}</Text>
}
export function Sub({ children }: { children: ReactNode }) {
  return <Text style={s.sub}>{children}</Text>
}
export function Seccion({ children }: { children: ReactNode }) {
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={s.secT}>{String(children).toUpperCase()}</Text>
      <View style={s.secFilete} />
    </View>
  )
}
export const TONO = { gris: COLORS.textLight, azul: COLORS.blue, ambar: COLORS.warning, rojo: COLORS.red }
export function Nota({ tono, children }: { tono: keyof typeof TONO; children: ReactNode }) {
  return (
    <View style={[s.nota, { borderLeftColor: TONO[tono] }]}>
      <Text style={s.notaT}>{children}</Text>
    </View>
  )
}
export function Dato({ l, v, color, onPress }: { l: string; v: string; color?: string; onPress?: () => void }) {
  const cuerpo = (
    <View style={s.datoFila}>
      <Text style={s.datoL}>{l}</Text>
      <Text style={[s.datoV, color ? { color } : null]} numberOfLines={2}>{v}</Text>
    </View>
  )
  return onPress
    ? <TouchableOpacity style={s.dato} onPress={onPress} activeOpacity={0.7} accessibilityRole="button">{cuerpo}</TouchableOpacity>
    : <View style={s.dato}>{cuerpo}</View>
}
export function Opcion({ t, d, rojo, flecha, disabled, onPress }: {
  t: string; d?: string; rojo?: boolean; flecha?: boolean; disabled?: boolean; onPress: () => void
}) {
  return (
    <TouchableOpacity style={[s.opc, disabled && { opacity: 0.5 }]} onPress={onPress} disabled={disabled}
      activeOpacity={0.7} accessibilityRole="button">
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.opcT, rojo && { color: COLORS.redDark }]}>{t}</Text>
        {d ? <Text style={s.opcD}>{d}</Text> : null}
      </View>
      {flecha && <Ionicons name="chevron-forward" size={17} color={COLORS.textLight} />}
    </TouchableOpacity>
  )
}
export function Pie({ children }: { children: ReactNode }) {
  return <View style={s.pie}>{children}</View>
}
export function BotonRojo({ texto, onPress, ocupado, disabled }: { texto: string; onPress: () => void; ocupado?: boolean; disabled?: boolean }) {
  const off = !!ocupado || !!disabled
  return (
    <TouchableOpacity style={[s.rojo, off && { opacity: 0.45 }]} onPress={onPress} disabled={off}
      activeOpacity={0.85} accessibilityRole="button" accessibilityState={{ disabled: off }}>
      {ocupado ? <ActivityIndicator color="#fff" /> : <Text style={s.rojoT} numberOfLines={1}>{texto}</Text>}
    </TouchableOpacity>
  )
}
export function BotonContorno({ texto, onPress }: { texto: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.contorno} onPress={onPress} activeOpacity={0.8} accessibilityRole="button">
      <Text style={s.contornoT} numberOfLines={1}>{texto}</Text>
    </TouchableOpacity>
  )
}
export function AhoraNo({ texto = 'Ahora no', onPress }: { texto?: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={s.ahoraNo} accessibilityRole="button">
      <Text style={s.ahoraNoT}>{texto}</Text>
    </TouchableOpacity>
  )
}


const s = StyleSheet.create({
  titulo: { fontFamily: FONTS.display, fontSize: 26, lineHeight: 30, color: COLORS.ink, textTransform: 'uppercase', marginTop: 4 },
  sub: { fontFamily: FONTS.medium, fontSize: 13, lineHeight: 19, color: COLORS.textMid, marginTop: 4, marginBottom: 8 },
  secT: { fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 2, color: COLORS.ink },
  secFilete: { height: 2, backgroundColor: COLORS.ink, marginTop: 7 },
  nota: { borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 4, marginVertical: 10 },
  notaT: { fontFamily: FONTS.medium, fontSize: 13, lineHeight: 19, color: COLORS.ink },
  dato: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  datoFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  datoL: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textMid },
  datoV: { flex: 1, textAlign: 'right', fontFamily: FONTS.bold, fontSize: 14.5, color: COLORS.ink },
  opc: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  opcT: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  opcD: { fontFamily: FONTS.medium, fontSize: 12.5, lineHeight: 17, color: COLORS.textMid, marginTop: 2 },
  pie: { borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 18, paddingTop: 16, gap: 4 },
  rojo: { height: 56, backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  rojoT: { fontFamily: FONTS.display, fontSize: 19, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.4 },
  contorno: { height: 54, borderWidth: 2, borderColor: COLORS.ink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  contornoT: { fontFamily: FONTS.display, fontSize: 17, color: COLORS.ink, textTransform: 'uppercase', letterSpacing: 0.4 },
  ahoraNo: { alignItems: 'center', paddingVertical: 12 },
  ahoraNoT: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.textMid },
})
