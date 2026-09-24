/**
 * MI SILLA · la pestaña principal del barbero. SOLO HOY.
 *
 * La agenda de antes (agenda-trabajo, ya borrada) mezclaba AHORA con
 * CALENDARIO en una sola pantalla con un selector de día arriba: tocabas un
 * jueves y la fila en vivo seguía siendo la de hoy. Esto es la mitad de AHORA,
 * sacada a su pestaña; el calendario se queda en Agenda.
 *
 * Arriba, la tarjeta (components/tarjeta-silla), que enseña UN modo, el más
 * urgente. Qué modo, lo decide lib/silla.ts —probado modo a modo en
 * scripts/probar-silla.mjs—. Debajo, en claro: la fila, lo que queda hoy y
 * «salgo un momento». Ni una cifra de dinero: el teléfono se le enseña al
 * cliente, y el dinero vive en Estadísticas.
 *
 * LAS ACCIONES SON LAS DE LA AGENDA, PORTADAS UNA A UNA, con sus reglas: el
 * doble servicio que no se puede llamar, el empleado que no capta clientes
 * por su cuenta, el ausente cuyo hueco hereda quien está aquí, los avisos al
 * que se le mueve la espera. Lo que cambia es dónde viven —en hojas que
 * suben desde abajo, no en alertas del sistema— y que la hoja ES la
 * confirmación: se ve qué va a pasar antes de tocar.
 *
 * Tableros: lienzo de diseño, «D2B · Mi silla» y sus ocho hojas.
 */
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Alert } from 'react-native'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  getColaActiva, getCitasFecha, getEstadoBarbero, getBloqueosFecha, getServiciosPerfil, getNegocioById,
  getMiUsuario, captaPorSuCuenta, getSuscripcionDe, getJornadaDe, getJornadaAhora, getBarberoNegocios,
  llamarSiguiente, iniciarAtencion, darMasTiempo, actualizarEstadoCola, actualizarEstadoCita,
  sustituirAusente, marcarNoEsta, avisosDeEspera, getFidelidad, getTarjetaCliente, aplicarCanje,
  crearBloqueo, liberarAhora, actualizarEstadoPerfil, atenderSinCita, cambiarServicioCola,
  devolverAFila, sacarDeCola,
} from '../lib/db'
import { fechaISOLocal, fechaLarga, fechaDeISO } from '../lib/format'
import { avisarTurno, recordarCita, escribirCliente } from '../lib/whatsapp'
import { enviarPush, avisos } from '../lib/notificaciones'
import { suscribirCola, suscribirCitas, suscribirBloqueos, suscribirPerfil, desuscribir } from '../lib/realtime'
import { getSesion, guardarSesion } from '../lib/storage'
import { useRecargaAlEnfocar } from '../lib/recarga'
import {
  modoDeSilla, partirCola, citaDeAhora, citasQueQuedan, pausaDe, bloqueoActual, enElLocal,
  nombreDe, primerNombre, hora12, sumarMinutos, MOTIVO_PAUSA, type Accion, type DatosSilla,
} from '../lib/silla'
import { COLORS, FONTS, GLASS, SOBRE } from '../constants'
import { NoCargo } from './ui'
import TarjetaSilla from './tarjeta-silla'
import { TarjetaEsqueleto } from './tarjeta-turno'
import HojasSilla, { type HojaSilla } from './hojas-silla'

/** «HH:MM:SS» de ahora en el teléfono. Solo para PINTAR: lo que se puede
 *  hacer lo decide el servidor con la hora del local. */
function horaAhora() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

