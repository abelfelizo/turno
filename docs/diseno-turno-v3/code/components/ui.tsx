/**
 * Sistema visual TURNO — primitivos reutilizables.
 * Neutros puros dominan; rojo/azul solo acento. Radio 8. Sin sombras.
 * Mantiene la API anterior (Button, Card, Avatar, Badge, Chip, Pole, Dot, KV,
 * SectionLabel, Display, Icon) para no romper pantallas.
 */
import { ReactNode } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, ViewStyle, TextStyle, StyleProp, useColorScheme } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Svg, { Defs, Pattern, Rect, G } from 'react-native-svg'
import { COLORS, THEME, Theme, SPACING, RADIUS, FONTS, TYPE, ESTADO_COLOR } from '../constants'

type IconName = keyof typeof Ionicons.glyphMap

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? THEME.dark : THEME.light
}

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const t = useTheme()
  return <Ionicons name={name} size={size} color={color ?? t.ink} />
}

/** Título de pantalla. Sin mayúsculas forzadas, sin Anton. */
export function Display({ children, size = 28, color, style }: { children: ReactNode; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  const t = useTheme()
  return <Text style={[TYPE.h1, { fontSize: size, color: color ?? t.ink }, style]}>{children}</Text>
}

export function SectionLabel({ children, action, onAction }: { children: ReactNode; action?: string; onAction?: () => void }) {
  const t = useTheme()
  return (
    <View style={s.sectionRow}>
      <Text style={[TYPE.overline, { color: t.text2 }]}>{children}</Text>
      {action && <TouchableOpacity onPress={onAction}><Text style={[TYPE.meta, { color: t.text3 }]}>{action}</Text></TouchableOpacity>}
    </View>
  )
}

/** Card: blanco + borde 1px. `dark` = fondo ink (ticket/hero). `accent` se ignora a propósito (no se usan bordes laterales de color). */
export function Card({ children, variant = 'plain', style, onPress }: {
  children: ReactNode; variant?: 'plain' | 'dark' | 'darkEl'; style?: StyleProp<ViewStyle>; onPress?: () => void; accent?: string
}) {
  const t = useTheme()
  const isDark = variant !== 'plain'
  const base = [s.card, { backgroundColor: isDark ? t.ink : t.bg, borderColor: isDark ? t.ink : t.border }, style]
  if (onPress) return <TouchableOpacity activeOpacity={0.85} style={base} onPress={onPress}>{children}</TouchableOpacity>
  return <View style={base}>{children}</View>
}

/**
 * primary = negro (acción principal normal)
 * accent  = rojo (SOLO el CTA final: "Confirmar cita")
 * secondary / outline = borde gris
 * destructive = borde gris + texto rojo ("Salir", "Cancelar cita")
 * dark = alias de primary
 */
export function Button({ label, onPress, variant = 'primary', icon, iconRight, loading, disabled, style }: {
  label: string; onPress: () => void; variant?: 'primary' | 'accent' | 'secondary' | 'dark' | 'outline' | 'destructive'
  icon?: IconName; iconRight?: IconName; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>
}) {
  const t = useTheme()
  const map = {
    primary: { bg: t.ink, fg: t.onInk, bd: t.ink },
    dark: { bg: t.ink, fg: t.onInk, bd: t.ink },
    accent: { bg: COLORS.red, fg: '#FFFFFF', bd: COLORS.red },
    secondary: { bg: 'transparent', fg: t.ink, bd: t.border },
    outline: { bg: 'transparent', fg: t.ink, bd: t.border },
    destructive: { bg: 'transparent', fg: t.redText, bd: t.border },
  }[variant]
  const off = disabled || loading
  return (
    <TouchableOpacity onPress={onPress} disabled={off} activeOpacity={0.85}
      style={[s.btn, { backgroundColor: off && map.bg !== 'transparent' ? t.surface : map.bg, borderColor: off ? t.surface : map.bd }, style]}>
      {loading ? <ActivityIndicator color={map.fg} /> : (
        <View style={s.btnInner}>
          {icon && <Ionicons name={icon} size={18} color={off ? t.disabled : map.fg} />}
          <Text style={[s.btnT, { color: off ? t.disabled : map.fg }]}>{label}</Text>
          {iconRight && <Ionicons name={iconRight} size={18} color={off ? t.disabled : map.fg} />}
        </View>
      )}
    </TouchableOpacity>
  )
}

/** Avatar circular gris con iniciales (2 letras). `selected` = invertido. */
export function Avatar({ name, size = 42, uri, selected }: { name?: string; size?: number; uri?: string | null; selected?: boolean; color?: string; bg?: string }) {
  const t = useTheme()
  const box = { width: size, height: size, borderRadius: size / 2 }
  if (uri) return <Image source={{ uri }} style={[box, { backgroundColor: t.surface }]} />
  const ini = (name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <View style={[s.center, box, { backgroundColor: selected ? t.bg : t.surface }]}>
      <Text style={{ fontFamily: FONTS.semibold, fontSize: Math.round(size * 0.32), color: t.ink }}>{ini}</Text>
    </View>
  )
}

/** Badge de estado: borde 1px + punto. Sin fondos tintados. */
export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'blue' | 'red' | 'gray' | 'success' }) {
  const t = useTheme()
  const dot = { blue: t.blue, red: t.red, gray: t.text3, success: t.green }[tone]
  return (
    <View style={[s.badge, { borderColor: t.border }]}>
      <Dot color={dot} />
      <Text style={[s.badgeT, { color: t.ink }]}>{children}</Text>
    </View>
  )
}

