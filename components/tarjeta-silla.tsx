/**
 * LA TARJETA DE MI SILLA — el único objeto oscuro de la pantalla del barbero.
 *
 * Es la hermana de la tarjeta del cliente (components/tarjeta-turno) y tiene
 * su misma anatomía, a propósito: poste, el local en letra de titular como cabecera,
 * filete, un rótulo de estado, la cifra, el cuerpo y el pie con sus botones.
 * Un barbero que también es cliente de otra barbería reconoce la pieza.
 *
 * NO DECIDE NADA. Qué modo toca, qué dice y qué botones lleva lo decide
 * lib/silla.ts —una función pura, probada modo a modo en
 * scripts/probar-silla.mjs—. Esto solo lo dibuja, y le pasa a la pantalla qué
 * botón se tocó. Así la regla vive en un sitio y el dibujo en otro.
 */
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, SOBRE, BOTON_CLARO } from '../constants'
import { Pole, PuntoVivo } from './ui'
import { Cifra, DegradadoTurno } from './tarjeta-turno'
import type { ModoSilla, Accion, Senal } from '../lib/silla'

const SENAL: Record<Senal | 'tenue', string> = {
  ok: COLORS.okNoche,
  azul: COLORS.azulNoche,
  ambar: COLORS.ambarNoche,
  neutro: COLORS.onCarbonMid,
  blanco: '#FFFFFF',
  rojo: COLORS.redSoft,
  tenue: COLORS.onCarbonMid,
}

