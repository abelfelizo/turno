import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert, Modal, TextInput, Share } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { Ionicons } from '@expo/vector-icons'
import {
  getCitasFecha, getConteoCitasRango, getBloqueosFecha, borrarBloqueo, getColaActiva, llamarSiguiente,
  actualizarEstadoCola, actualizarEstadoCita, getServiciosPerfil, crearBloqueo, getNegocioById,
  getPreferenciasCliente, getNotaBarbero, getMiUsuario, getCanjeActivoCliente, aplicarCanje, iniciarAtencion,
  moverEnCola, llamarA, sacarDeCola, devolverAFila, cambiarServicioCola, ocuparAhora, liberarAhora,
  getEstadoBarbero, actualizarEstadoPerfil,
} from '../lib/db'
import { hora12, fechaLarga, fechaISOLocal, fechaDeISO, sumarDias } from '../lib/format'
import { avisarTurno, recordarCita } from '../lib/whatsapp'
import { enviarPush } from '../lib/notificaciones'
import { suscribirCola, suscribirCitas, suscribirBloqueos, desuscribir } from '../lib/realtime'
import { getSesion } from '../lib/storage'
import { COLORS, FONTS } from '../constants'
import { Display, Avatar, Badge } from './ui'
import PanelBadge from './panel-badge'

const EST_FONDO: Record<string, string> = {
  libre: COLORS.success, atendiendo: COLORS.blue, descanso: COLORS.warning, inactivo: COLORS.textLight,
}

/** Cuántos días hacia adelante ofrece el selector (más ayer, para repasar). */
const DIAS_ADELANTE = 20

/** Suma minutos a una hora "HH:MM:SS" sin salirse del día. */
function sumarMinutos(hhmmss: string, min: number) {
  const [h, m] = hhmmss.split(':').map(Number)
  const total = Math.min(23 * 60 + 59, h * 60 + m + min)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00`
}

/** Minutos que lleva el cliente sentado, para avisar de un corte sin cerrar. */
function minutosEnSilla(q: any) {
  const desde = q?.atendiendo_at ?? q?.llamado_at
  if (!desde) return 0
  return Math.floor((Date.now() - new Date(desde).getTime()) / 60000)
}

/** Hora local "HH:MM:SS", para comparar contra los bloqueos del día. */
function horaAhora() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`
}