/** Texto de estado para filas de lista. */
export function StatusText({ estado, label }: { estado: string; label: string }) {
  const t = useTheme()
  return <Text style={{ fontFamily: FONTS.semibold, fontSize: 13, color: t[ESTADO_COLOR[estado] ?? 'text3'] }}>{label}</Text>
}

/** Chip de selección (barberías, filtros). Activo = negro. */
export function Chip({ children, selected, disabled, onPress }: { children: ReactNode; selected?: boolean; disabled?: boolean; tone?: 'red' | 'blue'; onPress?: () => void }) {
  const t = useTheme()
  return (
    <TouchableOpacity disabled={disabled} onPress={onPress} activeOpacity={0.8}
      style={[s.chip, selected ? { backgroundColor: t.ink, borderColor: t.ink } : { borderColor: t.border }]}>
      <Text style={[s.chipT, { color: selected ? t.onInk : disabled ? t.disabled : t.text2 }]}>{children}</Text>
    </TouchableOpacity>
  )
}

/** Slot de hora. Seleccionado = rojo. Ocupado = tachado. */
export function TimeSlot({ label, selected, disabled, onPress }: { label: string; selected?: boolean; disabled?: boolean; onPress?: () => void }) {
  const t = useTheme()
  return (
    <TouchableOpacity disabled={disabled} onPress={onPress} activeOpacity={0.8}
      style={[s.slot, { backgroundColor: selected ? COLORS.red : t.bg, borderColor: selected ? COLORS.red : disabled ? t.divider : t.border }]}>
      <Text style={{ fontFamily: FONTS.mono, fontSize: 14, color: selected ? '#FFFFFF' : disabled ? t.disabled : t.ink, textDecorationLine: disabled ? 'line-through' : 'none' }}>{label}</Text>
    </TouchableOpacity>
  )
}

/** Chip de día. flex:1 dentro de una fila con gap 6. */
export function DayChip({ day, num, selected, disabled, onPress }: { day: string; num: number | string; selected?: boolean; disabled?: boolean; onPress?: () => void }) {
  const t = useTheme()
  const bg = selected ? t.ink : disabled ? t.surface : t.bg
  const fg = selected ? t.onInk : disabled ? t.disabled : t.ink
  return (
    <TouchableOpacity disabled={disabled} onPress={onPress} activeOpacity={0.8}
      style={[s.day, { backgroundColor: bg, borderColor: selected ? t.ink : disabled ? t.surface : t.border }]}>
      <Text style={{ fontFamily: FONTS.medium, fontSize: 12, color: fg }}>{day}</Text>
      <Text style={{ fontFamily: FONTS.monoBold, fontSize: 18, color: fg }}>{num}</Text>
    </TouchableOpacity>
  )
}

