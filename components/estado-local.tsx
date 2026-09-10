/**
 * EL CUADRO DE ESTADO DE LA BARBERÍA, PARA EL CLIENTE.
 *
 * El barbero tiene su panel y el dueño tiene la cola del local: los dos abren
 * la app y en dos segundos saben cómo está la cosa. El cliente no tenía nada
 * de eso. Abría Inicio y lo que veía era un catálogo —reservar cita, lista de
 * barberos, servicios, precios— sin una sola línea que contestara lo que va a
 * preguntarse siempre, que es lo mismo que preguntaría asomándose a la puerta:
 *
 *   ¿está abierto ahora?, ¿hay mucha gente?, ¿cuánto voy a esperar?
 *
 * Eso es esta tarjeta. Lee turno_estado_local, que desde la migración 77 trae
 * también si la fila de cada silla admite gente AHORA y el motivo cuando no
 * —el mismo texto con el que el servidor rechazaría el turno—, así que lo que
 * dice aquí es exactamente lo que va a pasar al tocar el botón.
 *
 * No lleva acciones. Entrar a la fila se hace en "Mi turno" y reservar en su
 * pantalla: una tarjeta que informa y además opera acaba siendo las dos cosas
 * a medias. Aquí solo se mira.
 */
import { View, Text, StyleSheet } from 'react-native'
import { COLORS, FONTS } from '../constants'
import { relojesDeSilla } from '../lib/format'
import { PuntoVivo } from './ui'

export type SillaEstado = {
  perfil_id: string
  barbero: string
  estado: 'libre' | 'atendiendo' | 'descanso' | 'inactivo'
  en_cola: number
  fila_abierta?: boolean | null
  fila_motivo?: string | null
  modo?: string | null
  /** Relojes de la silla ocupada (migración 79). */
  desde?: string | null
  fin_estimado?: string | null
}

const COLOR: Record<string, string> = {
  libre: COLORS.success,
  atendiendo: '#8AB4FF',
  descanso: COLORS.warning,
  inactivo: 'rgba(255,255,255,0.35)',
}

export default function EstadoLocal({ sillas, delante, esperaMin }: {
  sillas: SillaEstado[]
  /** Personas por delante en la fila del local (turno_resumen_fila). */
  delante: number
  /** Minutos estimados de espera para quien entre ahora. */
  esperaMin: number
}) {
  if (sillas.length === 0) return null

  // ABIERTO es que alguien pueda atenderte ahora: por fila o por cita. Si
  // ninguna silla admite gente, el local está cerrado para ti aunque haya
  // barberos dados de alta, y decir "abierto" sería mentir con matices.
  const conFila = sillas.filter(x => x.fila_abierta !== false)
  const abierto = conFila.length > 0
  const atendiendo = sillas.filter(x => x.estado === 'atendiendo').length
  const libres = conFila.filter(x => x.estado === 'libre').length

  // El motivo del cierre, cuando todas dicen lo mismo. Con dos motivos
  // distintos no se resume: se ve silla por silla en los chips de abajo.
  const motivos = Array.from(new Set(sillas.map(x => x.fila_motivo).filter(Boolean))) as string[]
  const motivoComun = !abierto && motivos.length === 1 ? motivos[0] : null

  const titulo = abierto
    ? (libres > 0 && delante === 0 ? 'Abierto · entras directo' : 'Abierto ahora')
    : 'Cerrado ahora'

  const detalle = abierto
    ? [
        delante === 0 ? 'Nadie esperando' : `${delante} esperando`,
        delante > 0 && esperaMin > 0 ? `unos ${esperaMin} min` : null,
        atendiendo > 0 ? `${atendiendo} en la silla` : null,
      ].filter(Boolean).join(' · ')
    : (motivoComun ? motivoComun.charAt(0).toUpperCase() + motivoComun.slice(1) : 'Ninguna silla está tomando gente ahora')

  return (
    <View style={s.card}>
      <View style={s.head}>
        <PuntoVivo color={abierto ? COLORS.success : 'rgba(255,255,255,0.4)'} vivo={abierto} />
        <View style={{ flex: 1 }}>
          <Text style={s.lbl}>LA BARBERÍA AHORA</Text>
          <Text style={s.titulo}>{titulo}</Text>
        </View>
      </View>
      <Text style={s.detalle}>{detalle}</Text>

      {/* Silla por silla. El cliente elige persona, no "recurso": ver quién
          está libre y quién lleva tres esperando es lo que de verdad decide
          con quién se sienta. */}
      <View style={s.sillas}>
        {sillas.map(x => {
          const cerrada = x.fila_abierta === false
          return (
            <View key={x.perfil_id} style={s.chip}>
              <View style={[s.punto, { backgroundColor: cerrada ? COLOR.inactivo : COLOR[x.estado] ?? COLOR.inactivo }]} />
              <Text style={s.chipT} numberOfLines={1}>
                {x.barbero?.split(' ')[0] ?? 'Barbero'}
                {/* Con la silla ocupada, la hora a la que queda libre es lo
                    único que el cliente necesita para decidir si espera. Sale
                    del servidor, no del reloj del teléfono. */}
                <Text style={s.chipD}>
                  {cerrada ? (x.modo === 'solo_citas' ? '  solo con cita' : '  cerrado')
                    : x.estado === 'atendiendo' ? (() => {
                        const r = relojesDeSilla(x.desde, x.fin_estimado)
                        return r?.fin && !r.tarde ? `  libre ~${r.fin}` : '  atendiendo'
                      })()
                    : x.en_cola > 0 ? `  ${x.en_cola} esperando`
                    : '  libre'}
                </Text>
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  // Fondo carbón, como el cuadro del barbero y la cola del dueño: es la misma
  // información y por eso tiene el mismo peso visual en las tres pantallas.
  card: { backgroundColor: COLORS.carbon, borderRadius: 16, padding: 18, marginBottom: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lbl: { fontFamily: FONTS.bold, fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 },
  titulo: { fontFamily: FONTS.bold, fontSize: 17, color: '#fff', marginTop: 3 },
  detalle: { fontFamily: FONTS.medium, fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 8, lineHeight: 18 },
  sillas: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999, paddingVertical: 6, paddingHorizontal: 11, maxWidth: '100%' },
  punto: { width: 7, height: 7, borderRadius: 4 },
  chipT: { fontFamily: FONTS.bold, fontSize: 12.5, color: '#fff', flexShrink: 1 },
  chipD: { fontFamily: FONTS.medium, fontSize: 12, color: 'rgba(255,255,255,0.6)' },
})
