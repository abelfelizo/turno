/**
 * Sistema visual NAVAJA · Barber Co. — primitivos reutilizables.
 * Rojo primario, azul secundario, blanco, negro carbón. Display = Anton.
 */
import { ReactNode, useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, ViewStyle, TextStyle, StyleProp, Animated, Easing, AccessibilityInfo } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Updates from 'expo-updates'
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

/**
 * LA INICIAL, EN CUADRO TEÑIDO Y NO EN BLOQUE DE COLOR.
 *
 * El azul macizo competía con el único objeto oscuro de cada pantalla: cinco
 * avatares en una lista y de repente había seis cosas gritando a la vez. En D2
 * el color sólido se reserva para lo que se toca —el botón rojo— y la identidad
 * se resuelve con un cuadro teñido y la letra en Anton encima.
 *
 * La letra no se pasa casi nunca: se deduce del fondo, porque quien escribe
 * `bg={COLORS.carbon}` está pidiendo un cuadro oscuro y lo que quiere ahí es
 * letra blanca. Pasarla explícita sigue funcionando y gana.
 */
export function Avatar({ name, size = 48, color, bg = COLORS.blueLight, uri }: { name?: string; size?: number; color?: string; bg?: string; uri?: string | null }) {
  const letra = color ?? (bg === COLORS.blueLight ? COLORS.blue : '#fff')
  if (uri) {
    return <Image source={{ uri }} style={[s.avatar, { width: size, height: size, borderRadius: 6, backgroundColor: bg }]} />
  }
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: 6, backgroundColor: bg }]}>
      <Text style={{ fontFamily: FONTS.display, fontSize: size * 0.42, color: letra }}>{(name || 'U').slice(0, 1).toUpperCase()}</Text>
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

/**
 * EL POSTE DE BARBERO, GIRANDO.
 *
 * Las franjas son diagonales y se deslizan en bucle, como el cilindro de la
 * puerta de una barbería: es el único adorno del sistema y hace de firma en
 * todas las cabeceras y encima del ticket del turno.
 *
 * Cómo se mueve sin gastar batería: no se anima el color ni el layout, se
 * desplaza UNA sola capa con `translateX` sobre el hilo nativo
 * (`useNativeDriver`), y solo un ciclo de tres franjas — al terminar vuelve a
 * cero y el patrón encaja consigo mismo, así que el bucle no se ve.
 *
 * Quien tenga "reducir movimiento" puesto en el teléfono lo ve quieto: es
 * decoración, y una decoración que no se puede parar es un problema de
 * accesibilidad, no un detalle de marca.
 */
export function Pole({ height = 8, radius = 4, style, animado = true, ancho = 14 }: {
  height?: number; radius?: number; style?: StyleProp<ViewStyle>
  /** Quieto cuando el poste acompaña a algo que ya se mueve. */
  animado?: boolean
  /** Ancho de cada franja, en px. El ciclo completo son tres. */
  ancho?: number
}) {
  const x = useRef(new Animated.Value(0)).current
  const [mover, setMover] = useState(false)

  // El ajuste del sistema manda sobre la prop, nunca al revés.
  useEffect(() => {
    let vivo = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then(reducir => { if (vivo) setMover(animado && !reducir) })
      .catch(() => { if (vivo) setMover(animado) })
    return () => { vivo = false }
  }, [animado])

  useEffect(() => {
    if (!mover) { x.setValue(0); return }
    const ciclo = ancho * 3
    const bucle = Animated.loop(
      Animated.timing(x, { toValue: -ciclo, duration: 2200, easing: Easing.linear, useNativeDriver: true }),
    )
    bucle.start()
    return () => bucle.stop()
  }, [mover, ancho, x])

  // Cuántas franjas hacen falta se MIDE, no se adivina: un número fijo cubre
  // el teléfono de turno y se queda corto en cualquier pantalla más ancha.
  // Hasta la primera medida se pinta un ancho de teléfono, que es lo común.
  const [anchoCaja, setAnchoCaja] = useState(430)
  const franjas = Math.ceil((anchoCaja + ancho * 6) / ancho)

  return (
    <View
      onLayout={e => {
        const w = e.nativeEvent.layout.width
        if (Math.abs(w - anchoCaja) > 1) setAnchoCaja(w)
      }}
      style={[{ height, borderRadius: radius, overflow: 'hidden' }, style]}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute', left: -ancho * 3, top: -height,
          height: height * 3, flexDirection: 'row',
          transform: [{ translateX: x }, { skewX: '-22deg' }],
        }}>
        {Array.from({ length: franjas }).map((_, i) => (
          <View key={i} style={{ width: ancho, backgroundColor: i % 3 === 0 ? COLORS.red : i % 3 === 1 ? '#fff' : COLORS.blue }} />
        ))}
      </Animated.View>
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
      <Pole height={7} radius={0} />
      <View style={s.ticketCuerpo}>{children}</View>
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
  noCargoT: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.ink, textAlign: 'center', marginTop: 6 },
  noCargoD: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textLight, textAlign: 'center', lineHeight: 19 },
  noCargoBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: COLORS.red, borderRadius: 4, paddingVertical: 11, paddingHorizontal: 20, marginTop: 10 },
  noCargoBtnT: { fontFamily: FONTS.bold, fontSize: 14, color: '#fff' },
  version: { paddingVertical: 14, alignItems: 'center' },
  versionT: { fontFamily: FONTS.medium, fontSize: 11.5, color: COLORS.textLight, textAlign: 'center' },
  versionD: { fontFamily: FONTS.regular, fontSize: 10.5, color: COLORS.textLight, textAlign: 'center', marginTop: 2 },
  perfFila: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12 },
  ticket: { backgroundColor: COLORS.carbon, borderRadius: 6, overflow: 'hidden' },
  ticketCuerpo: { padding: 16 },
  ticketPerf: { height: 18, justifyContent: 'center' },
  muesca: { position: 'absolute', width: 18, height: 18, borderRadius: 9 },
  ticketPie: { paddingHorizontal: 16, paddingBottom: 14, paddingTop: 2 },
  puntoWrap: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
  puntoHalo: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
  puntoNucleo: { width: 10, height: 10, borderRadius: 5 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  section: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.textMid, letterSpacing: 0.3 },
  sectionAction: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.blue },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  cardDark: { backgroundColor: COLORS.carbon, borderColor: COLORS.carbon },
  cardDarkEl: { backgroundColor: COLORS.carbonEl, borderColor: COLORS.carbonBorder },
  btn: { borderRadius: 6, paddingVertical: 15, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnT: { fontFamily: FONTS.bold, fontSize: 15 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  badge: { borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 6 },
  badgeT: { fontFamily: FONTS.bold, fontSize: 12 },
  chip: { borderWidth: 1.5, borderRadius: 4, paddingVertical: 10, paddingHorizontal: 15, alignItems: 'center' },
  chipT: { fontFamily: FONTS.bold, fontSize: 14 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: COLORS.borderSoft },
  kvK: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textMid },
  kvV: { fontFamily: FONTS.bold, fontSize: 14 },
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
        <Ionicons name="refresh" size={16} color="#fff" />
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