/** Fila de lista: leading (Avatar o número) + título/meta + trailing. */
export function ListRow({ leading, title, meta, trailing, onPress }: { leading?: ReactNode; title: string; meta?: string; trailing?: ReactNode; onPress?: () => void }) {
  const t = useTheme()
  const body = (
    <View style={[s.row, { borderBottomColor: t.divider }]}>
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[TYPE.bodyStrong, { color: t.ink }]}>{title}</Text>
        {meta ? <Text style={[TYPE.meta, { color: t.text3 }]}>{meta}</Text> : null}
      </View>
      {trailing}
    </View>
  )
  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.8}>{body}</TouchableOpacity> : body
}

/** Cuadro de posición en cola (32×32, mono). */
export function QueueNumber({ n }: { n: number | string }) {
  const t = useTheme()
  return <View style={[s.center, { width: 32, height: 32, borderRadius: RADIUS.sm, backgroundColor: t.surface }]}><Text style={{ fontFamily: FONTS.monoBold, fontSize: 14, color: t.ink }}>{n}</Text></View>
}

/**
 * Poste de barbero: franjas diagonales -55°, rojo/blanco/azul/blanco.
 * Usar SOLO en: logo, talón del Ticket, franja superior de "en la silla".
 * `vertical` = talón (ancho fijo, alto flexible).
 */
export function Pole({ height = 14, width, band = 6, style }: { height?: number; width?: number | string; band?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const p = band * 4
  return (
    <View style={[{ height, width: width ?? '100%', overflow: 'hidden' }, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="pole" width={p} height={p} patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
            <Rect width={band} height={p} fill="#E1251B" />
            <Rect x={band} width={band} height={p} fill="#FFFFFF" />
            <Rect x={band * 2} width={band} height={p} fill="#1E4FD8" />
            <Rect x={band * 3} width={band} height={p} fill="#FFFFFF" />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#pole)" />
      </Svg>
    </View>
  )
}

/** Ticket del turno activo (Inicio). Fondo ink, talón poste, muescas laterales, bloque de posición. */
export function Ticket({ estadoLabel, title, meta, position, onPress }: { estadoLabel: string; title: string; meta: string; position: string; onPress?: () => void }) {
  const t = useTheme()
  const Wrap: any = onPress ? TouchableOpacity : View
  return (
    <Wrap onPress={onPress} activeOpacity={0.9} style={[s.ticket, { backgroundColor: COLORS.ink }]}>
      <Pole width={14} height={'100%' as any} band={6} />
      <View style={{ flex: 1, paddingVertical: 16, paddingLeft: 22, paddingRight: 18, gap: 4 }}>
        <Text style={{ fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 1.2, color: '#FF5A4F' }}>{estadoLabel.toUpperCase()}</Text>
        <Text style={{ fontFamily: FONTS.semibold, fontSize: 18, color: '#FFFFFF' }}>{title}</Text>
        <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: '#B5B5B5' }}>{meta}</Text>
      </View>
      <View style={s.ticketStub}>
        <Text style={{ fontFamily: FONTS.semibold, fontSize: 11, color: '#B5B5B5' }}>POSICIÓN</Text>
        <Text style={{ fontFamily: FONTS.monoBold, fontSize: 36, color: '#FFFFFF', lineHeight: 38 }}>{position}</Text>
      </View>
      <View style={[s.notch, { left: -9, backgroundColor: t.bg }]} />
      <View style={[s.notch, { right: -9, backgroundColor: t.bg }]} />
    </Wrap>
  )
}

/** Hero de "Mi turno" según estado. Única superficie que puede ir en rojo/azul completo. */
export function StatusHero({ estado, position, total, waitMin, barbero, endsAt }: {
  estado: 'en_fila' | 'llamado' | 'en_camino' | 'en_silla'; position?: string; total?: number; waitMin?: number; barbero?: string; endsAt?: string
}) {
  const white = '#FFFFFF', muted = '#B5B5B5'
  const over = (txt: string, c = muted) => <Text style={{ fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 1.4, color: c }}>{txt}</Text>
  const big = (txt: string) => <Text style={[TYPE.h2, { color: white, textAlign: 'center' }]}>{txt}</Text>
  const sub = (txt: string, c = white) => <Text style={{ fontFamily: FONTS.regular, fontSize: 15, color: c, textAlign: 'center' }}>{txt}</Text>
  if (estado === 'llamado') return <View style={[s.hero, { backgroundColor: COLORS.red }]}>{over('LLAMADO · CALLED', white)}{big('¡Es tu turno!')}{sub('Ve al local ahora. Te guardan la silla 10 min.')}</View>
  if (estado === 'en_camino') return <View style={[s.hero, { backgroundColor: COLORS.blue }]}>{over('EN CAMINO · ON THE WAY', white)}{big('Vas en camino')}{sub(`${barbero ?? 'Tu barbero'} ya sabe que vienes.`)}</View>
  if (estado === 'en_silla') return (
    <View style={{ backgroundColor: COLORS.ink }}>
      <Pole height={18} band={8} />
      <View style={[s.hero, { backgroundColor: 'transparent', paddingVertical: 34 }]}>{over('EN LA SILLA · IN THE CHAIR')}{big('Te están atendiendo')}{sub(`Termina aprox. ${endsAt ?? ''}`, muted)}</View>
    </View>
  )
  return (
    <View style={[s.hero, { backgroundColor: COLORS.ink, paddingTop: 32, paddingBottom: 28, gap: 6 }]}>
      {over('TU POSICIÓN · YOUR SPOT')}
      <Text style={[TYPE.number, { color: white }]}>{position}</Text>
      <Text style={{ fontFamily: FONTS.regular, fontSize: 14, color: muted }}>de {total} personas en la fila</Text>
      <View style={{ marginTop: 10, paddingVertical: 7, paddingHorizontal: 14, borderRadius: RADIUS.sm, backgroundColor: '#1F1F1F' }}>
        <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: white }}>≈ {waitMin} min de espera</Text>
      </View>
    </View>
  )
}

