/**
 * Sistema visual NAVAJA · Barber Co. — primitivos reutilizables.
 * Rojo primario, azul secundario, blanco, negro carbón. Display = Anton.
 */
import { ReactNode, useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, ViewStyle, TextStyle, StyleProp, Animated, Easing } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, SPACING, RADIUS, FONTS } from '../constants'

type IconName = keyof typeof Ionicons.glyphMap

export function Icon({ name, size = 20, color = COLORS.ink }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />
}

/** Titular display en Anton (mayúsculas). */
export function Display({ children, size = 26, color = COLORS.ink, style }: { children: ReactNode; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  // Anton tiene mayúsculas altas: lineHeight holgado + includeFontPadding evitan que se corte arriba.
  return <Text style={[{ fontFamily: FONTS.display, fontSize: size, color, textTransform: 'uppercase', letterSpacing: 0.3, lineHeight: Math.round(size * 1.18), includeFontPadding: false }, style]}>{children}</Text>
}

export function SectionLabel({ children, action, onAction }: { children: ReactNode; action?: string; onAction?: () => void }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.section}>{children}</Text>
      {action && <TouchableOpacity onPress={onAction}><Text style={s.sectionAction}>{action}</Text></TouchableOpacity>}
    </View>
  )
}

export function Card({ children, variant = 'plain', style, onPress, accent }: {
  children: ReactNode; variant?: 'plain' | 'dark' | 'darkEl'; style?: StyleProp<ViewStyle>; onPress?: () => void; accent?: string
}) {
  const base = [s.card, variant === 'dark' && s.cardDark, variant === 'darkEl' && s.cardDarkEl,
    accent ? { borderLeftWidth: 4, borderLeftColor: accent } : null, style]
  if (onPress) return <TouchableOpacity activeOpacity={0.85} style={base} onPress={onPress}>{children}</TouchableOpacity>
  return <View style={base}>{children}</View>
}

export function Button({ label, onPress, variant = 'primary', icon, iconRight, loading, disabled, style }: {
  label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'dark' | 'outline'
  icon?: IconName; iconRight?: IconName; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>
}) {
  const map = {
    primary: { bg: COLORS.red, fg: '#fff', bd: COLORS.red },
    secondary: { bg: COLORS.blue, fg: '#fff', bd: COLORS.blue },
    dark: { bg: COLORS.carbon, fg: '#fff', bd: COLORS.carbon },
    outline: { bg: 'transparent', fg: COLORS.ink, bd: COLORS.ink },
  }[variant]
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled || loading} activeOpacity={0.85}
      style={[s.btn, { backgroundColor: map.bg, borderColor: map.bd, borderWidth: variant === 'outline' ? 1.5 : 0 }, (disabled || loading) && { opacity: 0.45 }, style]}>
      {loading ? <ActivityIndicator color={map.fg} /> : (
        <View style={s.btnInner}>
          {icon && <Ionicons name={icon} size={18} color={map.fg} />}
          <Text style={[s.btnT, { color: map.fg }]}>{label}</Text>
          {iconRight && <Ionicons name={iconRight} size={18} color={map.fg} />}
        </View>
      )}
    </TouchableOpacity>
  )
}

export function Avatar({ name, size = 48, color = '#fff', bg = COLORS.blue, uri }: { name?: string; size?: number; color?: string; bg?: string; uri?: string | null }) {
  if (uri) {
    return <Image source={{ uri }} style={[s.avatar, { width: size, height: size, borderRadius: 14, backgroundColor: bg }]} />
  }
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: 14, backgroundColor: bg }]}>
      <Text style={{ fontFamily: FONTS.display, fontSize: size * 0.42, color }}>{(name || 'U').slice(0, 1).toUpperCase()}</Text>
    </View>
  )
}

/** Badge de estado tipo pill con punto. */
export function Badge({ children, tone = 'blue' }: { children: ReactNode; tone?: 'blue' | 'red' | 'gray' | 'success' }) {
  const map = {
    blue: { bg: 'rgba(22,70,224,0.10)', fg: COLORS.blue },
    red: { bg: 'rgba(229,32,43,0.10)', fg: COLORS.red },
    gray: { bg: COLORS.surfaceAlt, fg: COLORS.textLight },
    success: { bg: COLORS.successLight, fg: COLORS.success },
  }[tone]
  return <View style={[s.badge, { backgroundColor: map.bg }]}><Text style={[s.badgeT, { color: map.fg }]}>● {children}</Text></View>
}