export default function MiSilla() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const hoy = fechaISOLocal()

  const [sesion, setSesion] = useState<any>(null)
  const [usuario, setUsuario] = useState<any>(null)
  const [negocio, setNegocio] = useState<any>(null)
  const [cola, setCola] = useState<any[]>([])
  const [citas, setCitas] = useState<any[]>([])
  const [bloqueos, setBloqueos] = useState<any[]>([])
  const [estado, setEstado] = useState<any>(null)
  const [servicios, setServicios] = useState<any[]>([])
  const [captaSolo, setCaptaSolo] = useState(true)
  const [suscripcion, setSuscripcion] = useState<any>(null)
  const [jornada, setJornada] = useState<any>(null)
  const [enJornada, setEnJornada] = useState(true)
  const [locales, setLocales] = useState<any[]>([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [fallo, setFallo] = useState(false)
  const [desconectado, setDesconectado] = useState(false)
  const [medidoEn, setMedidoEn] = useState<number | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [hoja, setHoja] = useState<HojaSilla | null>(null)
  const [tic, setTic] = useState(0)

  // ── cargar ────────────────────────────────────────────────────────────────
  /**
   * La cola y las citas van SIN `.catch`: son la pantalla entera. Tapadas con
   * una lista vacía, el barbero leería «nadie esperando» con tres personas en
   * la puerta. Lo demás sí lo lleva: sin ello la tarjeta enseña menos, pero
   * lo que enseña es verdad.
   */
  const cargar = useCallback(async () => {
    try {
      setFallo(false)
      const ss = await getSesion(); setSesion(ss)
      if (!ss?.perfil_id || !ss?.negocio_id) return
      const [q, c, est, bl, sv, neg, u, capta, sus, jo, viva] = await Promise.all([
        getColaActiva(ss.negocio_id, ss.perfil_id, { incluirSinAsignar: true }),
        getCitasFecha(ss.perfil_id, hoy),
        getEstadoBarbero(ss.perfil_id).catch(() => null),
        getBloqueosFecha(ss.perfil_id, hoy).catch(() => []),
        getServiciosPerfil(ss.perfil_id).catch(() => []),
        getNegocioById(ss.negocio_id).catch(() => null),
        getMiUsuario().catch(() => null),
        // Devuelve false si falla: en la duda no se ofrece llamar ni sentar,
        // que es lo que el servidor rechazaría de todos modos.
        captaPorSuCuenta(ss.perfil_id),
        getSuscripcionDe(ss.perfil_id).catch(() => null),
        getJornadaDe(ss.perfil_id, hoy).catch(() => null),
        getJornadaAhora(ss.perfil_id).catch(() => null),
      ])
      setCola(q as any[]); setCitas(c as any[]); setEstado(est); setBloqueos(bl as any[])
      setServicios(sv as any[]); setNegocio(neg); setUsuario(u); setCaptaSolo(capta as boolean)
      setSuscripcion(sus); setJornada(jo); setEnJornada(!!viva)
      setDesconectado(false); setMedidoEn(Date.now())
      // Aparte y sin esperar: solo decide si la cabecera es conmutador.
      if (ss.usuario_id) getBarberoNegocios(ss.usuario_id).then(setLocales).catch(() => {})
    } catch {
      // Si ya había algo en pantalla, se conserva y se marca como viejo; si
      // es la primera carga, no hay nada que conservar.
      if (medidoEnRef.current) setDesconectado(true)
      else setFallo(true)
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [hoy])
  const medidoEnRef = useRef<number | null>(null)
  medidoEnRef.current = medidoEn

  /** Lo que cambia mientras trabajas: la cola, las citas, el estado y los
   *  bloqueos. Lo demás no cambia porque alguien entre a la fila. */
  const cargarVivo = useCallback(async () => {
    const ss = await getSesion()
    if (!ss?.perfil_id || !ss?.negocio_id) return
    try {
      const [q, c, est, bl, viva] = await Promise.all([
        getColaActiva(ss.negocio_id, ss.perfil_id, { incluirSinAsignar: true }),
        getCitasFecha(ss.perfil_id, hoy),
        getEstadoBarbero(ss.perfil_id).catch(() => null),
        getBloqueosFecha(ss.perfil_id, hoy).catch(() => null),
        getJornadaAhora(ss.perfil_id).catch(() => undefined),
      ])
      setCola(q as any[]); setCitas(c as any[])
      if (est) setEstado(est)
      if (bl) setBloqueos(bl as any[])
      if (viva !== undefined) setEnJornada(!!viva)
      setDesconectado(false); setMedidoEn(Date.now())
    } catch {
      setDesconectado(true)
    }
  }, [hoy])

  // Los avisos en vivo llegan en ráfaga —una acción toca cola, citas y
  // bloqueos a la vez—: se agrupan en una sola recarga.
  const pendiente = useRef<any>(null)
  const refrescar = useCallback(() => {
    if (pendiente.current) clearTimeout(pendiente.current)
    pendiente.current = setTimeout(() => { pendiente.current = null; cargarVivo() }, 250)
  }, [cargarVivo])
  useEffect(() => () => { if (pendiente.current) clearTimeout(pendiente.current) }, [])

  useRecargaAlEnfocar(cargar)

  useEffect(() => {
    const subs: any[] = []
    let vivo = true
    getSesion().then(ss => {
      if (!vivo || !ss?.perfil_id || !ss?.negocio_id) return
      subs.push(suscribirCola(ss.negocio_id, refrescar))
      subs.push(suscribirCitas(ss.perfil_id, hoy, refrescar))
      subs.push(suscribirBloqueos(ss.perfil_id, refrescar))
      // Su propio perfil: si el dueño le cambia el modo o el permiso, o la
      // pausa se pone desde otro sitio, se entera sin tocar nada.
      subs.push(suscribirPerfil(ss.perfil_id, refrescar))
    })
    // Por si un aviso en vivo se pierde: la silla se vacía con el reloj, no
    // con un cambio en la base.
    const t = setInterval(cargarVivo, 60000)
    return () => { vivo = false; subs.forEach(desuscribir); clearInterval(t) }
  }, [cargarVivo, refrescar, hoy])

  // ── el reloj ──────────────────────────────────────────────────────────────
  // Late cada segundo SOLO con una cuenta atrás en pantalla; si no, cada 30 s
  // basta para que los minutos avancen. Tenerlo a un segundo todo el día es
  // despertar la pantalla para no cambiar nada.
  const hayCuenta = cola.some(c => (c.estado === 'llamado' || c.estado === 'en_camino') && c.expira_at)
  useEffect(() => {
    const t = setInterval(() => setTic(x => x + 1), hayCuenta ? 1000 : 30000)
    return () => clearInterval(t)
  }, [hayCuenta])

  // ── lo que se pinta ───────────────────────────────────────────────────────
  void tic
  const datos: DatosSilla = {
    ahora: horaAhora(), ahoraMs: Date.now(),
    cola, citas, bloqueos, estado, captaSolo, suscripcion, jornada, enJornada,
    desconectado, desdeMin: medidoEn ? Math.max(0, Math.floor((Date.now() - medidoEn) / 60000)) : null,
  }
  const modo = modoDeSilla(datos)
  const { llamado, enFila, enEspera } = partirCola(cola)
  const citaAhora = citaDeAhora(datos)
  const quedan = citasQueQuedan(datos)
  const moneda = negocio?.moneda
  const miNombre = usuario?.nombre?.split(' ')[0] ?? 'Tu barbero'
  const local = negocio?.nombre ?? 'el local'

  // ── acciones ──────────────────────────────────────────────────────────────

  function avisarCambiosDeEspera() {
    if (!sesion?.negocio_id) return
    avisosDeEspera(sesion.negocio_id)
      .then(lista => { for (const a of lista) if (a.cliente_id) avisos.clienteEsperaCambio(a.cliente_id, local, a.minutos, a.se_adelanto) })
      .catch(() => {})   // un push que no sale no puede romperle la fila al barbero
  }

  /** Toda acción pasa por aquí: una a la vez, recarga, y avisa a quien se le
   *  movió la espera. El error se dice con las palabras del servidor. */
  async function op(fn: () => Promise<any>, err = 'No se pudo') {
    if (ocupado) return
    setOcupado(true); setHoja(null)
    try { await fn(); refrescar(); avisarCambiosDeEspera() }
    catch (e: any) { Alert.alert(err, e?.message ?? 'Intenta de nuevo.') }
    finally { setOcupado(false) }
  }

  function llamar() {
    const proximo = enFila[1]
    op(async () => {
      const r: any = await llamarSiguiente(sesion.negocio_id, sesion.perfil_id)
      if (!r) { Alert.alert('No hay a quién llamar', 'Nadie esperando, o tienes una cita confirmada ahora.'); return }
      // «Es tu turno» con el reloj dentro: el mismo expira_at que ve el barbero.
      if (r.cliente_id) {
        const min = r.expira_at ? Math.max(1, Math.round((new Date(r.expira_at).getTime() - Date.now()) / 60000)) : null
        if (min) avisos.clienteTuTurno(r.cliente_id, local, min)
        else enviarPush(r.cliente_id, '¡Es tu turno! 💈', `Te esperan en ${local}.`, { tipo: 'turno' })
      }
      // El que pasa a ser siguiente se entera de que le toca pronto.
      if (proximo?.cliente_id) avisos.clientePrepararse(proximo.cliente_id, local, 0)
      setCola(prev => prev.map(x => x.id === r.id ? { ...x, estado: 'llamado', llamado_at: r.llamado_at, expira_at: r.expira_at } : x))
    }, 'No se pudo llamar')
  }

  /** Cobrar: cierra el turno, que es lo que lo cuenta como visita y dinero.
   *  Con el premio aplicado, el vale se gasta antes de cerrar. */
  function cobrar(item: any, valeId: string | null) {
    op(async () => {
      if (valeId) await aplicarCanje(valeId)
      await actualizarEstadoCola(item.id, 'atendido', { atendido_at: new Date().toISOString() })
      if (item.cliente_id) {
        enviarPush(item.cliente_id, 'Listo ✂️', `Gracias por tu visita a ${local}. Cuéntanos qué tal.`, { tipo: 'atendido' })
        avisarSiPremio(item.cliente_id)
      }
    }, 'No se pudo cerrar')
  }

  /** Si esta visita le completó la tarjeta, se entera ahora y no por sorpresa. */
  async function avisarSiPremio(clienteId: string) {
    try {
      const f = await getFidelidad(sesion.negocio_id, sesion.perfil_id)
      if (!f?.activo) return
      const t: any = await getTarjetaCliente(clienteId, sesion.negocio_id, f.perfil ?? null)
      const disp = (t?.visitas_totales ?? 0) - (t?.visitas_canjeadas ?? 0)
      if (disp >= f.meta) avisos.clientePremio(clienteId, f.premio, local)
    } catch { /* un aviso que no sale no puede romper el cierre de la visita */ }
  }

  function citaAtendida(c: any) {
    // Se pregunta: marcarla atendida es lo que la cuenta como dinero.
    Alert.alert(nombreDe(c), `${c.turno_servicios?.nombre ?? 'Servicio'} de las ${hora12(c.hora_inicio)}. ¿Ya lo atendiste?`, [
      { text: 'Todavía no', style: 'cancel' },
      { text: 'Sí, atendida', onPress: () => op(() => actualizarEstadoCita(c.id, 'atendida', { atendida_at: new Date().toISOString() })) },
    ])
  }
  function citaNoLlego(c: any) {
    Alert.alert('No llegó',
      `${nombreDe(c)} no apareció a las ${hora12(c.hora_inicio)}. Pasa a tu fila con prioridad: si aparece más tarde, entra antes que los demás.`, [
      { text: 'Esperar un poco más', style: 'cancel' },
      { text: 'No llegó', style: 'destructive', onPress: () => op(() => actualizarEstadoCita(c.id, 'no_llego')) },
    ])
  }
  function citaCancelar(c: any) {
    Alert.alert('Cancelar la cita', `La cancelas tú, y ${primerNombre(c)} recibe un aviso.`, [
      { text: 'No', style: 'cancel' },
      { text: 'Cancelarla', style: 'destructive', onPress: () => op(async () => {
        await actualizarEstadoCita(c.id, 'cancelada', { cancelada_by: 'barbero' })
        if (c.cliente_id) avisos.clienteCitaCancelada(c.cliente_id, local, `${fechaLarga(fechaDeISO(c.fecha))} a las ${hora12(c.hora_inicio)}`)
      }) },
    ])
  }
  function recordar(c: any) {
    if (c?.turno_usuarios?.telefono) recordarCita(c.turno_usuarios.telefono, nombreDe(c), c.hora_inicio, local)
  }

  /**
   * SALGO UN MOMENTO. Una pausa con reloj es un bloqueo corto (migración 88:
   * los bloqueos solo quitan disponibilidad) más el descanso, que es lo que
   * cierra la fila a los nuevos. El bloqueo pone la hora de vuelta, que el
   * servidor ya devuelve como `hasta` y el cliente ya sabe enseñar.
   *
   * Si el bloqueo no se puede poner, la pausa sigue —sin hora— y se dice:
   * salir no puede depender de que la hora de vuelta se guarde.
   */
  function salir(min: number | null) {
    op(async () => {
      let hasta: string | null = null
      if (min) {
        const desde = horaAhora().slice(0, 5)
        const fin = sumarMinutos(desde, min)
        try {
          await crearBloqueo({ perfil_id: sesion.perfil_id, fecha: hoy, hora_inicio: desde, hora_fin: fin, motivo: MOTIVO_PAUSA })
          hasta = fin
        } catch {
          Alert.alert('Sin hora de vuelta', 'No se pudo guardar a qué hora vuelves. Quedas en pausa igual, sin hora.')
        }
      }
      await actualizarEstadoPerfil(sesion.perfil_id, 'descanso')
      // Los que esperan se enteran por qué no avanza la fila, y de que su
      // turno no se toca: es el miedo inmediato.
      const cuerpo = hasta
        ? `${miNombre} salió un momento, vuelve sobre las ${hora12(hasta)}. Tu turno sigue en pie.`
        : `${miNombre} salió un momento. Tu turno sigue en pie: te avisamos cuando vuelva.`
      for (const q of [...enFila, ...enEspera]) if (q.cliente_id) enviarPush(q.cliente_id, 'Tu barbero salió un momento', cuerpo, { tipo: 'turno' })
    }, 'No se pudo pausar')
  }
  function yaVolvi() {
    const { activa } = pausaDe(datos)
    op(async () => {
      await actualizarEstadoPerfil(sesion.perfil_id, 'disponible')
      // La pausa con reloj se acorta hasta ahora: si volvió antes, la hora que
      // quedaba no puede seguir tapando su agenda.
      if (activa?.id) await liberarAhora(activa.id).catch(() => {})
    }, 'No se pudo volver')
  }
  function mas10() {
    op(async () => {
      const desde = horaAhora().slice(0, 5)
      await crearBloqueo({ perfil_id: sesion.perfil_id, fecha: hoy, hora_inicio: desde, hora_fin: sumarMinutos(desde, 10), motivo: MOTIVO_PAUSA })
    }, 'No se pudo')
  }

  function sentarSinCita(sv: any, nombre: string) {
    op(async () => {
      const q: any = await atenderSinCita({ negocio_id: sesion.negocio_id, perfil_id: sesion.perfil_id, servicio_id: sv.id, nombre: nombre.trim() || undefined })
      // La RPC devuelve el turno ya sentado: se pinta sin esperar otra vuelta.
      if (q) setCola(prev => [...prev, { ...q, turno_servicios: sv, turno_usuarios: { nombre: nombre.trim() || 'Cliente sin cita' } }])
    }, 'No se pudo sentar')
  }

  async function cambiarLocal(l: any) {
    setHoja(null)
    const ss = await getSesion()
    if (!ss || l.negocio_id === ss.negocio_id) return
    // El panel entero se rehace con el local nuevo (ver el _layout): no hay un
    // momento en que se vea la silla de un local con la fila del otro.
    await guardarSesion({ ...ss, negocio_id: l.negocio_id, perfil_id: l.perfil_id })
  }

  function onAccion(a: Accion) {
    switch (a) {
      case 'llamar': return llamar()
      case 'sinCita': return setHoja({ tipo: 'sinCita' })
      case 'atendiendo': return llamado && op(() => iniciarAtencion(llamado.id))
      case 'mas5': return llamado && op(() => darMasTiempo(llamado.id, 5), 'No se pudo dar más tiempo')
      case 'noEsta': return llamado && setHoja({ tipo: 'noEsta', item: llamado })
      case 'terminar': return llamado && setHoja({ tipo: 'cobrar', item: llamado })
      case 'citaAtendida': return citaAhora && citaAtendida(citaAhora)
      case 'citaNoLlego': return citaAhora && citaNoLlego(citaAhora)
      case 'citaEscribir': return citaAhora && recordar(citaAhora)
      case 'yaVolvi': return yaVolvi()
      case 'mas10': return mas10()
      case 'quitarBloqueo': { const b = bloqueoActual(datos); return b && op(() => liberarAhora(b.id)) }
      case 'renovar': return router.push('/(app)/barbero/config' as any)
    }
  }

  // ── la pantalla ───────────────────────────────────────────────────────────
  if (loading) return (
    <View style={[s.container, { paddingTop: insets.top + 12, paddingHorizontal: 20 }]}><TarjetaEsqueleto /></View>
  )
  if (fallo) return (
    <View style={s.center}><NoCargo que="tu silla" onReintentar={() => { setLoading(true); cargar() }} /></View>
  )

  const enPausa = estado?.estado === 'descanso'

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar() }} />}
        showsVerticalScrollIndicator={false}>

        <TarjetaSilla
          modo={modo} local={negocio?.nombre} variosLocales={locales.length > 1}
          onCambiarLocal={() => setHoja({ tipo: 'local' })}
          onAccion={onAccion} ocupado={ocupado}
          // A quien está llamado o sentado se le llega desde la tarjeta: sus
          // otras salidas —avisarle, devolverlo, se fue— van en su menú.
          mas={llamado && !desconectado ? { texto: `Más de ${primerNombre(llamado)}`, onPress: () => setHoja({ tipo: 'persona', item: llamado }) } : undefined}
        />

        {enFila.length > 0 && (
          <>
            <Seccion titulo={`LA FILA · ${enFila.length}`} />
            {enFila.map((q, i) => (
              <Fila key={q.id} pos={i + 1} q={q} ahoraMs={datos.ahoraMs} onMas={() => setHoja({ tipo: 'persona', item: q })} />
            ))}
          </>
        )}

        {/* DOBLE SERVICIO · los que vienen de otra silla. Sin puesto: su
            turno no depende de la fila sino de que su compañero acabe. */}
        {enEspera.length > 0 && (
          <>
            <Seccion titulo="DESPUÉS DE SU OTRO SERVICIO" />
            {enEspera.map(q => (
              <Fila key={q.id} q={q} ahoraMs={datos.ahoraMs} onMas={() => setHoja({ tipo: 'persona', item: q })} />
            ))}
          </>
        )}

        {quedan.length > 0 && (
          <>
            <Seccion titulo="LO QUE QUEDA HOY" />
            {quedan.map(c => (
              <TouchableOpacity key={c.id} style={s.cita} onPress={() => setHoja({ tipo: 'cita', item: c })} activeOpacity={0.7}>
                <Text style={s.citaHora}>{hora12(c.hora_inicio).replace(/ (AM|PM)$/, '')}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.nombre} numberOfLines={1}>{nombreDe(c)}</Text>
                  <Text style={[s.meta, c.estado !== 'confirmada' && { color: COLORS.warning }]} numberOfLines={1}>
                    {c.turno_servicios?.nombre ?? 'Servicio'} · {c.estado === 'confirmada' ? 'confirmada' : 'sin confirmar'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={COLORS.textLight} />
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* La pausa se ofrece con la silla libre. Pararse con alguien
            sentado o llamado cerraría la fila en mitad de un corte. */}
        {!enPausa && !llamado && !desconectado && (
          <>
            <Seccion titulo="SALGO UN MOMENTO" />
            <View style={s.salgo}>
              {([10, 15, 30, null] as (number | null)[]).map(m => (
                <TouchableOpacity key={String(m)} style={s.salgoBtn} onPress={() => setHoja({ tipo: 'salgo', min: m })}
                  accessibilityRole="button">
                  <Text style={s.salgoT}>{m ? `${m} min` : 'Sin hora'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <HojasSilla
        hoja={hoja} setHoja={setHoja} ocupado={ocupado}
        datos={datos} servicios={servicios} moneda={moneda} sesion={sesion}
        locales={locales} negocioId={sesion?.negocio_id} captaSolo={captaSolo}
        enFila={enFila}
        acciones={{
          cobrar, salir, sentarSinCita, cambiarLocal, citaAtendida, citaNoLlego, citaCancelar, recordar,
          sustituir: (item, w) => op(async () => {
            await sustituirAusente(item.id, w.id)
            if (w.cliente_id) avisos.clientePrepararse(w.cliente_id, local, 0)
          }, 'No se pudo'),
          quitarAusente: item => op(() => marcarNoEsta(item.id), 'No se pudo'),
          cambiarServicio: (item, sv) => op(() => cambiarServicioCola(item.id, sv.id), 'No se pudo cambiar'),
          devolver: item => op(() => devolverAFila(item.id), 'No se pudo devolver'),
          sacar: item => op(() => sacarDeCola(item.id), 'No se pudo sacar'),
          escribir: item => item?.turno_usuarios?.telefono && escribirCliente(item.turno_usuarios.telefono, nombreDe(item)),
          avisar: item => item?.turno_usuarios?.telefono && avisarTurno(item.turno_usuarios.telefono, nombreDe(item), local),
          verFicha: item => setHoja({ tipo: 'ficha', clienteId: item.cliente_id, nombre: nombreDe(item), telefono: item?.turno_usuarios?.telefono, volver: hoja }),
        }}
      />
    </View>
  )
}

function Seccion({ titulo }: { titulo: string }) {
  return (
    <View style={s.sec}>
      <Text style={s.secT}>{titulo}</Text>
      <View style={s.secFilete} />
    </View>
  )
}

/** Una persona de la fila: su puesto, su inicial, lo suyo y su menú. */
function Fila({ pos, q, ahoraMs, onMas }: { pos?: number; q: any; ahoraMs: number; onMas: () => void }) {
  const espera = q.created_at ? Math.max(0, Math.floor((ahoraMs - new Date(q.created_at).getTime()) / 60000)) : null
  const origen = q.tipo_cola === 'fisica' ? null : 'por la app'
  const meta = [q.turno_servicios?.nombre ?? 'Servicio', origen,
    q.estado === 'en_camino' ? 'viene en camino' : espera != null ? `espera ${espera}′` : null].filter(Boolean).join(' · ')
  return (
    <View style={s.fila}>
      <Text style={s.pos}>{pos ?? ''}</Text>
      <View style={s.ini}><Text style={s.iniT}>{nombreDe(q).charAt(0).toUpperCase()}</Text></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.nombreFila}>
          <Text style={s.nombre} numberOfLines={1}>{nombreDe(q)}</Text>
          {/* Quien está aquí es lo que decide si puedes sentar a otro. */}
          {enElLocal(q) && <Text style={[s.chip, { backgroundColor: SOBRE.tinta.fondo, color: SOBRE.tinta.t1 }]}>EN EL LOCAL</Text>}
          {q.prioridad === 1 && <Text style={[s.chip, { backgroundColor: COLORS.blue }]}>TENÍA CITA</Text>}
        </View>
        <Text style={s.meta} numberOfLines={1}>{meta}</Text>
      </View>
      <TouchableOpacity onPress={onMas} hitSlop={10} style={s.mas} accessibilityLabel={`Opciones de ${nombreDe(q)}`}>
        <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.textMid} />
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  sec: { marginTop: 24 },
  secT: { fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 1.2, color: COLORS.ink },
  secFilete: { height: 0, marginTop: 4 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10, backgroundColor: GLASS.fill, borderWidth: 1, borderColor: GLASS.border, borderRadius: GLASS.radioFila, paddingHorizontal: 14, marginBottom: 8 },
  pos: { width: 18, textAlign: 'center', fontFamily: FONTS.monoBold, fontSize: 17, color: COLORS.textLight },
  ini: { width: 40, height: 40, backgroundColor: GLASS.fillStrong, borderWidth: 1, borderColor: GLASS.border, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  iniT: { fontFamily: FONTS.semibold, fontSize: 17, color: COLORS.blue },
  nombreFila: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  nombre: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink, flexShrink: 1 },
  chip: { fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 1.2, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden', borderRadius: 999 },
  meta: { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textMid, marginTop: 2 },
  mas: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  cita: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, backgroundColor: GLASS.fill, borderWidth: 1, borderColor: GLASS.border, borderRadius: GLASS.radioFila, paddingHorizontal: 14, marginBottom: 8 },
  citaHora: { width: 58, fontFamily: FONTS.monoBold, fontSize: 15, color: COLORS.ink },
  salgo: { flexDirection: 'row', gap: 7, marginTop: 12 },
  salgoBtn: { flex: 1, height: 44, borderWidth: 1, borderColor: GLASS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: GLASS.fillStrong, borderRadius: 22 },
  salgoT: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
})
