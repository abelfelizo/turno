/**
 * LAS PIEZAS DE LA LÍNEA GRÁFICA DE TURNO (docs/diseno-turno/README.md § 3).
 *
 * Una sola forma de dibujar cada cosa, para que las pantallas no mezclen
 * estilos: fila de lista, avatar, número de puesto, estado, tarjeta, aviso,
 * botones, chip, badge de disponibilidad y campo de búsqueda. Las pantallas
 * se arman con esto y con `d2.tsx` (encabezado, rótulo, segmento, cifras).
 *
 * Reglas del handoff que viven aquí: neutros primero, rojo y azul solo de
 * acento, radio 8, separadores de 1 px, números en mono, sin sombras.
 */
import { ReactNode } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, Switch, StyleProp, ViewStyle, TextInputProps } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS } from '../constants'

type IconName = keyof typeof Ionicons.glyphMap

/** Fila de lista: principio (avatar, número o punto), título, meta y lo de la derecha. */
export function Fila({ titulo, meta, inicio, fin, onPress, ultima, apagada, tituloExtra }: {
  titulo: string; meta?: string | null; inicio?: ReactNode; fin?: ReactNode
  onPress?: () => void; ultima?: boolean; apagada?: boolean; tituloExtra?: ReactNode
}) {
  const cuerpo = (
    <>
      {inicio}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[t.filaT, apagada && { color: COLORS.textLight }]} numberOfLines={1}>{titulo}{tituloExtra}</Text>
        {!!meta && <Text style={t.filaM} numberOfLines={2}>{meta}</Text>}
      </View>
      {fin}
    </>
  )
  const st = [t.fila, ultima && { borderBottomWidth: 0 }]
  return onPress
    ? <TouchableOpacity style={st} onPress={onPress} activeOpacity={0.7} accessibilityRole="button">{cuerpo}</TouchableOpacity>
    : <View style={st}>{cuerpo}</View>
}

/** Avatar circular con iniciales (36–42). */
export function Iniciales({ nombre, size = 42, oscuro }: { nombre?: string | null; size?: number; oscuro?: boolean }) {
  const ini = String(nombre ?? '?').replace(/[.·,]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w.charAt(0)).join('').toUpperCase() || '?'
  return (
    <View style={[t.av, { width: size, height: size, borderRadius: size / 2 }, oscuro && { backgroundColor: COLORS.ink }]}>
      <Text style={[t.avT, { fontSize: Math.round(size * 0.33) }, oscuro && { color: '#fff' }]}>{ini}</Text>
    </View>
  )
}

/** Número de puesto en un cuadro gris, en mono. */
export function Puesto({ n }: { n: number | string }) {
  return <View style={t.puesto}><Text style={t.puestoT}>{n}</Text></View>
}

/** Punto de estado (8 px). */
export function Punto({ color, size = 8 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
}

/** Estado a la derecha de una fila: 13/600 del color del estado. */
export function Estado({ texto, color = COLORS.textLight }: { texto: string; color?: string }) {
  return <Text style={[t.estado, { color }]} numberOfLines={1}>{texto}</Text>
}

export function Flecha() {
  return <Ionicons name="chevron-forward" size={17} color={COLORS.disabled} />
}

/** Tarjeta: fondo blanco, borde 1 px, radio 8, sin sombra. */
export function Tarjeta({ children, style, onPress, oscura }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; oscura?: boolean }) {
  const st = [t.card, oscura && t.cardOscura, style]
  return onPress
    ? <TouchableOpacity style={st} onPress={onPress} activeOpacity={0.85} accessibilityRole="button">{children}</TouchableOpacity>
    : <View style={st}>{children}</View>
}

/** Un aviso que pide atención: tarjeta con punto rojo y enlace a la derecha. */
export function Aviso({ texto, accion, onPress, tono = 'red' }: { texto: string; accion?: string; onPress?: () => void; tono?: 'red' | 'blue' | 'gris' }) {
  const color = tono === 'red' ? COLORS.red : tono === 'blue' ? COLORS.blue : COLORS.textLight
  return (
    <Tarjeta onPress={onPress} style={t.aviso}>
      <Punto color={color} />
      <Text style={t.avisoT}>{texto}</Text>
      {!!accion && <Text style={[t.avisoA, { color }]}>{accion}</Text>}
    </Tarjeta>
  )
}