export default function TarjetaSilla({ modo, local, variosLocales, onCambiarLocal, onAccion, ocupado, mas }: {
  modo: ModoSilla
  local?: string | null
  /** Trabaja en más de un sitio: el nombre del local se vuelve conmutador. */
  variosLocales?: boolean
  onCambiarLocal?: () => void
  onAccion: (a: Accion) => void
  /** Una acción en curso: los botones esperan para no mandarla dos veces. */
  ocupado?: boolean
  /** El menú de quien está llamado o sentado: avisarle, devolverlo, se fue. */
  mas?: { texto: string; onPress: () => void }
}) {
  const rojo = modo.fondo === 'rojo'
  // «En la silla» va en el degradado, como el turno del cliente (lienzo S5).
  const deg = !rojo && modo.poste && modo.estado === 'EN LA SILLA'
  // Regla 1: la superficie decide el texto. Las señales de color solo sobre la tinta.
  const sup = rojo ? SOBRE.rojo : deg ? SOBRE.degradado : SOBRE.tinta
  const pintada = rojo || deg
  const tenue = sup.t2
  const filete = sup.linea
  const senal = SENAL[modo.senal]
  const textoEstado = pintada ? sup.t1 : senal
  // El punto late cuando la silla está viva: libre, trabajando, alguien viene.
  // Apagado cuando no pasa nada —cerrado, sin pagar, sin red—: un punto que
  // late sobre un local cerrado dice lo contrario del texto que tiene al lado.
  const vivo = !['neutro', 'rojo'].includes(modo.senal) && modo.estado !== 'SIN CONEXIÓN'

  return (
    <View style={[s.card, { backgroundColor: deg ? SOBRE.degradado.fondo : rojo ? SOBRE.rojo.fondo : SOBRE.tinta.fondo }]}>
      {deg && <DegradadoTurno />}
      <View style={s.cuerpo}>
        <TouchableOpacity
          disabled={!variosLocales} onPress={onCambiarLocal} activeOpacity={0.75}
          accessibilityRole={variosLocales ? 'button' : undefined}
          accessibilityLabel={variosLocales ? 'Cambiar de local' : undefined}
          style={s.cab}>
          <Text style={s.local} numberOfLines={2}>{local ?? 'Mi silla'}</Text>
          {variosLocales && <Ionicons name="chevron-down" size={18} color={tenue} />}
        </TouchableOpacity>

        {/* El poste solo marca «en la silla»: la barra de barbero fina, dentro
            de la tarjeta, en el sitio del filete (muestra «Cristal propio»). */}
        {modo.poste && modo.estado === 'EN LA SILLA'
          ? <Pole height={6} radius={3} ancho={5} style={s.posteFino} />
          : <View style={[s.filete, { backgroundColor: filete }]} />}

        <View style={s.estadoFila}>
          <View style={s.estadoIzq}>
            <PuntoVivo color={senal} vivo={vivo} />
            <Text style={[s.estadoT, { color: textoEstado }]} numberOfLines={1}>{modo.estado}</Text>
          </View>
          {!!modo.derecha && <Text style={[s.derecha, { color: tenue }]} numberOfLines={1}>{modo.derecha}</Text>}
        </View>

        {!!modo.cifra && (
          <Cifra valor={modo.cifra} rotulo={modo.rotulo ?? ''} color={pintada ? sup.t1 : SENAL[modo.cifraSenal ?? 'blanco']} rotColor={sup.t2}
            latiendo={modo.latiendo} />
        )}

        <Text style={[s.texto, { color: sup.t2 }]}>
          {!!modo.destacado && <Text style={[s.destacado, { color: sup.t1 }]}>{modo.destacado}</Text>}
          {modo.cuerpo}
        </Text>

        {modo.botones.length > 0 && (
          <>
            <View style={[s.filete, { backgroundColor: filete, marginTop: 16, marginBottom: 14 }]} />
            <View style={s.pie}>
              {modo.botones.map(b => {
                const apagado = b.tipo === 'apagado'
                return (
                  <TouchableOpacity key={b.accion}
                    style={[s.btn, { flex: b.peso ?? 1 }, ESTILO_BTN[b.tipo], apagado && { borderColor: sup.dis }]}
                    onPress={() => onAccion(b.accion)} disabled={apagado || ocupado} activeOpacity={0.85}
                    accessibilityRole="button" accessibilityState={{ disabled: apagado || !!ocupado }}>
                    <Text style={[s.btnT, { color: apagado ? sup.dis : TEXTO_BTN[b.tipo] }]} numberOfLines={1}>{b.texto}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </>
        )}

        {/* El porqué de un botón apagado va DEBAJO y en palabras: un botón
            gris sin explicación hace pensar que la app está rota. */}
        {!!modo.nota && <Text style={[s.nota, { color: tenue }]}>{modo.nota}</Text>}

        {mas && (
          <TouchableOpacity onPress={mas.onPress} style={s.mas} hitSlop={8} accessibilityRole="button">
            <Text style={[s.masT, { color: tenue }]}>{mas.texto}</Text>
            <Ionicons name="chevron-forward" size={14} color={tenue} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

// Regla 3 · botones sobre superficie pintada. Apagado: borde punteado y el
// color «Apagado» de la superficie, nunca opacidad.
const ESTILO_BTN = StyleSheet.create({
  claro: { backgroundColor: BOTON_CLARO.fondo },
  rojo: { backgroundColor: SOBRE.rojo.fondo },
  contorno: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)' },
  apagado: { borderWidth: 1.5, borderStyle: 'dashed' },
})
const TEXTO_BTN = { claro: BOTON_CLARO.texto, rojo: '#FFFFFF', contorno: '#FFFFFF', apagado: SOBRE.tinta.dis }

const s = StyleSheet.create({
  card: { borderRadius: 28, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  cuerpo: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 18 },
  cab: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  local: { flex: 1, fontFamily: FONTS.semibold, fontSize: 17, lineHeight: 22, color: '#FFFFFF' },
  filete: { height: 1, marginVertical: 14 },
  posteFino: { marginVertical: 14 },
  estadoFila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  estadoIzq: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 },
  estadoT: { fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 1.2, flexShrink: 1 },
  derecha: { flex: 1, textAlign: 'right', fontFamily: FONTS.regular, fontSize: 13 },
  texto: { fontFamily: FONTS.regular, fontSize: 15, lineHeight: 21, marginTop: 12 },
  destacado: { fontFamily: FONTS.semibold },
  pie: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  btn: { height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  btnT: { fontFamily: FONTS.semibold, fontSize: 15 },
  nota: { fontFamily: FONTS.regular, fontSize: 12, lineHeight: 17, marginTop: 10 },
  mas: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 4, marginTop: 12, paddingVertical: 4 },
  masT: { fontFamily: FONTS.semibold, fontSize: 13, textDecorationLine: 'underline' },
})