/** Agenda de trabajo: la usa el barbero y el dueño-que-atiende. Opera sobre sesion.perfil_id. */
export default function AgendaTrabajo({ titulo = 'Mi agenda' }: { titulo?: string }) {
  const [citas, setCitas] = useState<any[]>([])
  const [cola, setCola] = useState<any[]>([])
  const [bloqueos, setBloqueos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sesion, setSesion] = useState<any>(null)
  const [usuario, setUsuario] = useState<any>(null)
  const [negocio, setNegocio] = useState<any>(null)
  const [vale, setVale] = useState<any>(null)
  const [servicios, setServicios] = useState<any[]>([])
  const [wEnviando, setWEnviando] = useState(false)
  const [bIni, setBIni] = useState(12); const [bFin, setBFin] = useState(13); const [bMotivo, setBMotivo] = useState('')
  const [bEnviando, setBEnviando] = useState(false)
  const [ficha, setFicha] = useState<any>(null)

  // Una sola hoja inferior para todo. Encadenar dos <Modal> en iOS deja el
  // segundo sin presentar cuando el primero todavía se está cerrando.
  type Hoja =
    | { tipo: 'acciones'; item: any }
    | { tipo: 'sacar'; item: any }
    | { tipo: 'servicios'; modo: 'ocupar' }
    | { tipo: 'servicios'; modo: 'cambiar'; item: any }
    | { tipo: 'bloqueo' }
  const [hoja, setHoja] = useState<Hoja | null>(null)

  const hoy = fechaISOLocal()
  const [fecha, setFecha] = useState(hoy)
  const [conteo, setConteo] = useState<Record<string, number>>({})
  const [tic, setTic] = useState(0)   // fuerza recalcular la hora cada 30 s
  const [verTodos, setVerTodos] = useState(false)
  const [estado, setEstado] = useState<any>(null)
  const esHoy = fecha === hoy

  const cargar = useCallback(async () => {
    const ss = await getSesion(); setSesion(ss)
    if (!ss?.perfil_id) { setLoading(false); return }
    const [c, q, sv, neg, u, cnt, bl, est] = await Promise.all([
      getCitasFecha(ss.perfil_id, fecha),
      getColaActiva(ss.negocio_id!, ss.perfil_id),
      getServiciosPerfil(ss.perfil_id).catch(() => []),
      getNegocioById(ss.negocio_id!).catch(() => null),
      getMiUsuario().catch(() => null),
      getConteoCitasRango(ss.perfil_id, sumarDias(hoy, -1), sumarDias(hoy, DIAS_ADELANTE)).catch(() => ({})),
      getBloqueosFecha(ss.perfil_id, fecha).catch(() => []),
      getEstadoBarbero(ss.perfil_id).catch(() => null),
    ])
    setCitas(c as any[]); setCola(q as any[]); setServicios(sv as any[]); setNegocio(neg)
    setUsuario(u); setConteo(cnt as any); setBloqueos(bl as any[]); setEstado(est)
    setLoading(false); setRefreshing(false)
  }, [fecha, hoy])

  /** Sin cita = la silla queda tomada por lo que dura el servicio. No se crea
   *  ningún cliente: lo que importa es que esa hora deje de ofrecerse y que la
   *  cola digital sume esa espera. */
  function ocuparSilla(sv: any) {
    Alert.alert('Cliente sin cita', `Ocupar tu silla ${sv.duracion_min} min para ${sv.nombre}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Ocupar', onPress: async () => {
        setWEnviando(true)
        try {
          await ocuparAhora(sesion.perfil_id, sv.id)
          setHoja(null); cargar()
        } catch (e: any) { Alert.alert('No se pudo', e.message ?? 'Intenta de nuevo.') }
        finally { setWEnviando(false) }
      } },
    ])
  }

  async function cambiarServicio(item: any, sv: any) {
    setWEnviando(true)
    try { await cambiarServicioCola(item.id, sv.id); setHoja(null); cargar() }
    catch (e: any) { Alert.alert('No se pudo cambiar', e.message ?? 'Intenta de nuevo.') }
    finally { setWEnviando(false) }
  }

  async function guardarBloqueo() {
    setBEnviando(true)
    try {
      await crearBloqueo({ perfil_id: sesion.perfil_id, fecha, hora_inicio: `${String(bIni).padStart(2, '0')}:00`, hora_fin: `${String(bFin).padStart(2, '0')}:00`, motivo: bMotivo.trim() || undefined })
      setHoja(null); setBMotivo(''); cargar()
    } catch (e: any) { Alert.alert('No se pudo bloquear', e.message ?? 'Intenta de nuevo.') }
    finally { setBEnviando(false) }
  }

  useEffect(() => {
    cargar()
    let subCola: any, subCitas: any, subBloq: any
    getSesion().then(ss => {
      if (!ss?.perfil_id) return
      subCola = suscribirCola(ss.negocio_id!, () => cargar())
      subCitas = suscribirCitas(ss.perfil_id!, fecha, () => cargar())
      // La silla ocupada por un cliente sin cita es un bloqueo: sin esta
      // suscripción la tarjeta no salía hasta refrescar a mano.
      subBloq = suscribirBloqueos(ss.perfil_id!, () => cargar())
    })
    return () => {
      if (subCola) desuscribir(subCola)
      if (subCitas) desuscribir(subCitas)
      if (subBloq) desuscribir(subBloq)
    }
  }, [cargar, fecha])

  // La silla se libera sola al pasar la hora: sin este tic la tarjeta se
  // quedaba clavada hasta que el barbero tocaba algo.
  useEffect(() => {
    const t = setInterval(() => setTic(x => x + 1), 30000)
    return () => clearInterval(t)
  }, [])

  // Ficha del cliente llamado (preferencias + nota privada del barbero).
  const llamadoClienteId = cola.find(c => c.estado === 'llamado' || c.estado === 'en_camino' || c.estado === 'atendiendo')?.cliente_id
  useEffect(() => {
    if (!llamadoClienteId || !sesion?.negocio_id) { setFicha(null); setVale(null); return }
    Promise.all([
      getPreferenciasCliente(llamadoClienteId, sesion.negocio_id).catch(() => null),
      sesion?.usuario_id ? getNotaBarbero(sesion.usuario_id, llamadoClienteId).catch(() => '') : Promise.resolve(''),
      getCanjeActivoCliente(llamadoClienteId, sesion.negocio_id).catch(() => null),
    ]).then(([p, nota, v]) => { setFicha({ ...(p || {}), nota }); setVale(v) })
  }, [llamadoClienteId, sesion?.negocio_id, sesion?.usuario_id])

  async function aplicarVale() {
    if (!vale) return
    try { await aplicarCanje(vale.id); setVale(null); Alert.alert('Vale aplicado', 'El premio se descontó del cobro.') }
    catch (e: any) { Alert.alert('Error', e.message ?? 'Intenta de nuevo.') }
  }

  function avisarLlamado(r: any) {
    if (r?.cliente_id) enviarPush(r.cliente_id, 'Es tu turno', `Acércate a ${negocio?.nombre ?? 'el local'}, ya casi te toca.`, { tipo: 'turno' })
  }

  async function llamar() {
    try {
      const r = await llamarSiguiente(sesion.negocio_id, sesion.perfil_id)
      if (!r) Alert.alert('Sin cola', 'Nadie esperando o hay una cita confirmada en curso.')
      else avisarLlamado(r)
      cargar()
    } catch (e: any) { Alert.alert('No se pudo llamar', e.message ?? 'Intenta de nuevo.') }
  }

  // ── Gestión de la fila ────────────────────────────────────────
  async function op(fn: () => Promise<any>, err = 'No se pudo') {
    setHoja(null)
    try { await fn(); cargar() } catch (e: any) { Alert.alert(err, e.message ?? 'Intenta de nuevo.') }
  }
  function empezarCorte(item: any) {
    Alert.alert('Empezar', `¿Sentar a ${item.turno_usuarios?.nombre ?? 'este cliente'} en la silla?`, [
      { text: 'No' },
      { text: 'Sí, empezar', onPress: () => op(() => iniciarAtencion(item.id)) },
    ])
  }
  function atenderCola(item: any) {
    Alert.alert('Atender', `¿Marcar a ${item.turno_usuarios?.nombre ?? 'cliente'} como atendido?`, [
      { text: 'No' },
      { text: 'Sí', onPress: () => op(async () => {
        await actualizarEstadoCola(item.id, 'atendido', { atendido_at: new Date().toISOString() })
        // El cliente se quedaba sin saber que su turno había terminado: su
        // pantalla seguía diciendo "te están atendiendo" hasta que la cerraba.
        if (item.cliente_id) {
          enviarPush(item.cliente_id, 'Listo ✂️',
            `Gracias por tu visita a ${negocio?.nombre ?? 'la barbería'}. Cuéntanos qué tal.`,
            { tipo: 'atendido' })
        }
      }) },
    ])
  }
  function accionCita(c: any) {
    const opts: any[] = [{ text: 'Cerrar', style: 'cancel' }]
    if (c.estado === 'confirmada' || c.estado === 'en_camino') opts.unshift({ text: 'Marcar atendida', onPress: async () => { await actualizarEstadoCita(c.id, 'atendida', { atendida_at: new Date().toISOString() }); cargar() } })
    if (c.estado === 'creada') opts.unshift({ text: 'Marcar no llegó', style: 'destructive', onPress: async () => { await actualizarEstadoCita(c.id, 'no_llego'); cargar() } })
    if (c.turno_usuarios?.telefono) opts.unshift({ text: 'Recordar por WhatsApp', onPress: () => recordarCita(c.turno_usuarios.telefono, c.turno_usuarios?.nombre ?? 'cliente', c.hora_inicio, negocio?.nombre ?? 'tu barbería') })
    Alert.alert(c.turno_usuarios?.nombre ?? 'Cita', `${c.turno_servicios?.nombre} · ${hora12(c.hora_inicio)}`, opts)
  }
  function quitarBloqueo(b: any) {
    Alert.alert(b.motivo || 'Bloqueo', `${hora12(b.hora_inicio)} – ${hora12(b.hora_fin)}`, [
      { text: 'Cerrar', style: 'cancel' },
      { text: 'Liberar esta hora', style: 'destructive', onPress: () => op(() => borrarBloqueo(b.id), 'No se pudo liberar') },
    ])
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={COLORS.red} size="large" /></View>

  const n1 = cola.filter(c => c.prioridad === 1).length
  const n2 = cola.filter(c => c.prioridad === 2).length
  const n3 = cola.filter(c => c.prioridad === 3).length
  const llamado = cola.find(c => c.estado === 'llamado' || c.estado === 'en_camino' || c.estado === 'atendiendo')
  const enFila = cola.filter(c => c.estado === 'en_fila')
  const badgeCita = (e: string) => e === 'confirmada' ? 'success' : e === 'no_llego' || e === 'no_confirmada' ? 'red' : e === 'en_camino' ? 'blue' : 'gray'
  const ahora = horaAhora()   // recalculado en cada tic
  // Tolerancia de 2 min al inicio: el bloqueo lo sella el servidor con la hora
  // del local, y el reloj del teléfono puede ir unos segundos por detrás. Sin
  // ella, la silla recién ocupada no se reconocía como vigente.
  const ocupado = esHoy
    ? bloqueos.find(b => b.hora_inicio <= sumarMinutos(ahora, 2) && b.hora_fin > ahora)
    : null
  // Los que se ven abajo son los bloqueos que NO están en curso: el vigente ya
  // se muestra arriba como estado, y repetirlo confundía.
  const bloqueosLista = bloqueos.filter(b => b.id !== ocupado?.id)
  const dias = Array.from({ length: DIAS_ADELANTE + 2 }, (_, i) => sumarDias(hoy, i - 1))

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: 72, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar() }} />}>
      <PanelBadge />
      <Text style={s.kicker}>{fechaLarga(fechaDeISO(fecha))}</Text>
      <Display size={30} style={{ marginBottom: 16 }}>{titulo}</Display>

      {usuario?.codigo_barbero ? (
        <View style={s.codigoCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.codigoLbl}>TU CÓDIGO DE BARBERO</Text>
            <Text style={s.codigoVal}>{usuario.codigo_barbero}</Text>
          </View>
          <TouchableOpacity style={s.codigoShare} onPress={() => Share.share({ message: `Reserva conmigo en Turno con mi código de barbero ${usuario.codigo_barbero}` })}>
            <Ionicons name="share-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Selector de día: la agenda no es solo hoy. El puntito marca los días
          que ya tienen citas, para no ir a ciegas uno por uno. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.diasWrap} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
        {dias.map(d => {
          const on = d === fecha
          const dd = fechaDeISO(d)
          return (
            <TouchableOpacity key={d} style={[s.dia, on && s.diaOn]} onPress={() => setFecha(d)}>
              <Text style={[s.diaSem, on && s.diaTxtOn]}>{d === hoy ? 'HOY' : dd.toLocaleDateString('es', { weekday: 'short' }).slice(0, 3).toUpperCase()}</Text>
              <Text style={[s.diaNum, on && s.diaTxtOn]}>{dd.getDate()}</Text>
              <View style={[s.diaDot, conteo[d] ? (on ? s.diaDotOn : s.diaDotHay) : null]} />
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {!esHoy && (
        <View style={s.avisoDia}>
          <Ionicons name="calendar-outline" size={16} color={COLORS.textMid} />
          <Text style={s.avisoDiaT}>Estás viendo otro día. La fila en vivo es solo de hoy.</Text>
        </View>
      )}

      {esHoy && (
        <>
          {/* Estado real: 'atendiendo' se deduce de la silla y los bloqueos.
              Lo único que se decide a mano es si aceptas clientes, y eso vive
              en el interruptor de abajo. */}
          {estado && (
            <View style={[s.estadoBox, EST_FONDO[estado.estado] ? { backgroundColor: EST_FONDO[estado.estado] } : null]}>
              <View style={s.estadoPunto} />
              <View style={{ flex: 1 }}>
                <Text style={s.estadoT}>
                  {estado.estado === 'atendiendo'
                    ? (estado.cliente ? `Atendiendo a ${estado.cliente}` : 'Silla ocupada')
                    : estado.estado === 'descanso' ? 'En descanso'
                    : estado.estado === 'inactivo' ? 'Inactivo'
                    : 'Libre'}
                </Text>
                <Text style={s.estadoD}>
                  {estado.estado === 'atendiendo' && estado.hasta ? `Hasta ${hora12(estado.hasta)} · ` : ''}
                  {estado.en_cola === 0 ? 'Nadie esperando' : `${estado.en_cola} esperando`}
                  {!estado.acepta ? ' · no apareces para los clientes' : ''}
                </Text>
              </View>
              <TouchableOpacity style={s.estadoBtn}
                onPress={() => op(() => actualizarEstadoPerfil(sesion.perfil_id, estado.acepta ? 'descanso' : 'disponible'))}>
                <Text style={s.estadoBtnT}>{estado.acepta ? 'Pausar' : 'Volver'}</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={s.colaBox}>
            <Text style={s.colaTitle}>COLA AHORA</Text>
            <View style={s.colaStats}>
              <Grupo n={n1} l="Prioritario" />
              <Grupo n={n2} l="Digital" />
              <Grupo n={n3} l="Físico" />
              <Grupo n={cola.length} l="Total" hl />
            </View>
          </View>

          {ocupado && (
            <View style={s.ocupado}>
              <Ionicons name="cut" size={18} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={s.ocupadoLbl}>SILLA OCUPADA · {ocupado.motivo || 'bloqueo'}</Text>
                <Text style={s.ocupadoT}>Hasta {hora12(ocupado.hora_fin)}</Text>
              </View>
              <TouchableOpacity style={s.ocupadoBtn} onPress={() => op(() => liberarAhora(ocupado.id), 'No se pudo liberar')}>
                <Text style={s.ocupadoBtnT}>Terminé</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* El barbero pulsa Empezar y se olvida de Terminar: el cliente se
              queda "en la silla" horas y R1 no le deja pedir otro turno.
              Encontrado en la base con un caso de 2 h 30 min. */}
          {llamado?.estado === 'atendiendo' && minutosEnSilla(llamado) > Math.max(45, (llamado.turno_servicios?.duracion_min ?? 30) * 2) && (
            <TouchableOpacity style={s.olvido} onPress={() => atenderCola(llamado)}>
              <Ionicons name="alarm-outline" size={18} color="#fff" />
              <Text style={s.olvidoT}>
                Llevas {minutosEnSilla(llamado)} min con {llamado.turno_usuarios?.nombre ?? 'este cliente'}. ¿Ya terminaste?
              </Text>
            </TouchableOpacity>
          )}

          {llamado && (
            <View style={s.llamado}>
              <View style={{ flex: 1 }}>
                <Text style={s.llamadoLbl}>{llamado.estado === 'atendiendo' ? 'EN LA SILLA' : llamado.estado === 'en_camino' ? 'EN CAMINO' : 'LLAMADO'}</Text>
                <Text style={s.llamadoName}>{llamado.turno_usuarios?.nombre ?? 'Cliente'}</Text>
                <Text style={s.llamadoServ}>{llamado.turno_servicios?.nombre}</Text>
              </View>
              <View style={{ gap: 6, alignItems: 'flex-end' }}>
                {llamado.estado === 'atendiendo'
                  ? <TouchableOpacity style={s.atenderBtn} onPress={() => atenderCola(llamado)}><Text style={s.atenderT}>Terminar</Text></TouchableOpacity>
                  : <TouchableOpacity style={s.atenderBtn} onPress={() => empezarCorte(llamado)}><Text style={s.atenderT}>Empezar</Text></TouchableOpacity>}
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {llamado.turno_usuarios?.telefono ? (
                    <TouchableOpacity style={s.avisarBtn} onPress={() => avisarTurno(llamado.turno_usuarios.telefono, llamado.turno_usuarios?.nombre ?? 'cliente', negocio?.nombre ?? 'el local')}>
                      <Ionicons name="logo-whatsapp" size={14} color="#fff" /><Text style={s.avisarT}>Avisar</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity style={s.masBtn} onPress={() => setHoja({ tipo: 'acciones', item: llamado })}>
                    <Ionicons name="ellipsis-horizontal" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {llamado && vale && (
            <TouchableOpacity style={s.valeBar} onPress={aplicarVale}>
              <Ionicons name="ticket" size={18} color="#fff" />
              <Text style={s.valeBarT}>Tiene un vale de premio · toca para aplicarlo al cobro</Text>
            </TouchableOpacity>
          )}

          {llamado && ficha && (ficha.tipo_corte || ficha.largo || ficha.barba || ficha.alergias || ficha.notas || ficha.nota) && (
            <View style={s.ficha}>
              <Text style={s.fichaTitle}>FICHA DEL CLIENTE</Text>
              <View style={s.fichaChips}>
                {ficha.tipo_corte ? <FichaChip l="Corte" v={ficha.tipo_corte} /> : null}
                {ficha.largo ? <FichaChip l="Largo" v={ficha.largo} /> : null}
                {ficha.barba ? <FichaChip l="Barba" v={ficha.barba} /> : null}
              </View>
              {ficha.alergias ? <Text style={s.fichaAlerta}>⚠ Alergias: {ficha.alergias}</Text> : null}
              {ficha.notas ? <Text style={s.fichaNota}>Cliente: “{ficha.notas}”</Text> : null}
              {ficha.nota ? <Text style={s.fichaNotaPriv}>Tu nota: {ficha.nota}</Text> : null}
            </View>
          )}

          {enFila.length > 0 && !llamado && (
            <TouchableOpacity style={s.siguiente} onPress={llamar}>
              <View>
                <Text style={s.sigLbl}>SIGUIENTE</Text>
                <Text style={s.sigName}>{enFila[0].turno_usuarios?.nombre ?? 'Cliente'}</Text>
                <Text style={s.sigServ}>{enFila[0].turno_servicios?.nombre}</Text>
              </View>
              <View style={s.llamarBtn}><Text style={s.llamarT}>Llamar</Text><Ionicons name="arrow-forward" size={18} color="#fff" /></View>
            </TouchableOpacity>
          )}

          {/* Siempre visible, aunque esté vacía: el barbero preguntó por "los
              próximos", y una sección que desaparece deja la duda de si no hay
              nadie o si la pantalla se rompió. */}
          <Text style={s.sec}>EN FILA · {enFila.length}</Text>
          {enFila.length === 0
            ? <Text style={s.empty}>Nadie esperando ahora mismo.</Text>
            : <Text style={s.secHint}>Toca a alguien para llamarlo antes, moverlo o sacarlo.</Text>}
          {enFila.length > 0 && (
            <>
              {(verTodos ? enFila : enFila.slice(0, 5)).map((q, i) => (
                <TouchableOpacity key={q.id} style={s.row} onPress={() => setHoja({ tipo: 'acciones', item: q })}>
                  <View style={s.pos}><Text style={s.posT}>{i + 1}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowName}>{q.turno_usuarios?.nombre ?? 'Cliente'}</Text>
                    <Text style={s.rowServ}>{q.turno_servicios?.nombre} · {q.prioridad === 3 ? 'Físico' : 'Digital'}</Text>
                  </View>
                  <Ionicons name="ellipsis-vertical" size={18} color={COLORS.textLight} />
                </TouchableOpacity>
              ))}
              {enFila.length > 5 && (
                <TouchableOpacity onPress={() => setVerTodos(v => !v)}>
                  <Text style={s.verTodos}>
                    {verTodos ? 'Ver solo los próximos 5' : `Ver los ${enFila.length} de la fila`}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </>
      )}

      <Text style={s.sec}>{esHoy ? 'CITAS DE HOY' : `CITAS · ${fechaDeISO(fecha).toLocaleDateString('es', { day: 'numeric', month: 'long' })}`}</Text>
      {citas.length === 0 && <Text style={s.empty}>Sin citas este día</Text>}
      {citas.map((c: any) => (
        <TouchableOpacity key={c.id} style={s.row} onPress={() => accionCita(c)}>
          <Avatar name={c.turno_usuarios?.nombre} size={42} bg={COLORS.surfaceAlt} color={COLORS.ink} />
          <View style={{ flex: 1 }}>
            <Text style={s.rowName}>{c.turno_usuarios?.nombre ?? 'Cliente'}</Text>
            <Text style={s.rowServ}>{c.turno_servicios?.nombre} · {hora12(c.hora_inicio)}</Text>
          </View>
          <Badge tone={badgeCita(c.estado) as any}>{c.estado.replace('_', ' ')}</Badge>
        </TouchableOpacity>
      ))}

      {bloqueosLista.length > 0 && (
        <>
          <Text style={s.sec}>HORAS BLOQUEADAS</Text>
          {bloqueosLista.map((b: any) => (
            <TouchableOpacity key={b.id} style={s.rowBloq} onPress={() => quitarBloqueo(b)}>
              <Ionicons name="lock-closed" size={16} color={COLORS.textMid} />
              <View style={{ flex: 1 }}>
                <Text style={s.rowName}>{hora12(b.hora_inicio)} – {hora12(b.hora_fin)}</Text>
                <Text style={s.rowServ}>{b.motivo || 'Bloqueado'}</Text>
              </View>
              <Ionicons name="close-circle-outline" size={20} color={COLORS.textLight} />
            </TouchableOpacity>
          ))}
        </>
      )}

      {esHoy && (
        <TouchableOpacity style={s.walkin} onPress={() => setHoja({ tipo: 'servicios', modo: 'ocupar' })}>
          <Ionicons name="cut" size={18} color="#fff" /><Text style={s.walkinT}>Atender cliente sin cita</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={s.bloquear} onPress={() => setHoja({ tipo: 'bloqueo' })}>
        <Ionicons name="lock-closed-outline" size={16} color={COLORS.textMid} />
        <Text style={s.bloquearT}>Bloquear hora{esHoy ? '' : ' de este día'}</Text>
      </TouchableOpacity>

      {/* Una sola hoja para todo lo que se abre desde esta pantalla. */}
      <Modal visible={!!hoja} transparent animationType="slide" onRequestClose={() => setHoja(null)}>
        <View style={s.modalBg}>
          <View style={s.modal}>

            {hoja?.tipo === 'acciones' && (() => {
              const it = hoja.item
              const enEspera = it.estado === 'en_fila'
              return (
                <>
                  <Display size={22}>{it.turno_usuarios?.nombre ?? 'Turno'}</Display>
                  <Text style={s.modalSub}>{it.turno_servicios?.nombre}{enEspera ? '' : ` · ${String(it.estado).replace('_', ' ')}`}</Text>
                  {enEspera ? (
                    <>
                      {!llamado && <Opcion icon="megaphone-outline" t="Llamarlo ahora" d="Se salta el orden" onPress={() => op(async () => { const r = await llamarA(it.id); avisarLlamado(r) }, 'No se pudo llamar')} />}
                      <Opcion icon="arrow-up" t="Subir un puesto" onPress={() => op(() => moverEnCola(it.id, -1), 'No se pudo mover')} />
                      <Opcion icon="arrow-down" t="Bajar un puesto" onPress={() => op(() => moverEnCola(it.id, 1), 'No se pudo mover')} />
                    </>
                  ) : (
                    <Opcion icon="return-down-back" t="Devolver a la fila" d="Deshace el llamado y conserva su puesto" onPress={() => op(() => devolverAFila(it.id), 'No se pudo devolver')} />
                  )}
                  <Opcion icon="swap-horizontal" t="Cambiar servicio" d="Pidió otra cosa" onPress={() => setHoja({ tipo: 'servicios', modo: 'cambiar', item: it })} />
                  <Opcion icon="exit-outline" t="Sacar de la fila" d="Se fue del local o no apareció" rojo onPress={() => setHoja({ tipo: 'sacar', item: it })} />
                  <TouchableOpacity onPress={() => setHoja(null)}><Text style={s.modalCerrar}>Cerrar</Text></TouchableOpacity>
                </>
              )
            })()}

            {hoja?.tipo === 'sacar' && (
              <>
                <Display size={22}>¿Sacarlo de la fila?</Display>
                <Text style={s.modalSub}>
                  {hoja.item.turno_usuarios?.nombre ?? 'Este cliente'} deja de estar en la fila y los demás suben.
                  Si es un cliente de la app, su turno se cierra y podrá volver a entrar cuando quiera.
                </Text>
                <TouchableOpacity style={s.peligroBtn} onPress={() => op(() => sacarDeCola(hoja.item.id), 'No se pudo sacar')}>
                  <Text style={s.peligroT}>Sí, sacarlo</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setHoja({ tipo: 'acciones', item: hoja.item })}><Text style={s.modalCerrar}>Volver</Text></TouchableOpacity>
              </>
            )}

            {hoja?.tipo === 'servicios' && (
              <>
                <Display size={22}>{hoja.modo === 'cambiar' ? 'Cambiar servicio' : 'Cliente sin cita'}</Display>
                <Text style={s.modalSub}>
                  {hoja.modo === 'cambiar'
                    ? 'El turno pasa a este servicio: cambian la duración y el cobro.'
                    : 'Toca el servicio y tu silla queda ocupada ese tiempo. Nadie podrá reservarte encima y la cola digital contará esa espera.'}
                </Text>
                {wEnviando ? <ActivityIndicator color={COLORS.red} style={{ marginVertical: 24 }} /> : servicios.length === 0
                  ? <Text style={s.empty}>Primero crea un servicio en tu configuración.</Text>
                  : servicios.map((sv: any) => (
                      <TouchableOpacity key={sv.id} style={s.wServ}
                        onPress={() => hoja.modo === 'cambiar' ? cambiarServicio((hoja as any).item, sv) : ocuparSilla(sv)}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.wServN}>{sv.nombre}</Text>
                          <Text style={s.wServD}>{sv.duracion_min} min</Text>
                        </View>
                        <Ionicons name={hoja.modo === 'cambiar' ? 'swap-horizontal' : 'time-outline'} size={28} color={COLORS.red} />
                      </TouchableOpacity>
                    ))}
                <TouchableOpacity onPress={() => setHoja(null)}><Text style={s.modalCerrar}>Cancelar</Text></TouchableOpacity>
              </>
            )}

            {hoja?.tipo === 'bloqueo' && (
              <>
                <Display size={22}>Bloquear hora</Display>
                <Text style={s.modalSub}>{fechaLarga(fechaDeISO(fecha))}. Ese rango no se ofrecerá para citas.</Text>
                <Text style={s.flabel}>Desde</Text>
                <View style={s.stepRow}>
                  <TouchableOpacity style={s.stepBtn} onPress={() => setBIni(Math.max(0, bIni - 1))}><Text style={s.stepT}>−</Text></TouchableOpacity>
                  <Text style={s.stepVal}>{hora12(`${String(bIni).padStart(2, '0')}:00`)}</Text>
                  <TouchableOpacity style={s.stepBtn} onPress={() => setBIni(Math.min(23, bIni + 1))}><Text style={s.stepT}>+</Text></TouchableOpacity>
                </View>
                <Text style={s.flabel}>Hasta</Text>
                <View style={s.stepRow}>
                  <TouchableOpacity style={s.stepBtn} onPress={() => setBFin(Math.max(bIni + 1, bFin - 1))}><Text style={s.stepT}>−</Text></TouchableOpacity>
                  <Text style={s.stepVal}>{hora12(`${String(bFin).padStart(2, '0')}:00`)}</Text>
                  <TouchableOpacity style={s.stepBtn} onPress={() => setBFin(Math.min(24, bFin + 1))}><Text style={s.stepT}>+</Text></TouchableOpacity>
                </View>
                <Text style={s.flabel}>Motivo (opcional)</Text>
                <TextInput style={s.input} placeholder="Almuerzo, descanso…" placeholderTextColor={COLORS.textLight} value={bMotivo} onChangeText={setBMotivo} />
                <TouchableOpacity style={s.modalBtn} onPress={guardarBloqueo} disabled={bEnviando}>{bEnviando ? <ActivityIndicator color="#fff" /> : <Text style={s.modalBtnT}>Bloquear</Text>}</TouchableOpacity>
                <TouchableOpacity onPress={() => setHoja(null)}><Text style={s.modalCerrar}>Cancelar</Text></TouchableOpacity>
              </>
            )}

          </View>
        </View>
      </Modal>

    </ScrollView>
  )
}

function Opcion({ icon, t, d, rojo, onPress }: { icon: any; t: string; d?: string; rojo?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={op.row} onPress={onPress}>
      <Ionicons name={icon} size={20} color={rojo ? COLORS.red : COLORS.ink} />
      <View style={{ flex: 1 }}>
        <Text style={[op.t, rojo && { color: COLORS.red }]}>{t}</Text>
        {d ? <Text style={op.d}>{d}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
    </TouchableOpacity>
  )
}
const op = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 15, marginBottom: 8 },
  t: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  d: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
})

function FichaChip({ l, v }: { l: string; v: string }) {
  return (
    <View style={fc.chip}>
      <Text style={fc.l}>{l}</Text>
      <Text style={fc.v}>{v}</Text>
    </View>
  )
}
const fc = StyleSheet.create({
  chip: { backgroundColor: COLORS.surfaceAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  l: { fontFamily: FONTS.semibold, fontSize: 10, color: COLORS.textLight, textTransform: 'uppercase' },
  v: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.ink, marginTop: 1 },
})

function Grupo({ n, l, hl }: { n: number; l: string; hl?: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={[gs.num, hl && { color: COLORS.red }]}>{n}</Text>
      <Text style={gs.lbl}>{l}</Text>
    </View>
  )
}
const gs = StyleSheet.create({
  num: { fontFamily: FONTS.display, fontSize: 30, color: '#fff' },
  lbl: { fontFamily: FONTS.medium, fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
})

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  kicker: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textLight, textTransform: 'capitalize', marginBottom: 4 },
  codigoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.carbon, borderRadius: 14, padding: 14, marginBottom: 14 },
  codigoLbl: { fontFamily: FONTS.bold, fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 },
  codigoVal: { fontFamily: FONTS.display, fontSize: 26, color: '#fff', letterSpacing: 3, marginTop: 2 },
  codigoShare: { width: 40, height: 40, borderRadius: 11, backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center' },
  diasWrap: { marginBottom: 14 },
  dia: { width: 54, alignItems: 'center', paddingVertical: 9, borderRadius: 13, backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border },
  diaOn: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  diaSem: { fontFamily: FONTS.bold, fontSize: 10, color: COLORS.textLight, letterSpacing: 0.5 },
  diaNum: { fontFamily: FONTS.display, fontSize: 20, color: COLORS.ink, marginTop: 1 },
  diaTxtOn: { color: '#fff' },
  diaDot: { width: 5, height: 5, borderRadius: 3, marginTop: 4, backgroundColor: 'transparent' },
  diaDotHay: { backgroundColor: COLORS.red },
  diaDotOn: { backgroundColor: '#fff' },
  avisoDia: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surfaceAlt, borderRadius: 12, padding: 12, marginBottom: 14 },
  avisoDiaT: { flex: 1, fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textMid },
  valeBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.red, borderRadius: 12, padding: 13, marginTop: -6, marginBottom: 14 },
  valeBarT: { flex: 1, fontFamily: FONTS.bold, fontSize: 13, color: '#fff' },
  estadoBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 14, marginBottom: 12 },
  estadoPunto: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.9)' },
  estadoT: { fontFamily: FONTS.extrabold, fontSize: 16, color: '#fff' },
  estadoD: { fontFamily: FONTS.medium, fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  estadoBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  estadoBtnT: { fontFamily: FONTS.bold, fontSize: 13, color: '#fff' },
  colaBox: { backgroundColor: COLORS.carbon, borderRadius: 16, padding: 18, marginBottom: 14 },
  colaTitle: { fontFamily: FONTS.bold, fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, marginBottom: 14 },
  colaStats: { flexDirection: 'row', justifyContent: 'space-between' },
  ocupado: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.blue, borderRadius: 14, padding: 14, marginBottom: 14 },
  ocupadoLbl: { fontFamily: FONTS.bold, fontSize: 10, color: 'rgba(255,255,255,0.75)', letterSpacing: 1 },
  ocupadoT: { fontFamily: FONTS.extrabold, fontSize: 16, color: '#fff', marginTop: 2 },
  ocupadoBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  ocupadoBtnT: { fontFamily: FONTS.bold, fontSize: 13, color: '#fff' },
  olvido: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.red, borderRadius: 12, padding: 13, marginBottom: 10 },
  olvidoT: { flex: 1, fontFamily: FONTS.bold, fontSize: 13, color: '#fff' },
  llamado: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.success, borderRadius: 14, padding: 16, marginBottom: 14 },
  llamadoLbl: { fontFamily: FONTS.bold, fontSize: 11, color: 'rgba(255,255,255,0.85)', letterSpacing: 1 },
  llamadoName: { fontFamily: FONTS.extrabold, fontSize: 18, color: '#fff', marginTop: 4 },
  llamadoServ: { fontFamily: FONTS.medium, fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  atenderBtn: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  atenderT: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.success },
  avisarBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7 },
  avisarT: { fontFamily: FONTS.bold, fontSize: 12, color: '#fff' },
  masBtn: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7, justifyContent: 'center' },
  ficha: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, marginTop: -6, marginBottom: 14 },
  fichaTitle: { fontFamily: FONTS.bold, fontSize: 10, color: COLORS.textLight, letterSpacing: 1, marginBottom: 10 },
  fichaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fichaAlerta: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.red, marginTop: 10 },
  fichaNota: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textMid, marginTop: 8, fontStyle: 'italic' },
  fichaNotaPriv: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textMid, marginTop: 6 },
  siguiente: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.red, borderRadius: 14, padding: 16, marginBottom: 16 },
  sigLbl: { fontFamily: FONTS.bold, fontSize: 11, color: 'rgba(255,255,255,0.85)', letterSpacing: 1 },
  sigName: { fontFamily: FONTS.extrabold, fontSize: 18, color: '#fff', marginTop: 4 },
  sigServ: { fontFamily: FONTS.medium, fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  llamarBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.18)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  llamarT: { fontFamily: FONTS.bold, fontSize: 14, color: '#fff' },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginTop: 8, marginBottom: 12 },
  verTodos: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.red, textAlign: 'center', paddingVertical: 10 },
  secHint: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: -8, marginBottom: 10 },
  empty: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, textAlign: 'center', paddingVertical: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, marginBottom: 8 },
  rowBloq: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, marginBottom: 8 },
  pos: { width: 42, height: 42, borderRadius: 12, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  posT: { fontFamily: FONTS.display, fontSize: 18, color: COLORS.ink },
  rowName: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  rowServ: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  walkin: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: COLORS.carbon, borderRadius: 14, padding: 15, marginTop: 10 },
  walkinT: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
  bloquear: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 14, padding: 13, marginTop: 8 },
  bloquearT: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.textMid },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 8 },
  stepBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  stepT: { fontFamily: FONTS.bold, fontSize: 22, color: COLORS.ink },
  stepVal: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.ink },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: COLORS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalSub: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textLight, marginTop: 6, marginBottom: 16 },
  flabel: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textMid, marginBottom: 7, marginTop: 4 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, padding: 14, fontSize: 15, fontFamily: FONTS.medium, color: COLORS.ink, marginBottom: 10 },
  modalBtn: { backgroundColor: COLORS.red, borderRadius: 14, padding: 16, alignItems: 'center' },
  peligroBtn: { backgroundColor: COLORS.red, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 4 },
  peligroT: { fontFamily: FONTS.bold, fontSize: 16, color: '#fff' },
  modalBtnT: { fontFamily: FONTS.bold, fontSize: 16, color: '#fff' },
  wServ: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 14, padding: 16, marginBottom: 10 },
  wServN: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.ink },
  wServD: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  modalCerrar: { fontFamily: FONTS.semibold, textAlign: 'center', color: COLORS.textLight, fontSize: 14, marginTop: 14 },
})