/** Botones del handoff: primary (tinta), accent (rojo, CTA final),
 *  secondary (borde) y destructive (borde, texto rojo). */
export function Boton({ texto, onPress, tipo = 'primary', ocupado, disabled, icono, style }: {
  texto: string; onPress: () => void; tipo?: 'primary' | 'accent' | 'secondary' | 'destructive'
  ocupado?: boolean; disabled?: boolean; icono?: IconName; style?: StyleProp<ViewStyle>
}) {
  const relleno = tipo === 'primary' ? COLORS.ink : tipo === 'accent' ? COLORS.red : null
  const color = relleno ? '#fff' : tipo === 'destructive' ? COLORS.redText : COLORS.ink
  const off = !!disabled || !!ocupado
  return (
    <TouchableOpacity onPress={onPress} disabled={off} activeOpacity={0.85} accessibilityRole="button"
      style={[t.btn, tipo === 'accent' && { height: 54 },
        relleno ? { backgroundColor: relleno } : { borderWidth: 1, borderColor: COLORS.border },
        disabled && !ocupado && { backgroundColor: COLORS.surfaceAlt, borderWidth: 0 }, style]}>
      {ocupado ? <ActivityIndicator color={color} /> : (
        <View style={t.btnIn}>
          {icono && <Ionicons name={icono} size={18} color={disabled ? COLORS.disabled : color} />}
          <Text style={[t.btnT, { color: disabled ? COLORS.disabled : color }, !relleno && { fontSize: 15 }]} numberOfLines={1}>{texto}</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

/** Chip de filtro o de selección: activo en tinta, inactivo con borde. */
export function Chip({ texto, activo, onPress }: { texto: string; activo?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityState={{ selected: !!activo }}
      style={[t.chip, activo && t.chipOn]}>
      <Text style={[t.chipT, activo && { color: '#fff' }]} numberOfLines={1}>{texto}</Text>
    </TouchableOpacity>
  )
}

/** Badge de disponibilidad: borde, radio 8, punto de color y texto. */
export function Disponible({ texto, color = COLORS.success }: { texto: string; color?: string }) {
  return (
    <View style={t.badge}>
      <Punto color={color} />
      <Text style={t.badgeT} numberOfLines={1}>{texto}</Text>
    </View>
  )
}

/** Campo de búsqueda con borde. */
export function Buscar({ valor, onCambio, placeholder = 'Buscar por nombre' }: { valor: string; onCambio: (v: string) => void; placeholder?: string }) {
  return (
    <View style={t.buscar}>
      <Ionicons name="search" size={18} color={COLORS.textLight} />
      <TextInput style={t.buscarT} value={valor} onChangeText={onCambio} placeholder={placeholder}
        placeholderTextColor={COLORS.textLight} autoCorrect={false} returnKeyType="search" accessibilityLabel={placeholder} />
      {!!valor && (
        <TouchableOpacity onPress={() => onCambio('')} hitSlop={10} accessibilityLabel="Borrar búsqueda">
          <Ionicons name="close-circle" size={18} color={COLORS.disabled} />
        </TouchableOpacity>
      )}
    </View>
  )
}

/** Botón de icono de 40, con borde (WhatsApp, llamar, compartir). */
export function BotonIcono({ icono, etiqueta, onPress, color = COLORS.ink }: { icono: IconName; etiqueta: string; onPress: () => void; color?: string }) {
  return (
    <TouchableOpacity style={t.ib} onPress={onPress} accessibilityRole="button" accessibilityLabel={etiqueta} hitSlop={4}>
      <Ionicons name={icono} size={18} color={color} />
    </TouchableOpacity>
  )
}

/** Texto de apoyo gris (notas bajo una lista, vacíos). */
export function Nota({ children, style }: { children: ReactNode; style?: any }) {
  return <Text style={[t.nota, style]}>{children}</Text>
}

/** Interruptor: encendido en tinta (neutros primero; el rojo es de acento). */
export function Interruptor({ valor, onCambio, disabled }: { valor: boolean; onCambio: (v: boolean) => void; disabled?: boolean }) {
  return <Switch value={valor} onValueChange={onCambio} disabled={disabled}
    trackColor={{ true: COLORS.ink, false: COLORS.border }} thumbColor="#fff" ios_backgroundColor={COLORS.border} />
}

/** Etiqueta de campo (13/600 gris) sobre un input de borde 1, radio 8, alto 52. */
export function Etiqueta({ children, style }: { children: ReactNode; style?: any }) {
  return <Text style={[t.label, style]}>{children}</Text>
}
export function Campo({ style, mono, ...props }: TextInputProps & { mono?: boolean }) {
  return <TextInput placeholderTextColor={COLORS.textLight} {...props}
    style={[t.input, mono && { fontFamily: FONTS.monoMedium, letterSpacing: 1 }, props.multiline && { height: undefined, minHeight: 88, paddingTop: 14, textAlignVertical: 'top' }, style]} />
}

/** Paso a paso (− valor +), el valor en mono. */
export function Paso({ valor, menos, mas }: { valor: string; menos: () => void; mas: () => void }) {
  return (
    <View style={t.paso}>
      <TouchableOpacity style={t.pasoB} onPress={menos} accessibilityRole="button" accessibilityLabel="Menos"><Ionicons name="remove" size={20} color={COLORS.ink} /></TouchableOpacity>
      <Text style={t.pasoV}>{valor}</Text>
      <TouchableOpacity style={t.pasoB} onPress={mas} accessibilityRole="button" accessibilityLabel="Más"><Ionicons name="add" size={20} color={COLORS.ink} /></TouchableOpacity>
    </View>
  )
}

/** Cuadro de icono (42, gris, radio 8) para el principio de una fila de menú. */
export function IconoFila({ icono, color = COLORS.ink }: { icono: IconName; color?: string }) {
  return <View style={t.icoFila}><Ionicons name={icono} size={19} color={color} /></View>
}

/** Rótulo pequeño en mayúsculas (overline 12/700). */
export function Sobre({ children, style }: { children: ReactNode; style?: any }) {
  return <Text style={[t.sobre, style]}>{children}</Text>
}

export const t = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  filaT: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  filaM: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textLight, marginTop: 2 },
  av: { backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  avT: { fontFamily: FONTS.semibold, color: COLORS.ink },
  puesto: { width: 32, height: 32, borderRadius: 8, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  puestoT: { fontFamily: FONTS.mono, fontSize: 14, color: COLORS.ink },
  estado: { fontFamily: FONTS.semibold, fontSize: 13 },
  card: { backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 14 },
  cardOscura: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  aviso: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avisoT: { flex: 1, fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  avisoA: { fontFamily: FONTS.semibold, fontSize: 14 },
  btn: { height: 52, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnIn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnT: { fontFamily: FONTS.semibold, fontSize: 16 },
  chip: { minHeight: 36, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center' },
  chipOn: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  chipT: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.textMid },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  badgeT: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.ink },
  buscar: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12 },
  buscarT: { flex: 1, fontFamily: FONTS.regular, fontSize: 15, color: COLORS.ink, paddingVertical: 0 },
  ib: { width: 40, height: 40, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  nota: { fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19, color: COLORS.textLight, marginTop: 10 },
  label: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textMid, marginTop: 14, marginBottom: 7 },
  input: { height: 52, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bg, paddingHorizontal: 14,
    fontFamily: FONTS.regular, fontSize: 15, color: COLORS.ink },
  paso: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 6 },
  pasoB: { width: 42, height: 42, borderRadius: 8, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  pasoV: { fontFamily: FONTS.mono, fontSize: 16, color: COLORS.ink },
  icoFila: { width: 42, height: 42, borderRadius: 8, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  sobre: { fontFamily: FONTS.bold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: COLORS.textMid },
})
