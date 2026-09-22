/**
 * AGENDA · el calendario del barbero. Tablero: «D2 · Barbero · Agenda».
 *
 * Desde que existe Mi silla, la agenda contesta UNA pregunta: ¿qué tengo tal
 * día? El ahora —la fila, llamar, sentar sin cita, la pausa— vive en Mi silla,
 * y aquí no se repite. Antes las dos cosas estaban en una sola pantalla con un
 * selector de día arriba que solo mandaba en la mitad de abajo: tocabas un
 * jueves y la fila en vivo seguía siendo la de hoy.
 *
 *   · El selector de día MANDA: lo que eliges es lo que ves.
 *   · SIN CERRAR va arriba y en rojo mientras haya alguna: son citas de días
 *     pasados que nadie marcó, y el cron las cierra como «no llegó», que puede
 *     ser mentira.
 *   · La jornada: hoy se puede cambiar (abrir antes, alargar, cerrar por hoy,
 *     volver a la norma); otro día solo se enseña. Las RPC de jornada son de
 *     HOY y así se dice.
 *   · Citas y horas bloqueadas del día, cada una con su hoja.
 *
 * La lógica viene de la agenda de antes (agenda-trabajo, ya borrada), con sus reglas (R11:
 * alargar y adelantar son de quien pone el horario; el bloqueo se MODIFICA en
 * su sitio para no abrir un hueco a una reserva).
 */
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert, TextInput, Share } from 'react-native'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  getCitasFecha, getCitasSinCerrar, getConteoCitasRango, getBloqueosFecha, borrarBloqueo, actualizarEstadoCita,
  crearBloqueo, actualizarBloqueo, getNegocioById, getMiUsuario, mandoEnMiHorario, alargarJornada, adelantarJornada,
  jornadaNormal, cerrarJornada, getJornadaDe, getJornadaAhora,
} from '../lib/db'
import { hora12, fechaLarga, fechaISOLocal, fechaDeISO, sumarDias } from '../lib/format'
import { recordarCita } from '../lib/whatsapp'
import { avisos } from '../lib/notificaciones'
import { suscribirCitas, suscribirBloqueos, desuscribir } from '../lib/realtime'
import { getSesion } from '../lib/storage'
import { useRecargaAlEnfocar } from '../lib/recarga'
import { CITA_ABIERTA, MOTIVO_PAUSA } from '../lib/silla'
import { COLORS, FONTS } from '../constants'
import { NoCargo, Pole } from './ui'
import { Encabezado, Rotulo } from './d2'
import Hoja from './hoja'
import { Titulo, Sub, Nota, Opcion, Pie, BotonRojo, AhoraNo } from './hoja-piezas'
import PanelBadge from './panel-badge'

/** Cuántos días hacia adelante ofrece el selector (más ayer, para repasar). */
const DIAS_ADELANTE = 20

const FRASE_CITA: Record<string, string> = {
  creada: 'Reservada. Falta que el cliente confirme que viene.',
  confirmada: 'Confirmada. El cliente dijo que viene.',
  no_confirmada: 'Se pasó la hora de confirmar y no dijo nada. Puede aparecer igual: decides tú.',
  en_camino: 'Va en camino.',
  atendida: 'Atendida. Ya cuenta como visita y como cobro.',
  no_llego: 'No llegó. Pasó a la fila con prioridad por si aparece.',
  cancelada: 'Cancelada.',
}
/** El estado en la línea de la lista: corto, y con color solo si pide algo. */
const CORTO: Record<string, { t: string; c: string }> = {
  creada: { t: 'sin confirmar', c: COLORS.warning },
  confirmada: { t: 'confirmada', c: COLORS.textMid },
  no_confirmada: { t: 'no confirmó', c: COLORS.warning },
  en_camino: { t: 'en camino', c: COLORS.blue },
  atendida: { t: 'atendida', c: COLORS.success },
  no_llego: { t: 'no llegó', c: COLORS.redDark },
}

