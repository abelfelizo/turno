/**
 * Sistema visual TURNO — primitivos reutilizables (handoff v3,
 * docs/diseno-turno-v3). Neutros puros dominan; rojo/azul solo acento.
 * Radio 8. Sin sombras. Mantiene la API anterior (Icon, Display,
 * SectionLabel, Card, Button, Avatar, Badge, Chip, Pole, Dot, KV) y suma la
 * del v3 (StatusText, TimeSlot, DayChip, ListRow, QueueNumber, useTheme).
 *
 * El poste y el logo usan `react-native-svg`, que es NATIVA: este código
 * pide el APK 1.3.0. Una actualización por aire no llega a un APK 1.2.0
 * porque `runtimeVersion` sigue a la versión de la app (app.json).
 */
import { ReactNode, useEffect, useId, useRef } from 'react'
import Svg, { Defs, Pattern, Rect } from 'react-native-svg'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, ViewStyle, TextStyle, StyleProp, Animated, Easing, useColorScheme } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Updates from 'expo-updates'
import { COLORS, THEME, Theme, RADIUS, FONTS, TYPE, ESTADO_COLOR, GLASS } from '../constants'

type IconName = keyof typeof Ionicons.glyphMap

/** El tema del sistema. El oscuro está preparado; las pantallas aún leen COLORS (claro). */
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? THEME.dark : THEME.light
}

export function Icon({ name, size = 22, color = COLORS.ink }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />
}

/** Título de pantalla. Sin mayúsculas forzadas (h1 = 28/700, −0.6). */
export function Display({ children, size = 28, color = COLORS.ink, style }: { children: ReactNode; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[TYPE.h1, { fontSize: size, color, letterSpacing: size >= 22 ? -0.6 : -0.2, lineHeight: Math.round(size * 1.2), includeFontPadding: false }, style]}>{children}</Text>
}

export function SectionLabel({ children, action, onAction }: { children: ReactNode; action?: string; onAction?: () => void }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.section}>{children}</Text>
      {action && <TouchableOpacity onPress={onAction}><Text style={s.sectionAction}>{action}</Text></TouchableOpacity>}
    </View>
  )
}

/** Card: blanco + borde 1px. `dark` = fondo tinta (ticket/hero). `accent` se
 *  ignora a propósito: el v3 no usa bordes laterales de color. */
export function Card({ children, variant = 'plain', style, onPress }: {
  children: ReactNode; variant?: 'plain' | 'dark' | 'darkEl'; style?: StyleProp<ViewStyle>; onPress?: () => void; accent?: string
}) {
  const base = [s.card, variant !== 'plain' && s.cardDark, style]
  if (onPress) return <TouchableOpacity activeOpacity={0.85} style={base} onPress={onPress}>{children}</TouchableOpacity>
  return <View style={base}>{children}</View>
}

/**
 * primary = negro (acción principal normal)
 * accent  = rojo (SOLO el CTA final: confirmar una reserva o entrar a la fila)
 * secondary / outline = borde gris
 * destructive = borde gris + texto rojo («Salir», «Cancelar cita»)
 * dark = alias de primary
 */
export function Button({ label, onPress, variant = 'primary', icon, iconRight, loading, disabled, style }: {
  label: string; onPress: () => void; variant?: 'primary' | 'accent' | 'secondary' | 'dark' | 'outline' | 'destructive'
  icon?: IconName; iconRight?: IconName; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>
}) {
  const map = {
    primary: { bg: COLORS.ink, fg: COLORS.onInk, bd: COLORS.ink },
    dark: { bg: COLORS.ink, fg: COLORS.onInk, bd: COLORS.ink },
    accent: { bg: COLORS.red, fg: '#FFFFFF', bd: COLORS.red },
    secondary: { bg: 'transparent', fg: COLORS.ink, bd: COLORS.border },
    outline: { bg: 'transparent', fg: COLORS.ink, bd: COLORS.border },
    destructive: { bg: 'transparent', fg: COLORS.redText, bd: COLORS.border },
  }[variant]
  const off = disabled || loading
  return (
    <TouchableOpacity onPress={onPress} disabled={off} activeOpacity={0.85}
      style={[s.btn, { backgroundColor: off && map.bg !== 'transparent' ? COLORS.surfaceAlt : map.bg, borderColor: off ? COLORS.surfaceAlt : map.bd }, style]}>
      {loading ? <ActivityIndicator color={map.fg} /> : (
        <View style={s.btnInner}>
          {icon && <Ionicons name={icon} size={18} color={off ? COLORS.disabled : map.fg} />}
          <Text style={[s.btnT, { color: off ? COLORS.disabled : map.fg }]}>{label}</Text>
          {iconRight && <Ionicons name={iconRight} size={18} color={off ? COLORS.disabled : map.fg} />}
        </View>
      )}
    </TouchableOpacity>
  )
}

