import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert, Modal, TextInput, Share } from 'react-native'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import {
  getCitasFecha, getCitasSinCerrar, getConteoCitasRango, getBloqueosFecha, borrarBloqueo, getColaActiva, llamarSiguiente,
  actualizarEstadoCola, actualizarEstadoCita, getServiciosPerfil, crearBloqueo, getNegocioById,
  getPreferenciasCliente, getNotaBarbero, getMiUsuario, getCanjeActivoCliente, aplicarCanje, iniciarAtencion,
  sacarDeCola, devolverAFila, cambiarServicioCola, atenderSinCita, liberarAhora, marcarNoEsta, sustituirAusente, avisosDeEspera, darMasTiempo,
  getEstadoBarbero, actualizarEstadoPerfil, getFidelidad, getTarjetaCliente, getBarberoNegocios,
} from '../lib/db'
import { hora12, fechaLarga, fechaISOLocal, fechaDeISO, sumarDias } from '../lib/format'
import { avisarTurno, recordarCita } from '../lib/whatsapp'
import { enviarPush, avisos } from '../lib/notificaciones'
import { suscribirCola, suscribirCitas, suscribirBloqueos, desuscribir } from '../lib/realtime'
import { getSesion, guardarSesion } from '../lib/storage'
import { COLORS, FONTS } from '../constants'
import { Display, Avatar, Badge, PuntoVivo } from './ui'
import PanelBadge from './panel-badge'

const EST_FONDO: Record<string, string> = {
  libre: COLORS.success, atendiendo: COLORS.blue, descanso: COLORS.warning, inactivo: COLORS.textLight,
}

/** Cuántos días hacia adelante ofrece el selector (más ayer, para repasar). */
const DIAS_ADELANTE = 20

/** Una cita sigue ABIERTA mientras nadie diga cómo acabó. Los cuatro estados
 *  son los mismos que mira turno_cerrar_citas_viejas; escritos en dos sitios,
 *  se corrigen en uno. */