function horaAhora() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`
}
const horaSinAmPm = (t: string) => hora12(t).replace(/ (AM|PM)$/, '')
const fechaCorta = (iso: string) => fechaDeISO(iso).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' }).replace('.', '')

type HojaAgenda =
  | { tipo: 'cita'; item: any }
  | { tipo: 'bloqueoVer'; item: any }
  | { tipo: 'bloqueo'; item?: any }
  | { tipo: 'jornada' }

export default function AgendaCalendario() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const hoy = fechaISOLocal()
  const [fecha, setFecha] = useState(hoy)
  const [sesion, setSesion] = useState<any>(null)
  const [usuario, setUsuario] = useState<any>(null)
  const [negocio, setNegocio] = useState<any>(null)
  const [citas, setCitas] = useState<any[]>([])
  const [sinCerrar, setSinCerrar] = useState<any[]>([])
  const [bloqueos, setBloqueos] = useState<any[]>([])
  const [conteo, setConteo] = useState<Record<string, number>>({})
  const [jornada, setJornada] = useState<{ hora_inicio: string; hora_fin: string } | null>(null)
  const [enJornada, setEnJornada] = useState(false)
  const [mandoHorario, setMandoHorario] = useState(true)
  const [loading, setLoading] = useState(true)
  const [cambiando, setCambiando] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [fallo, setFallo] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [hoja, setHoja] = useState<HojaAgenda | null>(null)
  const [bIni, setBIni] = useState(12); const [bFin, setBFin] = useState(13); const [bMotivo, setBMotivo] = useState('')

  const esHoy = fecha === hoy

  // Las citas del día van sin `.catch`: «sin citas» y «no pude preguntar» no
  // pueden verse igual. El resto adorna y se tapa.
  const cargar = useCallback(async () => {
    try {
      setFallo(false)
      const ss = await getSesion(); setSesion(ss)
      if (!ss?.perfil_id) return
      const [c, sc, bl, cnt, jo, viva, mando, neg, u] = await Promise.all([
        getCitasFecha(ss.perfil_id, fecha),
        getCitasSinCerrar(ss.perfil_id).catch(() => []),
        getBloqueosFecha(ss.perfil_id, fecha).catch(() => []),
        getConteoCitasRango(ss.perfil_id, sumarDias(hoy, -1), sumarDias(hoy, DIAS_ADELANTE)).catch(() => ({})),
        getJornadaDe(ss.perfil_id, fecha).catch(() => null),
        getJornadaAhora(ss.perfil_id).catch(() => null),
        mandoEnMiHorario(ss.perfil_id).catch(() => true),
        ss.negocio_id ? getNegocioById(ss.negocio_id).catch(() => null) : Promise.resolve(null),
        getMiUsuario().catch(() => null),
      ])
      setCitas(c as any[]); setSinCerrar(sc as any[]); setBloqueos(bl as any[]); setConteo(cnt as any)
      setJornada(jo as any); setEnJornada(!!viva); setMandoHorario(mando as boolean); setNegocio(neg); setUsuario(u)
    } catch {
      setFallo(true)
    } finally {
      setLoading(false); setRefreshing(false); setCambiando(false)
    }
  }, [fecha, hoy])
  const correr = useRecargaAlEnfocar(cargar)

  // Otro día es otra pregunta. El primero ya lo pide el enfoque.
  const primera = useRef(true)
  useEffect(() => {
    if (primera.current) { primera.current = false; return }
    setCambiando(true); void correr()
  }, [fecha, correr])

  // En vivo: una cita nueva o cancelada, o un bloqueo puesto desde Mi silla.
  const pendiente = useRef<any>(null)
  useEffect(() => {
    const subs: any[] = []
    let vivo = true
    const refrescar = () => {
      if (pendiente.current) clearTimeout(pendiente.current)
      pendiente.current = setTimeout(() => { pendiente.current = null; void correr() }, 300)
    }
    getSesion().then(ss => {
      if (!vivo || !ss?.perfil_id) return
      subs.push(suscribirCitas(ss.perfil_id, fecha, refrescar))
      subs.push(suscribirBloqueos(ss.perfil_id, refrescar))
    })
    return () => { vivo = false; subs.forEach(desuscribir); if (pendiente.current) clearTimeout(pendiente.current) }
  }, [fecha, correr])

  // ── acciones ─────────────────────────────────────────────────────────────
  async function op(fn: () => Promise<any>, err = 'No se pudo') {
    if (ocupado) return
    setOcupado(true); setHoja(null)
    try { await fn(); void correr() }
    catch (e: any) { Alert.alert(err, e?.message ?? 'Intenta de nuevo.') }
    finally { setOcupado(false) }
  }
  function citaAtendida(c: any) {
    Alert.alert(c.turno_usuarios?.nombre ?? 'Cita', `${c.turno_servicios?.nombre ?? 'Servicio'} de las ${hora12(c.hora_inicio)}. ¿Ya lo atendiste?`, [
      { text: 'Todavía no', style: 'cancel' },
      { text: 'Sí, atendida', onPress: () => op(() => actualizarEstadoCita(c.id, 'atendida', { atendida_at: new Date().toISOString() })) },
    ])
  }
  function citaNoLlego(c: any) {
    Alert.alert('No llegó',
      `${c.turno_usuarios?.nombre ?? 'Tu cliente'} no apareció a las ${hora12(c.hora_inicio)}. Pasa a tu fila con prioridad: si aparece más tarde, entra antes que los demás.`, [
      { text: 'Esperar un poco más', style: 'cancel' },
      { text: 'No llegó', style: 'destructive', onPress: () => op(() => actualizarEstadoCita(c.id, 'no_llego')) },
    ])
  }
  function citaCancelar(c: any) {
    Alert.alert('Cancelar la cita', `La cancelas tú, y ${c.turno_usuarios?.nombre?.split(' ')[0] ?? 'el cliente'} recibe un aviso.`, [
      { text: 'No', style: 'cancel' },
      { text: 'Cancelarla', style: 'destructive', onPress: () => op(async () => {
        await actualizarEstadoCita(c.id, 'cancelada', { cancelada_by: 'barbero' })
        if (c.cliente_id) avisos.clienteCitaCancelada(c.cliente_id, negocio?.nombre ?? 'la barbería', `${fechaLarga(fechaDeISO(c.fecha))} a las ${hora12(c.hora_inicio)}`)
      }, 'No se pudo cancelar') },
    ])
  }
  function guardarBloqueo(editando?: any) {
    const desde = `${String(bIni).padStart(2, '0')}:00`
    const hasta = `${String(bFin).padStart(2, '0')}:00`
    op(async () => {
      // Se MODIFICA en su sitio: borrar y recrear abre un hueco por el que
      // puede colarse una reserva justo en la hora que se protege.
      if (editando?.id) await actualizarBloqueo(editando.id, { hora_inicio: desde, hora_fin: hasta, motivo: bMotivo.trim() || undefined })
      else await crearBloqueo({ perfil_id: sesion.perfil_id, fecha, hora_inicio: desde, hora_fin: hasta, motivo: bMotivo.trim() || undefined })
      setBMotivo('')
    }, 'No se pudo bloquear')
  }
  function abrirBloqueo(b?: any) {
    if (b) {
      setBIni(parseInt(String(b.hora_inicio).slice(0, 2), 10)); setBFin(parseInt(String(b.hora_fin).slice(0, 2), 10)); setBMotivo(b.motivo ?? '')
    } else {
      const h = esHoy ? Math.min(22, new Date().getHours() + 1) : 12
      setBIni(h); setBFin(h + 1); setBMotivo('')
    }
    setHoja({ tipo: 'bloqueo', item: b })
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={COLORS.red} size="large" /></View>
  if (fallo) return <View style={s.center}><NoCargo que="tu agenda" onReintentar={() => { setLoading(true); void correr() }} /></View>

  const dias = Array.from({ length: DIAS_ADELANTE + 2 }, (_, i) => sumarDias(hoy, i - 1))
  const citasDelDia = citas.filter((c: any) => c.estado !== 'cancelada')
  const canceladas = citas.length - citasDelDia.length
  const ahora = horaAhora()
  const antesDeAbrir = esHoy && !enJornada && !!jornada && ahora < jornada.hora_inicio
  const yaCerre = esHoy && !enJornada && !!jornada && !antesDeAbrir

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingTop: insets.top + 14, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void correr() }} />}>
        <PanelBadge />
        <Encabezado titulo="Mi agenda" sub={[fechaLarga(fechaDeISO(fecha)), negocio?.nombre].filter(Boolean).join(' · ')} />

        {/* EL CÓDIGO. Compartirlo es como le llegan clientes nuevos: lo único
            de la pantalla que hace crecer el negocio en vez de administrarlo. */}
        {!!usuario?.codigo_barbero && (
          <View style={s.codigo}>
            <Pole height={6} radius={0} animado={false} />
            <View style={s.codigoFila}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.codigoL}>TU CÓDIGO DE BARBERO</Text>
                <Text style={s.codigoV}>{usuario.codigo_barbero}</Text>
              </View>
              <TouchableOpacity style={s.compartir} activeOpacity={0.85} accessibilityRole="button"
                onPress={() => Share.share({ message: `Reserva conmigo en Turno con mi código de barbero ${usuario.codigo_barbero}` })}>
                <Ionicons name="share-outline" size={15} color="#fff" />
                <Text style={s.compartirT}>Compartir</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── EL DÍA. Arriba, porque manda: lo que eliges es lo que ves. ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 18, marginHorizontal: -18 }}
          contentContainerStyle={{ gap: 7, paddingHorizontal: 18 }}>
          {dias.map(d => {
            const on = d === fecha
            const dd = fechaDeISO(d)
            return (
              <TouchableOpacity key={d} style={[s.dia, on && s.diaOn]} onPress={() => setFecha(d)}
                accessibilityRole="button" accessibilityState={{ selected: on }}
                accessibilityLabel={`${fechaLarga(dd)}${conteo[d] ? `, ${conteo[d]} citas` : ''}`}>
                <Text style={[s.diaSem, on && { color: 'rgba(255,255,255,0.7)' }]}>
                  {d === hoy ? 'HOY' : dd.toLocaleDateString('es', { weekday: 'short' }).slice(0, 3).toUpperCase()}
                </Text>
                <Text style={[s.diaNum, on && { color: '#fff' }]}>{dd.getDate()}</Text>
                <View style={[s.diaPunto, !!conteo[d] && { backgroundColor: on ? '#fff' : COLORS.red }]} />
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        <View style={cambiando ? { opacity: 0.45 } : null}>
          {/* SIN CERRAR: una deuda, y las deudas se enseñan al entrar. */}
          {sinCerrar.length > 0 && (
            <>
              <Rotulo style={{ marginTop: 22 }}>{`Sin cerrar · días pasados · ${sinCerrar.length}`}</Rotulo>
              {sinCerrar.map((c: any) => (
                <TouchableOpacity key={c.id} style={[s.fila, s.filaDeuda]} onPress={() => setHoja({ tipo: 'cita', item: c })}>
                  <Text style={[s.filaHora, { color: COLORS.red, width: 58 }]}>{fechaCorta(c.fecha)}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.filaN} numberOfLines={1}>{c.turno_usuarios?.nombre ?? 'Cliente'}</Text>
                    <Text style={s.filaD} numberOfLines={1}>{hora12(c.hora_inicio)} · {c.turno_servicios?.nombre ?? 'Servicio'}</Text>
                  </View>
                  <Text style={s.vino}>¿Vino?</Text>
                </TouchableOpacity>
              ))}
            </>
          )}

          {/* LA JORNADA. Hoy se puede cambiar; otro día solo se dice. */}
          {esHoy ? (
            <TouchableOpacity style={s.jornada} onPress={() => setHoja({ tipo: 'jornada' })} accessibilityRole="button">
              <Ionicons name="time-outline" size={20} color={COLORS.ink} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.filaN}>
                  {jornada ? `Hoy trabajas de ${hora12(jornada.hora_inicio)} a ${hora12(jornada.hora_fin)}` : 'Hoy no trabajas'}
                </Text>
                <Text style={s.filaD}>
                  {antesDeAbrir ? 'Todavía no abres' : yaCerre ? 'Tu fila ya cerró por hoy' : enJornada ? 'Estás en tu jornada' : 'Tu horario de hoy'}
                  {mandoHorario ? ' · abrir antes, alargar o cerrar' : ' · cerrar por hoy'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={COLORS.textLight} />
            </TouchableOpacity>
          ) : (
            <View style={s.jornada}>
              <Ionicons name="time-outline" size={20} color={COLORS.textMid} />
              <Text style={[s.filaD, { flex: 1, marginTop: 0 }]}>
                {jornada ? `Ese día trabajas de ${hora12(jornada.hora_inicio)} a ${hora12(jornada.hora_fin)}.` : 'Ese día no trabajas.'}
              </Text>
            </View>
          )}

          <Rotulo>{esHoy ? 'Citas de hoy' : 'Citas del día'}</Rotulo>
          {citasDelDia.length === 0 && <Text style={s.vacio}>Sin citas este día.</Text>}
          {citasDelDia.map((c: any) => {
            const corto = CORTO[c.estado] ?? { t: c.estado, c: COLORS.textMid }
            const cerrada = !CITA_ABIERTA.includes(c.estado)
            return (
              <TouchableOpacity key={c.id} style={s.fila} onPress={() => setHoja({ tipo: 'cita', item: c })}>
                <Text style={[s.filaHora, cerrada && { color: COLORS.textLight }]}>{horaSinAmPm(c.hora_inicio)}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.filaN, cerrada && { color: COLORS.textMid }]} numberOfLines={1}>{c.turno_usuarios?.nombre ?? 'Cliente'}</Text>
                  <Text style={s.filaD} numberOfLines={1}>
                    {c.turno_servicios?.nombre ?? 'Servicio'} · <Text style={{ color: corto.c, fontFamily: FONTS.bold }}>{corto.t}</Text>
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={COLORS.textLight} />
              </TouchableOpacity>
            )
          })}
          {/* Las canceladas no son trabajo: la hora volvió a estar libre. Se
              cuentan para no perder el dato, fuera de la lista. */}
          {canceladas > 0 && (
            <Text style={s.canceladas}>{canceladas === 1 ? '1 cita cancelada este día' : `${canceladas} citas canceladas este día`}</Text>
          )}

          {bloqueos.length > 0 && (
            <>
              <Rotulo>Horas bloqueadas</Rotulo>
              {bloqueos.map((b: any) => (
                <TouchableOpacity key={b.id} style={s.fila} onPress={() => setHoja({ tipo: 'bloqueoVer', item: b })}>
                  <Ionicons name="lock-closed" size={16} color={COLORS.textMid} style={{ width: 20 }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.filaN}>{hora12(b.hora_inicio)} – {hora12(b.hora_fin)}</Text>
                    <Text style={s.filaD} numberOfLines={1}>{b.motivo || 'Bloqueada'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={COLORS.textLight} />
                </TouchableOpacity>
              ))}
            </>
          )}

          {/* Bloquear cierra horas al público: deja de entrar trabajo. Por
              eso va en rojo y en contorno, lejos de lo que trae clientes. */}
          <TouchableOpacity style={s.bloquear} onPress={() => abrirBloqueo()} accessibilityRole="button">
            <Ionicons name="lock-closed-outline" size={16} color={COLORS.red} />
            <Text style={s.bloquearT}>Bloquear una hora{esHoy ? '' : ' de este día'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Hoja visible={!!hoja} onClose={() => setHoja(null)}>
        {hoja?.tipo === 'cita' && (() => {
          const c = hoja.item
          const abierta = CITA_ABIERTA.includes(c.estado)
          const pasada = c.fecha < hoy || (c.fecha === hoy && String(c.hora_inicio) < ahora)
          const tel = c.turno_usuarios?.telefono && /\d{7,}/.test(String(c.turno_usuarios.telefono).replace(/\D/g, '')) ? c.turno_usuarios.telefono : null
          const confirmada = c.estado === 'confirmada' || c.estado === 'en_camino'
          return (
            <>
              <Titulo>{horaSinAmPm(c.hora_inicio)} · {c.turno_usuarios?.nombre ?? 'Cita'}</Titulo>
              <Sub>{[c.turno_servicios?.nombre, c.turno_servicios?.duracion_min ? `${c.turno_servicios.duracion_min} min` : null,
                c.fecha !== hoy ? fechaLarga(fechaDeISO(c.fecha)) : null].filter(Boolean).join(' · ')}</Sub>
              <Nota tono={confirmada ? 'azul' : abierta ? 'ambar' : 'gris'}>{FRASE_CITA[c.estado] ?? c.estado}</Nota>
              {abierta ? (
                <>
                  <Opcion t="Atendida" d="Cuenta como visita y como cobro" onPress={() => { setHoja(null); citaAtendida(c) }} />
                  <Opcion t="No llegó" d="Pasa a tu fila con prioridad por si aparece" rojo onPress={() => { setHoja(null); citaNoLlego(c) }} />
                  <Opcion t="Cancelar la cita" d="La cancelas tú, y se le avisa" rojo onPress={() => { setHoja(null); citaCancelar(c) }} />
                  {tel && !pasada && (
                    <Opcion t="Recordarle por WhatsApp" d="Abre el chat con el mensaje escrito"
                      onPress={() => recordarCita(tel, c.turno_usuarios?.nombre ?? 'cliente', c.hora_inicio, negocio?.nombre ?? 'tu barbería')} />
                  )}
                </>
              ) : (
                <Text style={s.cerradaT}>Esta cita ya está cerrada. Se queda en la agenda como registro de lo que pasó.</Text>
              )}
              {c.cliente_id && (
                <Opcion t="Ver su ficha" d="Historial, su tarjeta y tu nota" flecha onPress={() => {
                  setHoja(null)
                  router.push({ pathname: '/(app)/barbero/clientes', params: { cliente: c.cliente_id, nombre: c.turno_usuarios?.nombre ?? 'Cliente', telefono: c.turno_usuarios?.telefono ?? '' } } as any)
                }} />
              )}
              <Pie><AhoraNo texto="Cerrar" onPress={() => setHoja(null)} /></Pie>
            </>
          )
        })()}

        {/* HOY CIERRO MÁS TARDE (87), HOY ABRO ANTES (91). La excepción de
            HOY: caduca sola y no toca el horario de siempre. Alargar y
            adelantar inventan disponibilidad y son de quien pone el horario
            (R11); cerrar y volver a la norma solo quitan, y son de todos. */}
        {hoja?.tipo === 'jornada' && (
          <>
            <Titulo>{antesDeAbrir ? 'Hoy abro antes' : yaCerre ? 'Seguir abierto un rato' : 'Tu jornada de hoy'}</Titulo>
            <Sub>
              {!mandoHorario
                ? `Tu horario lo pone ${negocio?.nombre ?? 'tu barbería'}. Lo que sí es tuyo: si terminas antes, apaga la fila y deja de entrarte gente.`
                : antesDeAbrir
                  ? `Hoy abres a las ${hora12(jornada!.hora_inicio)}. Puedes adelantar la apertura solo por hoy: mañana vuelves a tu horario de siempre.`
                  : yaCerre
                    ? 'Tu fila ya cerró por horario. Puedes dejarla abierta un rato más solo por hoy.'
                    : 'Puedes alargar el cierre de hoy o apagar la fila ya. Es solo por hoy: tu horario de siempre no se toca.'}
            </Sub>
            {mandoHorario && [30, 60, 120].map(min => antesDeAbrir ? (
              <Opcion key={min} t={min < 60 ? `Abrir ${min} minutos antes` : min === 60 ? 'Abrir una hora antes' : 'Abrir dos horas antes'}
                d="Empieza a entrarte gente por la app" disabled={ocupado}
                onPress={() => op(async () => { const h = await adelantarJornada(sesion.perfil_id, min); Alert.alert('Listo', `Hoy abres a las ${hora12(h)}.`) }, 'No se pudo adelantar')} />
            ) : (
              <Opcion key={min} t={min < 60 ? `${min} minutos más` : min === 60 ? 'Una hora más' : 'Dos horas más'}
                d="Vuelve a entrar gente por la app" disabled={ocupado}
                onPress={() => op(async () => { const h = await alargarJornada(sesion.perfil_id, min); Alert.alert('Listo', `Hoy cierras a las ${hora12(h)}.`) }, 'No se pudo alargar')} />
            ))}
            <Opcion t={antesDeAbrir ? 'Hoy no abro' : 'Ya cierro por hoy'} rojo disabled={ocupado}
              d={antesDeAbrir ? 'Tu fila queda cerrada todo el día; mañana abre a tu hora' : 'Apaga tu fila ahora mismo; mañana abre a tu hora'}
              onPress={() => op(() => cerrarJornada(sesion.perfil_id), 'No se pudo cerrar')} />
            <Opcion t="Volver a mi horario de siempre" d="Deshace los cambios de hoy" disabled={ocupado}
              onPress={() => op(() => jornadaNormal(sesion.perfil_id), 'No se pudo deshacer')} />
            <Pie><AhoraNo texto="Cerrar" onPress={() => setHoja(null)} /></Pie>
          </>
        )}

        {hoja?.tipo === 'bloqueoVer' && (() => {
          const b = hoja.item
          const yaPaso = b.fecha < hoy || (b.fecha === hoy && String(b.hora_fin) < ahora)
          const esPausa = b.motivo === MOTIVO_PAUSA
          return (
            <>
              <Titulo>{b.motivo || 'Hora bloqueada'}</Titulo>
              <Sub>{hora12(b.hora_inicio)} – {hora12(b.hora_fin)} · {fechaLarga(fechaDeISO(b.fecha))}</Sub>
              <Nota tono="gris">
                {yaPaso ? 'Esta hora ya pasó, así que no le quita sitio a nadie.'
                  : esPausa ? 'Es tu «salgo un momento» de Mi silla: la hora a la que dijiste que vuelves.'
                  : 'Mientras esté puesta, nadie puede reservar esa hora contigo. Si terminas antes, libérala.'}
              </Nota>
              {!yaPaso && !esPausa && <Opcion t="Cambiar la hora" d="Si terminas antes, o si necesitas más rato" flecha onPress={() => abrirBloqueo(b)} />}
              <Opcion t="Liberar esta hora" d="Vuelve a estar disponible para reservas" rojo disabled={ocupado}
                onPress={() => op(() => borrarBloqueo(b.id), 'No se pudo liberar')} />
              <Pie><AhoraNo texto="Cerrar" onPress={() => setHoja(null)} /></Pie>
            </>
          )
        })()}

        {hoja?.tipo === 'bloqueo' && (
          <>
            <Titulo>{hoja.item ? 'Cambiar la hora bloqueada' : 'Bloquear una hora'}</Titulo>
            <Sub>
              {fechaLarga(fechaDeISO(fecha))}. Ese rato no se ofrece para citas.
              {hoja.item ? ' Si lo acortas, lo que sueltes vuelve a estar libre.' : ''}
            </Sub>
            <Paso etiqueta="Desde" valor={hora12(`${String(bIni).padStart(2, '0')}:00`)}
              menos={() => setBIni(Math.max(0, bIni - 1))} mas={() => { const n = Math.min(23, bIni + 1); setBIni(n); if (bFin <= n) setBFin(n + 1) }} />
            <Paso etiqueta="Hasta" valor={hora12(`${String(bFin % 24).padStart(2, '0')}:00`)}
              menos={() => setBFin(Math.max(bIni + 1, bFin - 1))} mas={() => setBFin(Math.min(24, bFin + 1))} />
            <Text style={s.lbl}>MOTIVO · SI QUIERES</Text>
            <TextInput style={s.input} placeholder="Almuerzo, diligencia…" placeholderTextColor={COLORS.textLight}
              value={bMotivo} onChangeText={setBMotivo} maxLength={60} />
            <Pie>
              <BotonRojo texto={hoja.item ? 'Guardar el cambio' : 'Bloquear'} ocupado={ocupado} onPress={() => guardarBloqueo(hoja.item)} />
              <AhoraNo onPress={() => setHoja(null)} />
            </Pie>
          </>
        )}
      </Hoja>
    </View>
  )
}

function Paso({ etiqueta, valor, menos, mas }: { etiqueta: string; valor: string; menos: () => void; mas: () => void }) {
  return (
    <View style={s.paso}>
      <Text style={s.pasoL}>{etiqueta}</Text>
      <TouchableOpacity style={s.pasoBtn} onPress={menos} accessibilityLabel={`${etiqueta}: una hora menos`}><Text style={s.pasoBtnT}>−</Text></TouchableOpacity>
      <Text style={s.pasoV}>{valor}</Text>
      <TouchableOpacity style={s.pasoBtn} onPress={mas} accessibilityLabel={`${etiqueta}: una hora más`}><Text style={s.pasoBtnT}>+</Text></TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  codigo: { marginTop: 16, borderRadius: 6, backgroundColor: COLORS.carbon, overflow: 'hidden' },
  codigoFila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  codigoL: { fontFamily: FONTS.extrabold, fontSize: 10, letterSpacing: 2, color: COLORS.textLight },
  codigoV: { fontFamily: FONTS.display, fontSize: 26, lineHeight: 31, color: '#fff', letterSpacing: 2, marginTop: 2 },
  compartir: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: COLORS.red, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 4 },
  compartirT: { fontFamily: FONTS.extrabold, fontSize: 13, color: '#fff' },
  dia: { width: 52, paddingVertical: 9, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  diaOn: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  diaSem: { fontFamily: FONTS.extrabold, fontSize: 9.5, letterSpacing: 1, color: COLORS.textLight },
  diaNum: { fontFamily: FONTS.display, fontSize: 21, lineHeight: 26, color: COLORS.ink, marginTop: 2 },
  diaPunto: { width: 5, height: 5, borderRadius: 3, marginTop: 3, backgroundColor: 'transparent' },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  filaDeuda: { borderLeftWidth: 3, borderLeftColor: COLORS.red, paddingLeft: 10 },
  filaHora: { width: 52, fontFamily: FONTS.display, fontSize: 21, color: COLORS.blue },
  filaN: { fontFamily: FONTS.extrabold, fontSize: 15, color: COLORS.ink },
  filaD: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.textMid, marginTop: 2 },
  vino: { fontFamily: FONTS.extrabold, fontSize: 12.5, color: COLORS.red },
  jornada: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, marginTop: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  vacio: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textMid, paddingVertical: 16 },
  canceladas: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.textLight, marginTop: 10 },
  bloquear: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, marginTop: 24, borderWidth: 2, borderColor: COLORS.red },
  bloquearT: { fontFamily: FONTS.extrabold, fontSize: 14, color: COLORS.red },
  cerradaT: { fontFamily: FONTS.medium, fontSize: 13, lineHeight: 19, color: COLORS.textMid, marginVertical: 8 },
  paso: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  pasoL: { flex: 1, fontFamily: FONTS.bold, fontSize: 14, color: COLORS.textMid },
  pasoBtn: { width: 44, height: 44, borderWidth: 2, borderColor: COLORS.ink, alignItems: 'center', justifyContent: 'center' },
  pasoBtnT: { fontFamily: FONTS.display, fontSize: 22, color: COLORS.ink },
  pasoV: { width: 96, textAlign: 'center', fontFamily: FONTS.display, fontSize: 20, color: COLORS.ink },
  lbl: { fontFamily: FONTS.extrabold, fontSize: 11, letterSpacing: 2, color: COLORS.textLight, marginTop: 18 },
  input: { borderWidth: 2, borderColor: COLORS.ink, height: 50, paddingHorizontal: 14, marginTop: 8,
    fontFamily: FONTS.medium, fontSize: 15, color: COLORS.ink, backgroundColor: COLORS.surface },
})