/** Avatar circular gris con iniciales (2 letras). `selected` = invertido.
 *  `bg` y `color` se aceptan por compatibilidad y se ignoran (v3). */
export function Avatar({ name, size = 42, uri, selected }: { name?: string; size?: number; uri?: string | null; selected?: boolean; color?: string; bg?: string }) {
  const box = { width: size, height: size, borderRadius: size / 2 }
  if (uri) return <Image source={{ uri }} style={[box, { backgroundColor: COLORS.surfaceAlt }]} />
  const ini = (name || 'U').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <View style={[s.avatar, box, { backgroundColor: selected ? COLORS.bg : COLORS.surfaceAlt }]}>
      <Text style={{ fontFamily: FONTS.semibold, fontSize: Math.round(size * 0.32), color: COLORS.ink }}>{ini}</Text>
    </View>
  )
}

/** Badge de estado: borde 1px + punto. Sin fondos tintados. */
export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'blue' | 'red' | 'gray' | 'success' }) {
  // Badge del handoff: borde fino, radio 8, punto de color y texto 13/600.
  const fg = { blue: COLORS.blue, red: COLORS.red, gray: COLORS.textLight, success: COLORS.success }[tone]
  return (
    <View style={[s.badge, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: fg }} />
      <Text style={[s.badgeT, { color: COLORS.ink }]}>{children}</Text>
    </View>
  )
}

/** Texto de estado para filas de lista. */
export function StatusText({ estado, label }: { estado: string; label: string }) {
  return <Text style={{ fontFamily: FONTS.semibold, fontSize: 13, color: THEME.light[ESTADO_COLOR[estado] ?? 'text3'] }}>{label}</Text>
}

/** Chip de selección (barberías, filtros). Activo = negro. `tone` se ignora (v3). */
export function Chip({ children, selected, disabled, onPress }: { children: ReactNode; selected?: boolean; disabled?: boolean; tone?: 'red' | 'blue'; onPress?: () => void }) {
  return (
    <TouchableOpacity disabled={disabled} onPress={onPress} activeOpacity={0.8}
      style={[s.chip, selected ? { backgroundColor: COLORS.ink, borderColor: COLORS.ink } : { borderColor: COLORS.border }]}>
      <Text style={[s.chipT, { color: selected ? COLORS.onInk : disabled ? COLORS.disabled : COLORS.textMid }]}>{children}</Text>
    </TouchableOpacity>
  )
}

/** Slot de hora. Seleccionado = rojo. Ocupado = tachado. */
export function TimeSlot({ label, selected, disabled, onPress }: { label: string; selected?: boolean; disabled?: boolean; onPress?: () => void }) {
  return (
    <TouchableOpacity disabled={disabled} onPress={onPress} activeOpacity={0.8}
      style={[s.slot, { backgroundColor: selected ? COLORS.red : COLORS.bg, borderColor: selected ? COLORS.red : disabled ? COLORS.divider : COLORS.border }]}>
      <Text style={{ fontFamily: FONTS.mono, fontSize: 14, color: selected ? '#FFFFFF' : disabled ? COLORS.disabled : COLORS.ink, textDecorationLine: disabled ? 'line-through' : 'none' }}>{label}</Text>
    </TouchableOpacity>
  )
}