const ABIERTAS = ['creada', 'confirmada', 'no_confirmada', 'en_camino']


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
export default function AgendaTrabajo({ titulo }: { titulo?: string }) {
  const [citas, setCitas] = useState<any[]>([])
  // Citas de días pasados que nadie cerró. Ver getCitasSinCerrar.
  const [sinCerrar, setSinCerrar] = useState<any[]>([])
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
  const router = useRouter()
  const [verTodos, setVerTodos] = useState(false)
  const [estado, setEstado] = useState<any>(null)
  const esHoy = fecha === hoy
  // Los locales donde trabaja. Con uno solo es una línea informativa; con
  // varios, el selector — antes había que salir a Configuración > Mis locales
  // para cambiar de sitio, que es un viaje raro para algo que se hace al llegar
  // por la mañana.
  const [locales, setLocales] = useState<any[]>([])
  const [localModal, setLocalModal] = useState(false)

  const cargar = useCallback(async () => {
    const ss = await getSesion(); setSesion(ss)
    if (!ss?.perfil_id) { setLoading(false); return }
    const [c, q, sv, neg, u, cnt, bl, est, sc] = await Promise.all([
      getCitasFecha(ss.perfil_id, fecha),
      getColaActiva(ss.negocio_id!, ss.perfil_id),
      getServiciosPerfil(ss.perfil_id).catch(() => []),
      getNegocioById(ss.negocio_id!).catch(() => null),
      getMiUsuario().catch(() => null),
      getConteoCitasRango(ss.perfil_id, sumarDias(hoy, -1), sumarDias(hoy, DIAS_ADELANTE)).catch(() => ({})),
      getBloqueosFecha(ss.perfil_id, fecha).catch(() => []),
      getEstadoBarbero(ss.perfil_id).catch(() => null),
      getCitasSinCerrar(ss.perfil_id).catch(() => []),
    ])
    setCitas(c as any[]); setCola(q as any[]); setServicios(sv as any[]); setNegocio(neg)
    setUsuario(u); setConteo(cnt as any); setBloqueos(bl as any[]); setEstado(est)
    setSinCerrar(sc as any[])
    setLoading(false); setRefreshing(false)
    // Aparte y sin bloquear: solo decide si la cabecera enseña un selector o
    // una línea. Que tarde no debe retrasar la fila.
    if (ss.usuario_id) getBarberoNegocios(ss.usuario_id).then(setLocales).catch(() => {})
  }, [fecha, hoy])

  async function cambiarLocal(l: any) {
    const ss = await getSesion()
    if (!ss || l.negocio_id === ss.negocio_id) { setLocalModal(false); return }
    await guardarSesion({ ...ss, negocio_id: l.negocio_id, perfil_id: l.perfil_id })
    setLocalModal(false); setLoading(true); setFecha(hoy); cargar()
  }

  /**
   * FLUIDEZ. `cargar()` son OCHO peticiones, una de ellas barriendo 22 días de
   * citas para pintar los puntitos del selector de día. Se disparaba después de
   * cada acción Y otra vez cuando llegaba el evento de realtime de esa misma
   * acción: unas diecisiete idas y vueltas al servidor por un solo toque. En
   * datos móviles eso son varios segundos, y es exactamente el "tarda un rato en
   * aparecer" que se reportó al ocupar la silla.
   *
   * Lo que cambia mientras trabajas son cuatro cosas. Los servicios, el negocio,
   * el usuario y el conteo del mes no cambian porque alguien entre a la fila.
   */
  const cargarVivo = useCallback(async () => {
    const ss = await getSesion()
    if (!ss?.perfil_id) return
    const [c, q, bl, est, sc] = await Promise.all([
      getCitasFecha(ss.perfil_id, fecha),
      getColaActiva(ss.negocio_id!, ss.perfil_id),
      getBloqueosFecha(ss.perfil_id, fecha).catch(() => []),
      getEstadoBarbero(ss.perfil_id).catch(() => null),
      // Va también aquí porque cerrar una de ellas es una acción como otra
      // cualquiera: si no se recarga, la que acabas de cerrar sigue en la lista.
      getCitasSinCerrar(ss.perfil_id).catch(() => []),
    ])
    setCitas(c as any[]); setCola(q as any[]); setBloqueos(bl as any[]); setEstado(est)
    setSinCerrar(sc as any[])
  }, [fecha])

  /**
   * Tres suscripciones de realtime llamaban cada una a la recarga completa. Una
   * sola acción dispara eventos en cola, citas y bloqueos casi a la vez, así que
   * se recargaba tres veces seguidas. Se agrupan en una.
   */
  const pendiente = useRef<any>(null)
  const refrescar = useCallback(() => {
    if (pendiente.current) clearTimeout(pendiente.current)
    pendiente.current = setTimeout(() => { pendiente.current = null; cargarVivo() }, 250)
  }, [cargarVivo])
  useEffect(() => () => { if (pendiente.current) clearTimeout(pendiente.current) }, [])

  /**
   * Sin cita: entra a la FILA y se sienta, igual que cualquiera.
   *
   * Antes ocupaba la silla con un bloqueo de agenda. Se veía mal —al terminar
   * quedaba ahí como si el barbero se hubiera cogido el rato libre— pero lo
   * caro estaba debajo: las visitas se registran cuando un turno de la cola
   * pasa a 'atendido', y por la vía del bloqueo ese corte no pasaba nunca por
   * la cola. No contaba como dinero, ni en estadísticas, ni sumaba punto.
   */
  function ocuparSilla(sv: any) {
    Alert.alert('Cliente sin cita', `¿Sentar a alguien ahora para ${sv.nombre} (${sv.duracion_min} min)?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sentar', onPress: async () => {
        setWEnviando(true)
        try {
          const q = await atenderSinCita({
            negocio_id: sesion.negocio_id, perfil_id: sesion.perfil_id, servicio_id: sv.id,
          })
          setHoja(null)
          // La RPC devuelve el turno ya sentado: se pinta sin esperar otra
          // vuelta al servidor.
          if (q) {
            setCola(prev => [...prev, { ...(q as any), turno_servicios: sv }])
            setEstado((e: any) => ({ ...(e ?? {}), estado: 'atendiendo' }))
          }
          refrescar()
        } catch (e: any) { Alert.alert('No se pudo', e.message ?? 'Intenta de nuevo.') }
        finally { setWEnviando(false) }
      } },
    ])
  }

  async function cambiarServicio(item: any, sv: any) {
    setWEnviando(true)
    try { await cambiarServicioCola(item.id, sv.id); setHoja(null); refrescar() }
    catch (e: any) { Alert.alert('No se pudo cambiar', e.message ?? 'Intenta de nuevo.') }
    finally { setWEnviando(false) }
  }

  async function guardarBloqueo() {
    setBEnviando(true)
    try {
      await crearBloqueo({ perfil_id: sesion.perfil_id, fecha, hora_inicio: `${String(bIni).padStart(2, '0')}:00`, hora_fin: `${String(bFin).padStart(2, '0')}:00`, motivo: bMotivo.trim() || undefined })
      setHoja(null); setBMotivo(''); refrescar()
    } catch (e: any) { Alert.alert('No se pudo bloquear', e.message ?? 'Intenta de nuevo.') }
    finally { setBEnviando(false) }
  }

  useEffect(() => {
    cargar()
    let subCola: any, subCitas: any, subBloq: any
    getSesion().then(ss => {
      if (!ss?.perfil_id) return
      subCola = suscribirCola(ss.negocio_id!, () => refrescar())
      subCitas = suscribirCitas(ss.perfil_id!, fecha, () => refrescar())
      // La silla ocupada por un cliente sin cita es un bloqueo: sin esta
      // suscripción la tarjeta no salía hasta refrescar a mano.
      subBloq = suscribirBloqueos(ss.perfil_id!, () => refrescar())
    })
    return () => {
      if (subCola) desuscribir(subCola)
      if (subCitas) desuscribir(subCitas)
      if (subBloq) desuscribir(subBloq)
    }
  }, [cargar, refrescar, fecha])

  // La silla se libera sola al pasar la hora: sin este tic la tarjeta se
  // quedaba clavada hasta que el barbero tocaba algo.
  //
  // Late cada segundo SOLO mientras hay una cuenta atrás que pintar. Un
  // cronómetro que salta de treinta en treinta no es un cronómetro, y tenerlo
  // a un segundo todo el día es despertar la pantalla cada segundo para no
  // cambiar nada.
  const hayCuenta = cola.some(c => (c.estado === 'llamado' || c.estado === 'en_camino') && c.expira_at)
  useEffect(() => {
    const t = setInterval(() => setTic(x => x + 1), hayCuenta ? 1000 : 30000)
    return () => clearInterval(t)
  }, [hayCuenta])

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

  /**
   * "Es tu turno" con el reloj dentro. El aviso decía "acércate, ya casi te
   * toca" y no mencionaba que desde ese mismo segundo corre la ventana de
   * llegada: quien lo leía no tenía forma de saber si le sobraban dos minutos o
   * veinte. El número sale de `expira_at`, que es el mismo que ve el barbero en
   * su cuenta atrás, así que los dos miran el mismo reloj.
   */
  function avisarLlamado(r: any) {
    if (!r?.cliente_id) return
    const min = r.expira_at
      ? Math.max(1, Math.round((new Date(r.expira_at).getTime() - Date.now()) / 60000))
      : null
    if (min) avisos.clienteTuTurno(r.cliente_id, negocio?.nombre ?? 'el local', min)
    else enviarPush(r.cliente_id, '¡Es tu turno! 💈', `Te esperan en ${negocio?.nombre ?? 'el local'}.`, { tipo: 'turno' })
  }

  /** R2 pedía este aviso desde el principio y nunca se construyó: al llamar a
   *  alguien, el que pasa a ser siguiente se entera de que le toca pronto. Se
   *  calcula ANTES de recargar para no depender de una carrera de estados. */
  function avisarSiguiente() {
    const proximo = enFila[1]
    if (proximo?.cliente_id) avisos.clientePrepararse(proximo.cliente_id, negocio?.nombre ?? 'el local', 0)
  }

  /** Perder el turno no se deshace, así que se pregunta. El texto dice qué pasa
   *  después, que es lo que el barbero necesita saber para decidir. */
  /**
   * Llamaste a alguien y no está. Dos salidas, y la primera existe para no
   * castigar al que viene detrás:
   *
   * Si el siguiente de la fila tenía su turno dentro de 40 minutos, no ha
   * faltado a nada — todavía no le tocaba. Marcarlo ausente para llegar al que
   * sí está en el local le cobra a él que la fila corriera más rápido de lo
   * prometido. Por eso se mete al presente en el HUECO del ausente: hereda su
   * sitio y nadie por detrás se mueve.
   *
   * Solo se ofrecen los de la fila física: son los que el barbero registró con
   * la persona delante. Un turno pedido desde el teléfono no prueba que su dueño
   * esté aquí.
   */
  function confirmarNoEsta(item: any) {
    const nombre = item?.turno_usuarios?.nombre ?? 'Este cliente'
    const presentes = enFila.filter((q: any) => q.tipo_cola === 'fisica')
    const opciones: any[] = []

    for (const w of presentes.slice(0, 3)) {
      opciones.push({
        text: `Que pase ${w.turno_usuarios?.nombre ?? 'el que está aquí'}`,
        onPress: () => op(async () => {
          await sustituirAusente(item.id, w.id)
          if (w.cliente_id) avisos.clientePrepararse(w.cliente_id, negocio?.nombre ?? 'el local', 0)
        }, 'No se pudo'),
      })
    }
    opciones.push({
      text: presentes.length ? 'Nadie, solo quitarlo' : 'Pierde el turno',
      style: 'destructive' as const,
      onPress: () => op(() => marcarNoEsta(item.id), 'No se pudo'),
    })
    opciones.push({ text: 'Sigo esperándolo' })

    Alert.alert(`¿${nombre} no está?`,
      presentes.length
        ? 'Pierde su turno. Puedes meter en su hueco a alguien que esté aquí: quien viene detrás conserva su puesto y su hora.'
        : 'Pierde su turno y pasa el siguiente de la fila. Si aparece después, tendrá que volver a pedir turno.',
      opciones)
  }

  async function llamar() {
    try {
      const r = await llamarSiguiente(sesion.negocio_id, sesion.perfil_id)
      if (!r) Alert.alert('Sin cola', 'Nadie esperando o hay una cita confirmada en curso.')
      else {
        avisarLlamado(r); avisarSiguiente()
        setCola(prev => prev.map(x => x.id === (r as any).id
          ? { ...x, estado: 'llamado', llamado_at: (r as any).llamado_at, expira_at: (r as any).expira_at } : x))
      }
      refrescar()
      avisarCambiosDeEspera()
    } catch (e: any) { Alert.alert('No se pudo llamar', e.message ?? 'Intenta de nuevo.') }
  }

  // ── Gestión de la fila ────────────────────────────────────────
  /**
   * Toda acción sobre la fila pasa por aquí, así que aquí es donde toca revisar
   * a quién se le movió la espera. El tiempo que se le da al cliente al entrar
   * es un aproximado, no un compromiso — pero si cambia, el sistema tiene que
   * decírselo: quien salió a hacer algo con "unos 40 minutos" en la cabeza no
   * puede enterarse de que le tocaba cuando ya perdió el turno.
   *
   * Va después de refrescar y sin bloquear la pantalla: el barbero ya terminó lo
   * suyo, los avisos son cosa nuestra.
   */
  async function op(fn: () => Promise<any>, err = 'No se pudo') {
    setHoja(null)
    try {
      await fn()
      refrescar()
      avisarCambiosDeEspera()
    } catch (e: any) { Alert.alert(err, e.message ?? 'Intenta de nuevo.') }
  }

  function avisarCambiosDeEspera() {
    if (!sesion?.negocio_id) return
    avisosDeEspera(sesion.negocio_id)
      .then(lista => {
        for (const a of lista) {
          if (a.cliente_id) {
            avisos.clienteEsperaCambio(a.cliente_id, negocio?.nombre ?? 'el local', a.minutos, a.se_adelanto)
          }
        }
      })
      .catch(() => {})   // que un push no salga no puede romperle la fila al barbero
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
          // La visita ya sumó (el trigger corre en la misma transacción), así
          // que aquí se sabe si con esta cerró la tarjeta. Enterarse por
          // sorpresa en la próxima visita es peor premio.
          avisarSiPremio(item.cliente_id)
        }
      }) },
    ])
  }
  /** Avisa al cliente si esta visita le completó la tarjeta de fidelidad. */
  async function avisarSiPremio(clienteId: string) {
    try {
      const [f, t] = await Promise.all([
        getFidelidad(sesion.negocio_id, sesion.perfil_id),
        getTarjetaCliente(clienteId, sesion.negocio_id, null),
      ])
      if (!f?.activo) return
      const card = await getTarjetaCliente(clienteId, sesion.negocio_id, f.perfil ?? null).catch(() => t)
      const disp = ((card as any)?.visitas_totales ?? 0) - ((card as any)?.visitas_canjeadas ?? 0)
      if (disp >= f.meta) avisos.clientePremio(clienteId, f.premio, negocio?.nombre ?? 'la barbería')
    } catch { /* un aviso que no sale no puede romper el cierre de la visita */ }
  }

  /** Cerrar una cita: es lo que el barbero hace al terminar el corte. Se
   *  pregunta porque marcarla atendida es lo que la cuenta como dinero. */
  function cerrarCita(c: any) {
    Alert.alert(c.turno_usuarios?.nombre ?? 'Cita',
      `${c.turno_servicios?.nombre ?? 'Servicio'} de las ${hora12(c.hora_inicio)}. ¿Ya lo atendiste?`, [
      { text: 'Todavía no', style: 'cancel' },
      { text: 'Sí, atendida', onPress: async () => {
        try {
          await actualizarEstadoCita(c.id, 'atendida', { atendida_at: new Date().toISOString() })
          refrescar()
        } catch (e: any) { Alert.alert('No se pudo', e.message ?? 'Intenta de nuevo.') }
      } },
    ])
  }

  /** No llegó. Separado del cierre a propósito: es una decisión distinta y con
   *  consecuencia distinta — el cliente pasa a la fila con prioridad, así que
   *  no se le echa, se le da otra oportunidad. El texto lo dice. */
  function citaNoLlego(c: any) {
    Alert.alert('No llegó',
      `${c.turno_usuarios?.nombre ?? 'Tu cliente'} no apareció a las ${hora12(c.hora_inicio)}. Pasa a tu fila con prioridad, así que si aparece más tarde entra antes que los demás.`, [
      { text: 'Esperar un poco más', style: 'cancel' },
      { text: 'No llegó', style: 'destructive', onPress: async () => {
        try { await actualizarEstadoCita(c.id, 'no_llego'); refrescar() }
        catch (e: any) { Alert.alert('No se pudo', e.message ?? 'Intenta de nuevo.') }
      } },
    ])
  }

  function accionCita(c: any) {
    const opts: any[] = [{ text: 'Cerrar', style: 'cancel' }]
    // ABIERTA ES ABIERTA. Antes "Marcar atendida" solo salía en confirmada y
    // en_camino, y "Marcar no llegó" solo en creada: una cita en
    // 'no_confirmada' —el estado al que las manda solo el reloj, cuando pasa la
    // hora de anticipación— no ofrecía NINGUNA de las dos. La única salida que
    // le quedaba al barbero era cancelarla, que dice otra cosa. Esa es la mitad
    // de "las citas viejas no se gestionan": no es que no se vieran, es que no
    // se podían cerrar.
    if (ABIERTAS.includes(c.estado)) {
      opts.unshift({ text: 'Marcar atendida', onPress: () => cerrarCita(c) })
      opts.unshift({ text: 'Marcar no llegó', style: 'destructive', onPress: () => citaNoLlego(c) })
    }
    // Cancelar desde el lado del barbero no existía: solo podía marcar que el
    // cliente no llegó, que es una acusación distinta.
    if (ABIERTAS.includes(c.estado)) {
      opts.unshift({ text: 'Cancelar la cita', style: 'destructive', onPress: async () => {
        await actualizarEstadoCita(c.id, 'cancelada', { cancelada_by: 'barbero' })
        if (c.cliente_id) {
          avisos.clienteCitaCancelada(c.cliente_id, negocio?.nombre ?? 'la barbería',
            `${fechaLarga(fechaDeISO(c.fecha))} a las ${hora12(c.hora_inicio)}`)
        }
        // Los puntitos del selector de día salen del conteo del mes, que solo se
        // recarga entero. Quedan un momento desactualizados a cambio de que la
        // cancelación se vea al instante; se ajustan al cambiar de día o al tirar
        // de la pantalla.
        refrescar()
      } })
    }
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
  /**
   * POR DÓNDE ACEPTA TRABAJO (migración 70). Sale de turno_estado_barbero, que
   * ya se pedía en cada carga.
   *
   * OJO con `daFila`: NO significa "no puede haber nadie en la fila". Un
   * barbero 'solo_citas' sigue teniendo fila, porque a quien no llega a su cita
   * se le mete en ella con prioridad (turno_cita_a_cola_prioritaria), y eso es
   * correcto — ya tenía hora, se le está dando una segunda oportunidad. Así que
   * esto solo sirve para no OFRECER lo que no aplica, nunca para esconder gente.
   */
  const daCitas = estado?.acepta_citas !== false
  const daFila = estado?.acepta_fila !== false

  /**
   * LA CITA DE AHORA.
   *
   * Para un barbero que solo trabaja con hora, su jornada entera son las citas
   * — y hasta ahora vivían en una lista al final de la pantalla, con sus dos
   * únicas decisiones (atendida / no llegó) escondidas en un menú de alerta a
   * tres toques. Mientras tanto, la mitad de arriba le hablaba de una fila que
   * no usa.
   *
   * El margen de 15 minutos es de PRESENTACIÓN, no una regla: decide cuándo la
   * tarjeta aparece, nada más. Lo que se puede hacer con la cita lo siguen
   * decidiendo las RPC, que traen sus propios plazos (ventana de llegada y
   * tolerancia). Una fecha de corte en la pantalla nunca debe poder autorizar
   * algo que el servidor no autorice.
   */
  const MARGEN_CITA_MIN = 15
  // 'no_confirmada' entra aquí: es una cita que sigue en pie, solo que el
  // cliente no confirmó a tiempo. Dejarla fuera hacía que la cita de ahora
  // desapareciera del panel justo cuando el barbero más la mira.
  const citasVivas = citas.filter((c: any) => ABIERTAS.includes(c.estado))
  const minutosHasta = (hhmm: string) => {
    void tic
    const [h, m] = String(hhmm).split(':').map(Number)
    const t = new Date(); t.setHours(h, m, 0, 0)
    return Math.round((t.getTime() - Date.now()) / 60000)
  }
  const citaAhora = esHoy
    ? citasVivas.find((c: any) => {
        const faltan = minutosHasta(c.hora_inicio)
        const dura = c.turno_servicios?.duracion_min ?? 30
        return faltan <= MARGEN_CITA_MIN && faltan > -(dura + MARGEN_CITA_MIN)
      })
    : null
  const citaProxima = esHoy
    ? citasVivas.filter((c: any) => minutosHasta(c.hora_inicio) > MARGEN_CITA_MIN)
        .sort((a: any, b: any) => String(a.hora_inicio).localeCompare(String(b.hora_inicio)))[0]
    : null

  const ocupado = esHoy
    ? bloqueos.find(b => b.hora_inicio <= sumarMinutos(ahora, 2) && b.hora_fin > ahora)
    : null
  // Los que se ven abajo son los bloqueos que NO están en curso: el vigente ya
  // se muestra arriba como estado, y repetirlo confundía.
  const bloqueosLista = bloqueos.filter(b => b.id !== ocupado?.id)
  const dias = Array.from({ length: DIAS_ADELANTE + 2 }, (_, i) => sumarDias(hoy, i - 1))

  // ── QUÉ DICE Y QUÉ OFRECE EL CUADRO PRINCIPAL ──────────────────────────────
  // Una sola línea con todo el panorama, en vez de repartir el mismo dato en
  // tres cajas. Se nombra lo que hay; lo que no hay se calla, salvo cuando no
  // hay nada de nada, que también es información.
  const resumen = (() => {
    const partes: string[] = []
    if (estado?.estado === 'atendiendo' && estado?.hasta) partes.push(`hasta ${hora12(estado.hasta)}`)
    if (enFila.length > 0) partes.push(`${enFila.length} esperando`)
    const nCitas = citas.filter((c: any) => !['cancelada', 'atendida', 'no_llego'].includes(c.estado)).length
    if (esHoy && nCitas > 0) partes.push(`${nCitas} ${nCitas === 1 ? 'cita' : 'citas'} hoy`)
    if (estado && !estado.acepta) partes.push('no apareces para los clientes')
    if (partes.length) return partes.join(' · ')
    // El vacío también tiene que decir la verdad de ESTE barbero: "sin citas
    // hoy" a uno que trabaja solo por orden de llegada nombra algo que en su
    // caso no existe, y le hace dudar de si se le ha perdido una.
    if (!daCitas) return 'Nadie esperando'
    if (!daFila) return 'Sin citas hoy'
    return 'Nadie esperando y sin citas hoy'
  })()

  /**
   * La cuenta atrás de quien fue llamado. `expira_at` lo pone
   * turno_llamar_siguiente desde siempre —la ventana de llegada— pero no se
   * enseñaba en ninguna pantalla: el reloj corría a oscuras para los dos lados.
   *
   * Devuelve segundos para poder pintar el minuto y el segundo; `tic` la
   * recalcula sola. Null cuando no hay reloj que contar: nadie llamado, o el
   * cliente ya dijo "estoy aquí" y turno_ya_llegue apagó el expira.
   */
  const restante: number | null = (() => {
    void tic
    if (!llamado?.expira_at || llamado.estado === 'atendiendo') return null
    const s = Math.round((new Date(llamado.expira_at).getTime() - Date.now()) / 1000)
    return s > 0 ? s : 0
  })()
  const llego = !!llamado?.llego_at

  /** Cuánto lleva alguien esperando. Un número que el barbero mira para decidir
   *  a quién adelanta, y que hasta ahora no salía en ningún sitio. */
  function esperaDe(q: any): number | null {
    if (!q?.created_at) return null
    const m = Math.floor((Date.now() - new Date(q.created_at).getTime()) / 60000)
    return m > 0 ? m : null
  }

  // LA acción del momento. Antes el barbero tenía que decidir entre "Llamar",
  // "Atender sin cita" y el menú de cada fila; la pantalla enseñaba datos y le
  // dejaba a él la conclusión. Esto la dice.
  const accion = (() => {
    if (!sesion?.perfil_id) return null
    if (llamado?.estado === 'atendiendo') {
      return { texto: `Terminar con ${llamado.turno_usuarios?.nombre ?? 'el cliente'}`, icono: 'checkmark-circle-outline', onPress: () => atenderCola(llamado) }
    }
    if (llamado) {
      return { texto: `Sentar a ${llamado.turno_usuarios?.nombre ?? 'el cliente'}`, icono: 'cut-outline', onPress: () => empezarCorte(llamado) }
    }
    if (enFila.length > 0) {
      return { texto: `Llamar a ${enFila[0].turno_usuarios?.nombre ?? 'el siguiente'}`, icono: 'megaphone-outline', onPress: llamar }
    }
    // LA CITA DE AHORA. Va después de la fila —quien está esperando de pie
    // tiene preferencia sobre quien todavía no ha llegado— pero antes que
    // "atender sin cita", que era lo único que se ofrecía a un barbero de solo
    // citas aunque tuviera a alguien citado en ese momento.
    if (citaAhora) {
      return {
        texto: `Atender a ${citaAhora.turno_usuarios?.nombre ?? 'tu cita'} · ${hora12(citaAhora.hora_inicio)}`,
        icono: 'calendar-outline',
        onPress: () => cerrarCita(citaAhora),
      }
    }
    if (estado && !estado.acepta) return null   // en descanso: la fila está cerrada
    // La silla ocupada por un walk-in ya tiene su propia tarjeta con "Terminé".
    // Ofrecer "atender sin cita" encima invita a empezar un segundo corte
    // encima del que estás haciendo.
    if (ocupado) return null
    return { texto: 'Atender cliente sin cita', icono: 'cut-outline', onPress: () => setHoja({ tipo: 'servicios', modo: 'ocupar' }) }
  })()

  /**
   * ¿Está la silla libre para meter a alguien sin cita?
   *
   * No lo está de dos formas distintas, y la pantalla solo miraba una: un
   * cliente de la fila sentado (`atendiendo`), o un walk-in metido con
   * "atender sin cita", que crea un bloqueo (`ocupado`). Con alguien en la
   * silla seguía saliendo el botón de atender a otro sin cita.
   */
  const sillaLibre = !ocupado && llamado?.estado !== 'atendiendo'

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: 72, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar() }} />}>
      <PanelBadge />
      <Text style={s.kicker}>{fechaLarga(fechaDeISO(fecha))}</Text>
      {/* "Agenda de <nombre>" y debajo el local. Antes era el nombre a secas,
          que en un local con varias sillas no dice si es tuya o la de otro, y
          no decía en absoluto DÓNDE — un barbero que trabaja en dos sitios
          abría la app sin saber cuál estaba viendo, y cambiar de local había
          que ir a buscarlo a Configuración. */}
      <Display size={30}>
        {titulo ? titulo : <>Agenda de <Text style={s.nombrePropio}>{usuario?.nombre ?? 'mi silla'}</Text></>}
      </Display>
      {locales.length > 1 ? (
        <TouchableOpacity style={s.localSel} onPress={() => setLocalModal(true)}>
          <Ionicons name="storefront-outline" size={15} color={COLORS.textMid} />
          <Text style={s.localSelT}>{negocio?.nombre ?? 'Elige local'}</Text>
          <Ionicons name="chevron-down" size={15} color={COLORS.textMid} />
        </TouchableOpacity>
      ) : negocio?.nombre ? (
        <View style={s.localFijo}>
          <Ionicons name="storefront-outline" size={15} color={COLORS.textLight} />
          <Text style={s.localFijoT}>{negocio.nombre}</Text>
        </View>
      ) : null}
      <View style={{ height: 16 }} />

      {/* ── SELECTOR DE DÍA ─────────────────────────────────────────────────
          Va AQUÍ, no al final. Estaba debajo del cuadro de estado y de toda la
          fila en vivo, y desde ahí no parecía el mando de la pantalla sino un
          adorno: tocabas un jueves, el cuadro de arriba seguía enseñando la
          fila de hoy —porque la fila en vivo es de hoy, no del jueves— y la
          conclusión razonable era que el selector no servía para nada.
          Arriba manda: lo que elijas aquí es lo que estás mirando. */}
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

      {/* ── CUADRO PRINCIPAL: ESTADO + FILA EN UNO ──────────────────────────
          Antes esto eran tres cajas separadas diciendo lo mismo. Con la fila
          vacía se leía "Nadie esperando" (estado), "Total 0" (COLA AHORA) y
          "Nadie esperando ahora mismo" (EN FILA): tres avisos para una sola
          noticia, y ninguno decía qué hacer.

          El desglose Prioritario/Digital/Físico era vocabulario del sistema: el
          barbero no atiende categorías, atiende personas en orden. Se queda como
          etiqueta pequeña junto a quien la tiene.

          Va dentro de `esHoy`. Estuvo fuera, con el argumento de que el estado
          es de AHORA — cierto, pero engañaba: mirando el jueves seguías viendo
          "Libre · 2 esperando" y el botón "Llamar a Pedro", que son de hoy. Un
          cuadro que no cambia al cambiar de día hace creer que la pantalla
          entera se quedó en hoy. Para otro día manda la agenda de ese día. */}
      {esHoy && estado && (
        <View style={[s.panel, EST_FONDO[estado.estado] ? { backgroundColor: EST_FONDO[estado.estado] } : null]}>
          <View style={s.panelTop}>
            <PuntoVivo color="rgba(255,255,255,0.95)" vivo={estado.estado === 'libre' || estado.estado === 'atendiendo'} />
            <View style={{ flex: 1 }}>
              {/* El modo, donde el barbero mira todo el día. Sin esto se cambia
                  en Config y desde fuera no se nota nada: la app se comporta
                  distinta y nada en pantalla dice por qué. Solo aparece cuando
                  NO es el normal — un chip permanente que dice "citas y fila"
                  sería ruido en el noventa por ciento de los perfiles. */}
              {estado.modo && estado.modo !== 'ambos' && (
                <View style={s.modoChip}>
                  <Ionicons name={estado.modo === 'solo_citas' ? 'calendar' : 'people'} size={11} color="rgba(0,0,0,0.65)" />
                  <Text style={s.modoChipT}>{estado.modo === 'solo_citas' ? 'Solo con cita' : 'Solo fila'}</Text>
                </View>
              )}
              <Text style={s.estadoT}>
                {estado.estado === 'atendiendo'
                  ? (estado.cliente ? `Atendiendo a ${estado.cliente}` : 'Silla ocupada')
                  : estado.estado === 'descanso' ? 'En descanso'
                  : estado.estado === 'inactivo' ? 'Inactivo'
                  : 'Libre'}
              </Text>
              <Text style={s.estadoD}>{resumen}</Text>
            </View>
            <TouchableOpacity style={s.estadoBtn}
              onPress={() => op(() => actualizarEstadoPerfil(sesion.perfil_id, estado.acepta ? 'descanso' : 'disponible'))}>
              <Text style={s.estadoBtnT}>{estado.acepta ? 'Pausar' : 'Volver'}</Text>
            </TouchableOpacity>
          </View>

          {/* UNA acción, la que toca ahora. Antes había que decidir entre
              "Llamar", "Atender sin cita" y las opciones de cada fila. */}
          {esHoy && accion && (
            <TouchableOpacity style={s.accionPral} onPress={accion.onPress}>
              <Ionicons name={accion.icono as any} size={18} color={COLORS.ink} />
              <Text style={s.accionPralT}>{accion.texto}</Text>
            </TouchableOpacity>
          )}

          {/* LA CITA DE AHORA, con sus dos salidas a un toque.
              Para quien solo trabaja con hora, esto ES su día — y vivía en una
              lista al final de la pantalla, con "atendida" y "no llegó"
              escondidas en un menú de alerta a tres toques. El minutero dice si
              va con retraso, que es la única pregunta que se hace mirando el
              reloj: ¿le espero o paso al siguiente? */}
          {citaAhora && !llamado && (
            <View style={s.cuenta}>
              <View style={s.cuentaTop}>
                <Ionicons name="calendar" size={16} color="#fff" />
                <Text style={s.cuentaT}>
                  {citaAhora.turno_usuarios?.nombre ?? 'Tu cita'} · {hora12(citaAhora.hora_inicio)}
                  {(() => {
                    const m = minutosHasta(citaAhora.hora_inicio)
                    return m > 0 ? ` · en ${m} min` : m < 0 ? ` · ${-m} min tarde` : ' · ahora'
                  })()}
                </Text>
              </View>
              <View style={s.cuentaBtns}>
                <TouchableOpacity style={[s.cuentaBtn, s.cuentaBtnFuerte]} onPress={() => cerrarCita(citaAhora)}>
                  <Text style={s.cuentaBtnFuerteT}>Atendida</Text>
                </TouchableOpacity>
                {citaAhora.turno_usuarios?.telefono ? (
                  <TouchableOpacity style={s.cuentaBtn}
                    onPress={() => recordarCita(citaAhora.turno_usuarios.telefono, citaAhora.turno_usuarios?.nombre ?? 'cliente', citaAhora.hora_inicio, negocio?.nombre ?? 'tu barbería')}>
                    <Text style={s.cuentaBtnT}>Escribirle</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={s.cuentaBtn} onPress={() => citaNoLlego(citaAhora)}>
                  <Text style={s.cuentaBtnT}>No llegó</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Y si no hay ninguna ahora, la siguiente: un barbero de solo citas
              necesita saber a qué hora vuelve a tener trabajo, no que su fila
              está vacía. */}
          {!citaAhora && !llamado && citaProxima && (
            <View style={s.siguiente}>
              <Ionicons name="time-outline" size={15} color="rgba(0,0,0,0.6)" />
              <Text style={s.siguienteT}>
                Después: {citaProxima.turno_usuarios?.nombre ?? 'cita'} a las {hora12(citaProxima.hora_inicio)}
              </Text>
            </View>
          )}

          {/* LLAMADO: el reloj y las tres salidas.
              Antes aquí solo había "No está · pierde el turno", y el minutero
              no se veía en ningún sitio pese a existir en los datos desde el
              principio. El barbero llamaba y se quedaba a ciegas: ni sabía
              cuánto le quedaba al otro, ni tenía nada entre esperar de brazos
              cruzados y quitarle el turno. */}
          {esHoy && llamado && llamado.estado !== 'atendiendo' && (
            <View style={s.cuenta}>
              <View style={s.cuentaTop}>
                <Ionicons name={llego ? 'checkmark-circle' : 'time-outline'} size={16} color="#fff" />
                <Text style={s.cuentaT} numberOfLines={1}>
                  {llamado.turno_usuarios?.nombre ?? 'Cliente'} ·{' '}
                  {llego ? 'ya está aquí'
                    : llamado.estado === 'en_camino' ? 'va en camino'
                    : restante === null ? 'llamado'
                    : restante > 0 ? `le quedan ${Math.floor(restante / 60)}:${String(restante % 60).padStart(2, '0')}`
                    : 'se le pasó el tiempo'}
                </Text>
              </View>
              {llamado.turno_servicios?.nombre ? <Text style={s.cuentaSub}>{llamado.turno_servicios.nombre}</Text> : null}
              <View style={s.cuentaBtns}>
                <TouchableOpacity style={[s.cuentaBtn, s.cuentaBtnFuerte]} onPress={() => empezarCorte(llamado)}>
                  <Text style={s.cuentaBtnFuerteT}>Atendiendo</Text>
                </TouchableOpacity>
                {/* Dar un rato más existe para "está aparcando": la única
                    alternativa era quitarle el turno, que es otra cosa. Se
                    esconde si ya dijo que está aquí — no hay reloj que alargar. */}
                {!llego && (
                  <TouchableOpacity style={s.cuentaBtn} onPress={() => op(() => darMasTiempo(llamado.id, 5), 'No se pudo')}>
                    <Text style={s.cuentaBtnT}>Esperar +5</Text>
                  </TouchableOpacity>
                )}
                {/* Venía de la tarjeta verde que había debajo. Al fundir las dos
                    en una, sus acciones se mudan aquí: quitarlas habría sido
                    "simplificar" quitándole al barbero la forma de avisar. */}
                {llamado.turno_usuarios?.telefono ? (
                  <TouchableOpacity style={s.cuentaBtn}
                    onPress={() => avisarTurno(llamado.turno_usuarios.telefono, llamado.turno_usuarios?.nombre ?? 'cliente', negocio?.nombre ?? 'el local')}>
                    <Text style={s.cuentaBtnT}>Avisar</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={s.cuentaBtn} onPress={() => confirmarNoEsta(llamado)}>
                  <Text style={s.cuentaBtnT}>No está</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.cuentaBtn} onPress={() => setHoja({ tipo: 'acciones', item: llamado })}>
                  <Ionicons name="ellipsis-horizontal" size={15} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* EN LA SILLA. Antes esto era una tarjeta VERDE aparte, debajo del
              panel, y al sentar a alguien la pantalla enseñaba dos cuadros de
              estado a la vez: el panel azul diciendo "Atendiendo a Juan" y la
              verde diciendo "EN LA SILLA · Juan" con el mismo botón de
              terminar. Reportado desde el teléfono al atender a un cliente sin
              cita, que es donde más canta porque los dos aparecen de golpe.
              Ahora el estado es UNO y esto es su detalle: el servicio, el
              minutero, y el aviso de que llevas demasiado. Terminar sigue
              siendo la acción principal de arriba, así que no se repite. */}
          {esHoy && llamado?.estado === 'atendiendo' && (
            <View style={s.siguiente}>
              <Ionicons name="cut-outline" size={15} color="rgba(0,0,0,0.6)" />
              <Text style={s.siguienteT} numberOfLines={1}>
                {[llamado.turno_servicios?.nombre, minutosEnSilla(llamado) ? `lleva ${minutosEnSilla(llamado)} min` : null]
                  .filter(Boolean).join(' · ') || 'En la silla'}
                {minutosEnSilla(llamado) > Math.max(45, (llamado.turno_servicios?.duracion_min ?? 30) * 2) ? ' · ¿ya terminaste?' : ''}
              </Text>
              <TouchableOpacity onPress={() => setHoja({ tipo: 'acciones', item: llamado })}>
                <Ionicons name="ellipsis-horizontal" size={16} color="rgba(0,0,0,0.6)" />
              </TouchableOpacity>
            </View>
          )}

          {esHoy && enFila.length > 0 && (
            <View style={s.siguen}>
              <Text style={s.siguenLbl}>SIGUEN</Text>
              {(verTodos ? enFila : enFila.slice(0, 4)).map((q, i) => (
                <TouchableOpacity key={q.id} style={s.siguenRow} onPress={() => setHoja({ tipo: 'acciones', item: q })}>
                  <Text style={s.siguenPos}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.siguenName}>{q.turno_usuarios?.nombre ?? 'Cliente'}</Text>
                    <Text style={s.siguenServ}>
                      {q.turno_servicios?.nombre}
                      {q.prioridad === 1 ? ' · tenía cita' : ''}
                      {esperaDe(q) ? ` · lleva ${esperaDe(q)} min` : ''}
                    </Text>
                  </View>
                  <Ionicons name="ellipsis-vertical" size={16} color={COLORS.textLight} />
                </TouchableOpacity>
              ))}
              {enFila.length > 4 && (
                <TouchableOpacity onPress={() => setVerTodos(v => !v)}>
                  <Text style={s.verTodos}>
                    {verTodos ? 'Ver solo los próximos' : `Ver los ${enFila.length} de la fila`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}

      {/* Esta barra NO cuenta citas. Lo hizo, y se veía mal: en un día vacío
          decía "Sin citas este día" y el panel de abajo repetía la misma frase
          palabra por palabra, y en un día con citas contaba tres y las tres
          salían listadas justo debajo. Dos sitios diciendo lo mismo hacen dudar
          de si hablan de lo mismo.

          Su trabajo es otro y solo ese: recordarte que no estás en hoy, y
          devolverte con un toque. Lo que hay ese día lo cuenta "CITAS DEL DÍA",
          que es de quien es. */}
      {!esHoy && (
        <View style={s.otroDia}>
          <Ionicons name="calendar-outline" size={16} color={COLORS.textMid} />
          <Text style={s.otroDiaT}>No estás viendo hoy</Text>
          <TouchableOpacity style={s.volverHoy} onPress={() => setFecha(hoy)}>
            <Text style={s.volverHoyT}>Ir a hoy</Text>
          </TouchableOpacity>
        </View>
      )}

      {esHoy && (
        <>
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

          {/* Aquí vivían la tarjeta verde de "EN LA SILLA / LLAMADO" y el aviso
              de "llevas 2 h con este cliente". Las dos se mudaron DENTRO del
              panel de estado: eran cuadros de estado compitiendo con el cuadro
              de estado. Lo que sigue debajo no es estado —el vale, la ficha del
              cliente, la fila— y por eso se queda fuera. */}

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

        </>
      )}

      {/* Con el modo "solo fila" no van a entrar citas nuevas, pero LAS QUE YA
          ESTABAN siguen valiendo: si cambió el modo con gente ya reservada,
          esconderlas sería hacerle perder clientes que van a aparecer igual.
          Por eso la sección se calla solo cuando de verdad no hay nada. */}
      {/* SIN CERRAR. La agenda enseña un día, así que lo que quedó abierto el
          martes solo existía si a alguien se le ocurría volver al martes: el
          barbero cierra el local, no repasa la semana hacia atrás. El cron las
          cierra solo pasado un día —y como 'no llegó', que puede ser mentira si
          sí vino y nadie lo marcó—, así que entre medias esto es lo único que
          le da la oportunidad de decir qué pasó de verdad.

          Va ARRIBA de las citas de hoy y solo cuando hay alguna: es una deuda,
          y las deudas se enseñan al entrar, no al final. */}
      {esHoy && sinCerrar.length > 0 && (
        <>
          <Text style={s.sec}>SIN CERRAR · DÍAS PASADOS</Text>
          {sinCerrar.map((c: any) => (
            <TouchableOpacity key={c.id} style={[s.row, s.rowDeuda]} onPress={() => accionCita(c)}>
              <Avatar name={c.turno_usuarios?.nombre} size={42} bg={COLORS.surfaceAlt} color={COLORS.ink} />
              <View style={{ flex: 1 }}>
                <Text style={s.rowName}>{c.turno_usuarios?.nombre ?? 'Cliente'}</Text>
                <Text style={s.rowServ}>
                  {fechaLarga(fechaDeISO(c.fecha))} · {hora12(c.hora_inicio)}
                </Text>
              </View>
              <Text style={s.rowDeudaT}>¿Vino?</Text>
            </TouchableOpacity>
          ))}
        </>
      )}

      {(daCitas || citas.length > 0) && <Text style={s.sec}>CITAS DEL DÍA</Text>}
      {citas.length === 0 && daCitas && <Text style={s.empty}>Sin citas este día</Text>}
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

      {/* Solo si el cuadro de arriba NO está ya ofreciendo esto: con gente en la
          fila la acción principal es "Llamar a…", y entonces sigue haciendo
          falta poder atender a alguien que llega caminando. */}
      {esHoy && sillaLibre && accion?.texto !== 'Atender cliente sin cita' && (
        <TouchableOpacity style={s.walkin} onPress={() => setHoja({ tipo: 'servicios', modo: 'ocupar' })}>
          <Ionicons name="cut" size={18} color="#fff" /><Text style={s.walkinT}>Atender cliente sin cita</Text>
        </TouchableOpacity>
      )}
      {/* EL CÓDIGO, COMO EN EL PANEL DEL DUEÑO.
          Compartirlo es cómo le llegan clientes nuevos: lo único de esta
          pantalla que hace crecer el negocio en vez de administrar el día. Era
          una fila con el código metido en un chip de trece puntos a la derecha,
          o sea el dato importante en lo más pequeño de la tarjeta. El panel del
          dueño ya tenía resuelta exactamente esta tarjeta —etiqueta arriba,
          código enorme, botón de compartir en rojo— y es la que mejor respeta
          la línea de la marca. Misma tarjeta, mismo sitio en la jerarquía: dos
          códigos que se comparten igual deben verse igual. */}
      {usuario?.codigo_barbero ? (
        <View style={s.codeCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.codeLbl}>MI CÓDIGO DE BARBERO</Text>
            <Text style={s.codeVal}>{usuario.codigo_barbero}</Text>
            <Text style={s.codeSub}>Compártelo para que reserven contigo</Text>
          </View>
          <TouchableOpacity style={s.codeShare} activeOpacity={0.85}
            onPress={() => Share.share({ message: `Reserva conmigo en Turno con mi código de barbero ${usuario.codigo_barbero}` })}>
            <Ionicons name="share-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Bloquear cierra horas al público: es destructivo en el sentido que
          importa aquí —deja de entrar trabajo— así que va en rojo y separado
          del botón que trae clientes, para no tocarlo por inercia. */}
      <TouchableOpacity style={s.bloquear} onPress={() => setHoja({ tipo: 'bloqueo' })}>
        <Ionicons name="lock-closed-outline" size={16} color={COLORS.red} />
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
                      {/* Adelantar y reordenar ya no existen: el orden de la
                          fila es una REGLA, no una sugerencia. Quien reservó
                          cita va primero, después quien se metió en la fila, y
                          el que llega sin cita solo cuando no queda nadie
                          esperando. Un botón para saltárselo convierte la
                          promesa que ve el cliente en una mentira. Se llama al
                          siguiente desde el cuadro de arriba; aquí solo queda
                          lo que no altera el turno de nadie. */}
                      <Text style={s.ordenNota}>
                        {it.prioridad === 1 ? 'Tenía cita, por eso va primero.'
                          : it.prioridad === 3 ? 'Llegó sin cita: entra cuando no quede nadie en la fila, o cuando a quien le toca no esté.'
                          : 'Entró a la fila desde la app.'}
                      </Text>
                    </>
                  ) : (
                    <Opcion icon="return-down-back" t="Devolver a la fila" d="Deshace el llamado y conserva su puesto" onPress={() => op(() => devolverAFila(it.id), 'No se pudo devolver')} />
                  )}
                  {/* Lo tienes delante y hasta ahora no había forma de mirar su
                      historial sin salir a buscarlo en otra pestaña — y la lista
                      de allí solo trae a quien ya te visitó, así que un cliente
                      nuevo en la silla no aparecía en ningún sitio. */}
                  {it.cliente_id && (
                    <Opcion icon="person-outline" t="Ver su ficha" d="Historial, puntos, preferencias y tu nota"
                      onPress={() => { setHoja(null); router.push({ pathname: '/(app)/barbero/clientes', params: { cliente: it.cliente_id, nombre: it.turno_usuarios?.nombre ?? 'Cliente', telefono: it.turno_usuarios?.telefono ?? '' } } as any) }} />
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

      {/* Cambiar de local. Solo existe si trabaja en más de uno. */}
      <Modal visible={localModal} transparent animationType="slide" onRequestClose={() => setLocalModal(false)}>
        <View style={s.modalBg}>
          <View style={s.modal}>
            <Display size={22}>¿En qué local estás?</Display>
            <Text style={s.modalSub}>Cambia la agenda, la fila y los clientes que ves.</Text>
            {locales.map((l: any) => {
              const activo = l.negocio_id === sesion?.negocio_id
              return (
                <TouchableOpacity key={l.negocio_id} style={s.localOpc} onPress={() => cambiarLocal(l)}>
                  <Ionicons name={activo ? 'radio-button-on' : 'radio-button-off'} size={20}
                    color={activo ? COLORS.red : COLORS.textLight} />
                  <Text style={s.localOpcT}>{l.nombre}</Text>
                </TouchableOpacity>
              )
            })}
            <TouchableOpacity onPress={() => setLocalModal(false)}><Text style={s.cerrarHoja}>Cancelar</Text></TouchableOpacity>
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

const gs = StyleSheet.create({
  num: { fontFamily: FONTS.display, fontSize: 30, color: '#fff' },
  lbl: { fontFamily: FONTS.medium, fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
})

const s = StyleSheet.create({
  // Va dentro del cuadro de estado, que ya tiene fondo de color: por eso el
  // panel es un velo oscuro translúcido y no un color propio — así funciona
  // igual sobre el verde de "libre" y el azul de "atendiendo".
  modoChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8, marginBottom: 4 },
  modoChipT: { fontFamily: FONTS.bold, fontSize: 10.5, color: 'rgba(0,0,0,0.65)', letterSpacing: 0.2 },
  cuenta: { backgroundColor: 'rgba(0,0,0,0.16)', borderRadius: 13, padding: 11, marginTop: 10 },
  cuentaTop: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 9 },
  cuentaT: { flex: 1, fontFamily: FONTS.bold, fontSize: 14, color: '#fff' },
  cuentaSub: { fontFamily: FONTS.medium, fontSize: 12.5, color: 'rgba(255,255,255,0.85)', marginTop: -5, marginBottom: 9 },
  // Envuelve: con teléfono son cinco botones y en un teléfono estrecho la
  // última se salía de la tarjeta.
  cuentaBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  cuentaBtn: { flexGrow: 1, flexBasis: 84, alignItems: 'center', paddingVertical: 10, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)' },
  cuentaBtnT: { fontFamily: FONTS.bold, fontSize: 13, color: '#fff' },
  cuentaBtnFuerte: { backgroundColor: '#fff' },
  cuentaBtnFuerteT: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.ink },
  siguiente: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.45)', borderRadius: 11, paddingVertical: 9, paddingHorizontal: 11 },
  siguienteT: { flex: 1, fontFamily: FONTS.semibold, fontSize: 13, color: 'rgba(0,0,0,0.7)' },
  ordenNota: { color: COLORS.textMid, fontSize: 13, lineHeight: 18, paddingVertical: 10 },
  // ── Cuadro principal: estado, acción y fila, en una sola pieza ────────────
  panel: { backgroundColor: COLORS.surface, borderRadius: 18, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: COLORS.border },
  panelTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  accionPral: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 12, paddingVertical: 14, marginTop: 12 },
  accionPralT: { color: COLORS.ink, fontSize: 15.5, fontWeight: '800' },
  siguen: { marginTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.10)', paddingTop: 8 },
  siguenLbl: { color: 'rgba(0,0,0,0.55)', fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 4 },
  siguenRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  siguenPos: { width: 18, textAlign: 'center', color: 'rgba(0,0,0,0.55)', fontSize: 13, fontWeight: '800' },
  siguenName: { color: COLORS.ink, fontSize: 14.5, fontWeight: '700' },
  siguenServ: { color: 'rgba(0,0,0,0.6)', fontSize: 12.5, marginTop: 1 },
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  kicker: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textLight, textTransform: 'capitalize', marginBottom: 4 },
  diasWrap: { marginBottom: 14 },
  dia: { width: 54, alignItems: 'center', paddingVertical: 9, borderRadius: 13, backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border },
  diaOn: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  diaSem: { fontFamily: FONTS.bold, fontSize: 10, color: COLORS.textLight, letterSpacing: 0.5 },
  diaNum: { fontFamily: FONTS.display, fontSize: 20, color: COLORS.ink, marginTop: 1 },
  diaTxtOn: { color: '#fff' },
  diaDot: { width: 5, height: 5, borderRadius: 3, marginTop: 4, backgroundColor: 'transparent' },
  diaDotHay: { backgroundColor: COLORS.red },
  diaDotOn: { backgroundColor: '#fff' },
  otroDia: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: COLORS.surfaceAlt, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 13, marginBottom: 14 },
  otroDiaT: { flex: 1, fontFamily: FONTS.bold, fontSize: 14, color: COLORS.ink },
  volverHoy: { backgroundColor: COLORS.ink, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 13 },
  volverHoyT: { fontFamily: FONTS.bold, fontSize: 13, color: '#fff' },
  valeBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.red, borderRadius: 12, padding: 13, marginTop: -6, marginBottom: 14 },
  valeBarT: { flex: 1, fontFamily: FONTS.bold, fontSize: 13, color: '#fff' },
  // El halo crece y se desvanece por encima; el núcleo no se mueve, para que
  // el punto siga leyéndose como un indicador y no como una animación.
  estadoT: { fontFamily: FONTS.extrabold, fontSize: 16, color: '#fff' },
  estadoD: { fontFamily: FONTS.medium, fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  estadoBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  estadoBtnT: { fontFamily: FONTS.bold, fontSize: 13, color: '#fff' },
  ocupado: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.blue, borderRadius: 14, padding: 14, marginBottom: 14 },
  ocupadoLbl: { fontFamily: FONTS.bold, fontSize: 10, color: 'rgba(255,255,255,0.75)', letterSpacing: 1 },
  ocupadoT: { fontFamily: FONTS.extrabold, fontSize: 16, color: '#fff', marginTop: 2 },
  ocupadoBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  ocupadoBtnT: { fontFamily: FONTS.bold, fontSize: 13, color: '#fff' },
  // Aquí estaban `olvido`, `llamado` y sus botones: la tarjeta verde que
  // duplicaba el panel de estado. Se fue entera al panel, y con ella sus
  // estilos; lo que hacía se hace ahora con `cuenta` y `siguiente`.
  ficha: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, marginTop: -6, marginBottom: 14 },
  fichaTitle: { fontFamily: FONTS.bold, fontSize: 10, color: COLORS.textLight, letterSpacing: 1, marginBottom: 10 },
  fichaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fichaAlerta: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.red, marginTop: 10 },
  fichaNota: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textMid, marginTop: 8, fontStyle: 'italic' },
  fichaNotaPriv: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textMid, marginTop: 6 },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginTop: 8, marginBottom: 12 },
  verTodos: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.red, textAlign: 'center', paddingVertical: 10 },
  secHint: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: -8, marginBottom: 10 },
  empty: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, textAlign: 'center', paddingVertical: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, marginBottom: 8 },
  rowBloq: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, marginBottom: 8 },
  rowName: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  rowServ: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  // Una deuda, no una alarma: borde rojo y nada más. Van arriba del todo, y
  // pintarlas de rojo entero sería gritar por algo que no urge.
  rowDeuda: { borderColor: COLORS.red },
  rowDeudaT: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.red },
  walkin: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: COLORS.carbon, borderRadius: 14, padding: 15, marginTop: 10 },
  walkinT: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
  // LA MISMA TARJETA QUE EL PANEL DEL DUEÑO, hasta en los números: fondo
  // carbón, etiqueta de once puntos, el código en la tipografía de display a
  // cuarenta y el botón de compartir en rojo. Copiada a propósito y no
  // "inspirada": son dos códigos que se comparten igual, y verlos distintos en
  // dos pantallas de la misma app hace dudar de si son la misma cosa.
  codeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.carbon,
    borderRadius: 16, padding: 18, marginTop: 10 },
  codeLbl: { fontFamily: FONTS.bold, fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 },
  codeVal: { fontFamily: FONTS.display, fontSize: 40, color: '#fff', letterSpacing: 3, marginTop: 4 },
  codeSub: { fontFamily: FONTS.medium, fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4 },
  codeShare: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.red,
    alignItems: 'center', justifyContent: 'center' },
  nombrePropio: { color: COLORS.red },
  localSel: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 6,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 999,
    paddingVertical: 6, paddingHorizontal: 12 },
  localSelT: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.textMid },
  localFijo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  localFijoT: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textLight },
  localOpc: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  localOpcT: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  cerrarHoja: { fontFamily: FONTS.semibold, textAlign: 'center', color: COLORS.textLight, fontSize: 14, marginTop: 18 },
  bloquear: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: COLORS.red, borderRadius: 14, padding: 13, marginTop: 8 },
  bloquearT: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.red },
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