/** Chip de horario / selección. */
export function Chip({ children, selected, disabled, tone = 'red', onPress }: { children: ReactNode; selected?: boolean; disabled?: boolean; tone?: 'red' | 'blue'; onPress?: () => void }) {
  const sel = selected ? (tone === 'blue' ? COLORS.blue : COLORS.red) : null
  return (
    <TouchableOpacity disabled={disabled} onPress={onPress} activeOpacity={0.8}
      style={[s.chip, sel ? { backgroundColor: sel, borderColor: sel } : { borderColor: COLORS.border }, disabled && { borderColor: COLORS.borderSoft }]}>
      <Text style={[s.chipT, { color: sel ? '#fff' : disabled ? '#C7C5C0' : COLORS.ink }, disabled && { textDecorationLine: 'line-through' }]}>{children}</Text>
    </TouchableOpacity>
  )
}

/** Motivo poste de barbero (franjas rojo/blanco/azul). */
export function Pole({ height = 8, radius = 4, style }: { height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ height, borderRadius: radius, overflow: 'hidden', flexDirection: 'row' }, style]}>
      {Array.from({ length: 9 }).map((_, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: i % 3 === 0 ? COLORS.red : i % 3 === 1 ? '#fff' : COLORS.blue }} />
      ))}
    </View>
  )
}

export function Dot({ color }: { color: string }) {
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
}

export function KV({ k, v, valueColor = COLORS.ink }: { k: string; v?: ReactNode; valueColor?: string }) {
  return <View style={s.kv}><Text style={s.kvK}>{k}</Text><Text style={[s.kvV, { color: valueColor }]}>{v}</Text></View>
}

/**
 * EL PUNTO DE ESTADO, LATIENDO.
 *
 * Nació en el panel del barbero: el cuadro decía la verdad pero parecía una
 * captura de pantalla, sin forma de distinguir "esto es de ahora" de "esto se
 * quedó colgado hace media hora". Un pulso lento lo resuelve sin pedir nada al
 * usuario ni añadir texto. Vive aquí porque el panel del dueño enseña lo mismo
 * —la fila del local, en vivo— y dos latidos distintos para la misma idea es
 * exactamente lo que hace que dos pantallas parezcan de dos apps.
 *
 * Late solo cuando hay algo vivo que representar. En descanso o inactivo se
 * queda quieto a propósito: un punto parado ES el estado, y animarlo diría lo
 * contrario de lo que pasa.
 *
 * `useNativeDriver` manda la animación al hilo de UI, así que sigue latiendo
 * aunque el hilo de JS esté ocupado recargando la fila — que es justo cuando
 * más importa que la pantalla no parezca muerta.
 */
export function PuntoVivo({ color, vivo }: { color: string; vivo: boolean }) {
  const pulso = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!vivo) { pulso.setValue(0); return }
    const bucle = Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, { toValue: 1, duration: 1100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulso, { toValue: 0, duration: 900, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]),
    )
    bucle.start()
    return () => bucle.stop()
  }, [vivo, pulso])

  return (
    <View style={s.puntoWrap}>
      {vivo && (
        <Animated.View
          pointerEvents="none"
          style={[s.puntoHalo, {
            backgroundColor: color,
            opacity: pulso.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
            transform: [{ scale: pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
          }]}
        />
      )}
      <View style={[s.puntoNucleo, { backgroundColor: color }]} />
    </View>
  )
}

const s = StyleSheet.create({
  puntoWrap: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
  puntoHalo: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
  puntoNucleo: { width: 10, height: 10, borderRadius: 5 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  section: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.textMid, letterSpacing: 0.3 },
  sectionAction: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.blue },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  cardDark: { backgroundColor: COLORS.carbon, borderColor: COLORS.carbon },
  cardDarkEl: { backgroundColor: COLORS.carbonEl, borderColor: COLORS.carbonBorder },
  btn: { borderRadius: 14, paddingVertical: 15, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnT: { fontFamily: FONTS.bold, fontSize: 15 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  badge: { borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 6 },
  badgeT: { fontFamily: FONTS.bold, fontSize: 12 },
  chip: { borderWidth: 1.5, borderRadius: 11, paddingVertical: 10, paddingHorizontal: 15, alignItems: 'center' },
  chipT: { fontFamily: FONTS.bold, fontSize: 14 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: COLORS.borderSoft },
  kvK: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textMid },
  kvV: { fontFamily: FONTS.bold, fontSize: 14 },
})