/** Chip de día. flex:1 dentro de una fila con gap 6. */
export function DayChip({ day, num, selected, disabled, onPress }: { day: string; num: number | string; selected?: boolean; disabled?: boolean; onPress?: () => void }) {
  const bg = selected ? COLORS.ink : disabled ? COLORS.surfaceAlt : COLORS.bg
  const fg = selected ? COLORS.onInk : disabled ? COLORS.disabled : COLORS.ink
  return (
    <TouchableOpacity disabled={disabled} onPress={onPress} activeOpacity={0.8}
      style={[s.day, { backgroundColor: bg, borderColor: selected ? COLORS.ink : disabled ? COLORS.surfaceAlt : COLORS.border }]}>
      <Text style={{ fontFamily: FONTS.medium, fontSize: 12, color: fg }}>{day}</Text>
      <Text style={{ fontFamily: FONTS.monoBold, fontSize: 18, color: fg }}>{num}</Text>
    </TouchableOpacity>
  )
}

/** Fila de lista: leading (Avatar o número) + título/meta + trailing. */
export function ListRow({ leading, title, meta, trailing, onPress }: { leading?: ReactNode; title: string; meta?: string; trailing?: ReactNode; onPress?: () => void }) {
  const body = (
    <View style={s.row}>
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[TYPE.bodyStrong, { color: COLORS.ink }]}>{title}</Text>
        {meta ? <Text style={[TYPE.meta, { color: COLORS.textLight }]}>{meta}</Text> : null}
      </View>
      {trailing}
    </View>
  )
  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.8}>{body}</TouchableOpacity> : body
}

/** Cuadro de posición en cola (32×32, mono). */
export function QueueNumber({ n }: { n: number | string }) {
  return <View style={[s.avatar, { width: 32, height: 32, borderRadius: RADIUS.sm, backgroundColor: COLORS.surfaceAlt }]}><Text style={{ fontFamily: FONTS.monoBold, fontSize: 14, color: COLORS.ink }}>{n}</Text></View>
}

/**
 * EL POSTE DE BARBERO: franjas diagonales a −55°, rojo · blanco · azul ·
 * blanco (handoff v3). Solo va en tres sitios: el logo, el talón del ticket y
 * la franja de «en la silla». No es decoración de fondo.
 *
 * `height="auto"` deja que la dé el contenedor (el talón vertical). `ancho` es
 * el ancho de cada banda; `animado` y `radius` se aceptan por compatibilidad.
 */