export function Dot({ color }: { color: string }) {
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
}

export function KV({ k, v, valueColor }: { k: string; v?: ReactNode; valueColor?: string }) {
  const t = useTheme()
  return <View style={[s.kv, { borderBottomColor: t.divider }]}><Text style={[TYPE.body, { color: t.text2 }]}>{k}</Text><Text style={[TYPE.bodyStrong, { color: valueColor ?? t.ink }]}>{v}</Text></View>
}

/** Opciones de Tabs de expo-router. Usar en TODOS los _layout.tsx. */
export function useTabOptions() {
  const t = useTheme()
  return {
    headerShown: false,
    tabBarActiveTintColor: t.red,
    tabBarInactiveTintColor: t.text3,
    tabBarStyle: { height: 84, paddingTop: 10, paddingBottom: 26, backgroundColor: t.bg, borderTopWidth: 1, borderTopColor: t.tabBorder, elevation: 0, shadowOpacity: 0 },
    tabBarLabelStyle: { fontFamily: FONTS.semibold, fontSize: 11 },
    tabBarIconStyle: { marginBottom: 2 },
  } as const
}

const s = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  card: { borderRadius: RADIUS.sm, padding: 14, borderWidth: 1 },
  btn: { height: 52, borderRadius: RADIUS.sm, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnT: { fontFamily: FONTS.semibold, fontSize: 16 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 7 },
  badgeT: { fontFamily: FONTS.semibold, fontSize: 13 },
  chip: { borderWidth: 1, borderRadius: RADIUS.sm, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center' },
  chipT: { fontFamily: FONTS.semibold, fontSize: 14 },
  slot: { height: 44, borderRadius: RADIUS.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flex: 1 },
  day: { flex: 1, height: 62, borderRadius: RADIUS.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  ticket: { flexDirection: 'row', borderRadius: RADIUS.sm, overflow: 'hidden', position: 'relative' },
  ticketStub: { borderLeftWidth: 2, borderStyle: 'dashed', borderLeftColor: '#3A3A3A', paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  notch: { position: 'absolute', top: '50%', marginTop: -9, width: 18, height: 18, borderRadius: 9 },
  hero: { paddingVertical: 40, paddingHorizontal: 24, alignItems: 'center', gap: 8 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1 },
})