export function Pole({ height = 14, radius = 0, style, ancho = 6 }: {
  height?: number | 'auto'; radius?: number; style?: StyleProp<ViewStyle>
  animado?: boolean; ancho?: number
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const p = ancho * 4
  return (
    <View pointerEvents="none" style={[typeof height === 'number' ? { height } : null, { overflow: 'hidden', borderRadius: radius }, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id={`poste${uid}`} width={p} height={p} patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
            <Rect width={ancho} height={p} fill="#E1251B" />
            <Rect x={ancho} width={ancho} height={p} fill="#FFFFFF" />
            <Rect x={ancho * 2} width={ancho} height={p} fill="#1E4FD8" />
            <Rect x={ancho * 3} width={ancho} height={p} fill="#FFFFFF" />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#poste${uid})`} />
      </Svg>
    </View>
  )
}

/**
 * LA LÍNEA PERFORADA DEL TICKET.
 *
 * Dibujada a mano con segmentos: `borderStyle: 'dashed'` en un solo lado no es
 * fiable entre Android e iOS —se ve continua en uno y a trozos distintos en el
 * otro— y aquí la raya ES el objeto, no un adorno.
 */
export function Perforacion({ color = COLORS.carbonDash }: { color?: string }) {
  return (
    <View style={s.perfFila} pointerEvents="none">
      {Array.from({ length: 34 }).map((_, i) => (
        <View key={i} style={{ flex: 1, height: 1.5, backgroundColor: i % 2 === 0 ? color : 'transparent' }} />
      ))}
    </View>
  )
}

/**
 * EL TICKET DEL TURNO.
 *
 * El único bloque negro de una pantalla clara: el turno es lo que llevas en la
 * mano, y por eso es lo que pesa. Lleva el poste impreso arriba y, cuando hay
 * pie, la perforación con las dos muescas recortadas del color del fondo — las
 * muescas se recortan solas porque el contenedor corta lo que sobresale.
 *
 * `fondo` tiene que ser el color de la pantalla donde se pone, no el del
 * ticket: es lo que hace que el troquel parezca un agujero y no un lunar.
 */
export function Ticket({ children, pie, fondo = COLORS.bg, style }: {
  children: ReactNode; pie?: ReactNode; fondo?: string; style?: StyleProp<ViewStyle>
}) {
  return (
    <View style={[s.ticket, style]}>
      <View style={{ flexDirection: 'row' }}>
        {/* El talón del poste, 14 de ancho, a la izquierda (handoff § 3). */}
        <Pole height="auto" style={{ width: 14, alignSelf: 'stretch' }} ancho={6} />
        <View style={[s.ticketCuerpo, { flex: 1 }]}>{children}</View>
      </View>
      {pie != null && (
        <>
          <View style={s.ticketPerf}>
            <Perforacion />
            <View style={[s.muesca, { left: -9, backgroundColor: fondo }]} />
            <View style={[s.muesca, { right: -9, backgroundColor: fondo }]} />
          </View>
          <View style={s.ticketPie}>{pie}</View>
        </>
      )}
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
  noCargo: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 8 },
  noCargoT: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.ink, textAlign: 'center', marginTop: 6 },
  noCargoD: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textLight, textAlign: 'center', lineHeight: 19 },
  noCargoBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: COLORS.ink, borderRadius: 26, paddingVertical: 11, paddingHorizontal: 20, marginTop: 10 },
  noCargoBtnT: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.onInk },
  version: { paddingVertical: 14, alignItems: 'center' },
  versionT: { fontFamily: FONTS.regular, fontSize: 11.5, color: COLORS.textLight, textAlign: 'center' },
  versionD: { fontFamily: FONTS.regular, fontSize: 10.5, color: COLORS.textLight, textAlign: 'center', marginTop: 2 },
  perfFila: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12 },
  ticket: { backgroundColor: COLORS.carbon, borderRadius: 8, overflow: 'hidden' },
  ticketCuerpo: { paddingVertical: 16, paddingLeft: 22, paddingRight: 18 },
  ticketPerf: { height: 18, justifyContent: 'center' },
  muesca: { position: 'absolute', width: 18, height: 18, borderRadius: 9 },
  ticketPie: { paddingHorizontal: 16, paddingBottom: 14, paddingTop: 2 },
  puntoWrap: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
  puntoHalo: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
  puntoNucleo: { width: 10, height: 10, borderRadius: 5 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  section: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 1, textTransform: 'uppercase' },
  sectionAction: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textLight },
  card: { backgroundColor: GLASS.fill, borderRadius: GLASS.radioCard, padding: 14, borderWidth: 1, borderColor: GLASS.border },
  cardDark: { backgroundColor: GLASS.ink, borderColor: GLASS.border, borderRadius: 26 },
  btn: { height: 52, borderRadius: RADIUS.sm, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnT: { fontFamily: FONTS.semibold, fontSize: 16 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  badge: { borderRadius: 999, borderWidth: 1, borderColor: GLASS.border, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: GLASS.fill },
  badgeT: { fontFamily: FONTS.semibold, fontSize: 13 },
  chip: { borderWidth: 1, borderRadius: RADIUS.sm, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center' },
  chipT: { fontFamily: FONTS.semibold, fontSize: 14 },
  slot: { height: 44, borderRadius: RADIUS.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flex: 1 },
  day: { flex: 1, height: 62, borderRadius: RADIUS.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, backgroundColor: GLASS.fill, borderWidth: 1, borderColor: GLASS.border, borderRadius: GLASS.radioFila, paddingHorizontal: 14, marginBottom: 8 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, backgroundColor: GLASS.fill, borderWidth: 1, borderColor: GLASS.border, borderRadius: GLASS.radioFila, paddingHorizontal: 14, marginBottom: 8 },
  kvK: { fontFamily: FONTS.regular, fontSize: 15, color: COLORS.textMid },
  kvV: { fontFamily: FONTS.semibold, fontSize: 15 },
})

/**
 * NO SE PUDO CARGAR · el estado que faltaba en todas las pantallas.
 *
 * Hasta ahora un fallo de red se pintaba EXACTAMENTE IGUAL que «aquí no hay
 * nada»: las cargas atrapan cada llamada con `.catch(() => [])` y la pantalla
 * enseñaba su lista vacía tan tranquila. El cliente veía «no hay barberos» y
 * concluía que la barbería estaba cerrada; el barbero veía su agenda en blanco
 * y creía que no tenía citas.
 *
 * Es la misma trampa que el README de las pruebas lleva tiempo advirtiendo para
 * el servidor —«devolver vacío y negarse se parecen mientras la consulta
 * funcione»— del lado de la interfaz. Se parecen hasta el día que la consulta
 * falla, y ese día la pantalla miente.
 *
 * Con esto son tres estados distintos y no dos: cargando, no pude, y vacío.
 */
export function NoCargo({ onReintentar, que }: { onReintentar: () => void; que?: string }) {
  return (
    <View style={s.noCargo}>
      <Ionicons name="cloud-offline-outline" size={30} color={COLORS.textLight} />
      <Text style={s.noCargoT}>No pudimos cargar {que ?? 'esta pantalla'}</Text>
      <Text style={s.noCargoD}>
        Puede ser tu conexión. No es que no haya nada: es que no pudimos preguntar.
      </Text>
      <TouchableOpacity style={s.noCargoBtn} onPress={onReintentar} activeOpacity={0.85}>
        <Ionicons name="refresh" size={16} color={COLORS.onInk} />
        <Text style={s.noCargoBtnT}>Reintentar</Text>
      </TouchableOpacity>
    </View>
  )
}

/**
 * QUÉ BUNDLE ESTÁ CORRIENDO ESTE TELÉFONO.
 *
 * Existe por una tarde entera perdida. Se publicó una actualización por aire,
 * el registro de EAS decía «Published! Branch preview · Runtime version 1.2.0»
 * con el commit correcto, y en el teléfono no cambiaba nada. Desde fuera no hay
 * forma de distinguir los tres motivos posibles:
 *
 *   · la actualización no le llegó (el canal del APK no apunta a esa rama),
 *   · le llegó y todavía no se aplicó (hace falta abrir dos veces),
 *   · o está corriendo el bundle que venía DENTRO del APK, porque el que se
 *     bajó reventó al arrancar y expo-updates volvió solo al anterior.
 *
 * Los tres se ven igual: "sigue igual". Esta línea los separa en tres segundos.
 * `isEmbeddedLaunch` es la que más dice: si está en verdadero, ninguna
 * actualización se ha aplicado nunca en este teléfono.
 *
 * En desarrollo los campos vienen vacíos y eso es normal: ahí el bundle lo
 * sirve Metro, no expo-updates. Por eso todo va envuelto — que una pantalla de
 * ajustes se caiga por el cartelito de la versión sería el colmo.
 */
export function VersionBundle() {
  let linea = 'Versión no disponible'
  let detalle = ''
  try {
    const emb = Updates.isEmbeddedLaunch
    const id = Updates.updateId
    const creado = Updates.createdAt
    linea = emb
      ? 'Bundle original del APK · sin actualizaciones aplicadas'
      : `Actualización aplicada${creado ? ' · ' + creado.toLocaleString() : ''}`
    detalle = [
      Updates.channel ? `canal ${Updates.channel}` : null,
      Updates.runtimeVersion ? `runtime ${Updates.runtimeVersion}` : null,
      id ? `id ${String(id).slice(0, 8)}` : null,
    ].filter(Boolean).join(' · ')
  } catch {
    // Ni un throw aquí: es información, no una función de la app.
  }
  return (
    <View style={s.version}>
      <Text style={s.versionT}>{linea}</Text>
      {!!detalle && <Text style={s.versionD}>{detalle}</Text>}
    </View>
  )
}
