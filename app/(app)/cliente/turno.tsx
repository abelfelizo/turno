/**
 * MI TURNO. LA PRIMERA PANTALLA, Y LA RAZÓN DE QUE LA APP SE LLAME TURNO.
 *
 * Antes esta pantalla era una lista: el ticket del turno, debajo el catálogo
 * entero de barberos con sus servicios colgando, y entre medias dos botones
 * que volvían a abrir ese mismo catálogo. La decisión principal —¿cuánto
 * falta para lo mío?— competía con veinte precios.
 *
 * Ahora manda UNA TARJETA. Es el único objeto oscuro de la pantalla y funde
 * dos cosas que antes eran dos bloques con dos postes: cómo está la barbería y
 * cómo va tu turno. La regla que lo ordena está escrita en el componente:
 * si tienes turno manda tu turno y el local baja a nota al pie; si no lo
 * tienes, manda el local.
 *
 * Elegir barbero y servicio se fue a una hoja (components/hoja-pedir), y la
 * lista de precios a «Mi barbería», que es donde se va a mirar precios. Aquí
 * solo quedan las puertas.
 *
 * LO QUE SE CARGA SIN `.catch` ES LA LISTA DE TURNOS. Es la más peligrosa de
 * toda la app para tapar: si falla y devuelve vacío, el cliente que ESTÁ en la
 * fila lee que no tiene turno, se va del local y pierde el puesto. Lo demás
 * sí lo lleva — sin el estado de las sillas o sin las citas la pantalla
 * enseña menos, pero lo que enseña es verdad.
 */
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, RefreshControl } from 'react-native'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getSesion } from '../../../lib/storage'
import {
  getMisTurnosActivos, getTurnoExpirado, confirmarCamino, salirDeCola, etaCola, yaLlegue,
  getPerfilesNegocio, getNegocioById, getConfiguracion, puedeConfirmar, getMisCitas, getMiUsuario,
  getRatingsNegocio, getPuesto, getMiPreferido, getEstadoLocal, getResumenFila, getMisNegociosCliente,
  slotsDisponibles,
} from '../../../lib/db'
import { hora12, fechaLarga, fechaDeISO, fechaISOLocal, dinero } from '../../../lib/format'
import { avisos } from '../../../lib/notificaciones'
import { filaAbierta, aceptaCitas } from '../../../lib/atencion'
import { suscribirCola, desuscribir } from '../../../lib/realtime'
import { COLORS, FONTS } from '../../../constants'
import { NoCargo } from '../../../components/ui'
import TarjetaTurno, { TarjetaEsqueleto, soloConCita, type TurnoVivo } from '../../../components/tarjeta-turno'
import HojaPedir, { type Via } from '../../../components/hoja-pedir'
import HojaFila from '../../../components/hoja-fila'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function MiTurno() {
  // El hueco de arriba lo dice el sistema, no un número: en un teléfono con
  // isla dinámica 72 px se quedaban cortos y en uno sin muesca sobraban.
  const insets = useSafeAreaInsets()
  const router = useRouter()
  // Se llega aquí desde la ficha de un barbero en «Mi barbería». Ese toque ya
  // eligió persona: la hoja se abre con él y solo queda el servicio.
  const params = useLocalSearchParams<{ perfil?: string }>()
  const [turnos, setTurnos] = useState<any[]>([])
  const [etas, setEtas] = useState<Record<string, number | null>>({})
  const [puede, setPuede] = useState<Record<string, boolean>>({})
  // El puesto REAL en la fila, no la columna posicion. Ver getPuesto.
  const [puestos, setPuestos] = useState<Record<string, number | null>>({})
  const [expirado, setExpirado] = useState<any>(null)
  const [negocio, setNegocio] = useState<any>(null)
  const [perfiles, setPerfiles] = useState<any[]>([])
  const [sillas, setSillas] = useState<any[]>([])
  const [resumen, setResumen] = useState({ delante: 0, espera_min: 0 })
  const [variosLocales, setVariosLocales] = useState(false)
  // Cuenta recién hecha: todavía no está en ninguna barbería. No es lo mismo
  // que un local sin sillas activas, y la tarjeta enseña otra cosa.
  const [sinLocal, setSinLocal] = useState(false)
  // La última consulta viva no llegó. Lo que se ve es lo de antes y se dice.
  const [desconectado, setDesconectado] = useState(false)
  const [porDueno, setPorDueno] = useState(false)
  // El local puede apagar el doble servicio. La configuración ya se cargaba
  // aquí para `asignacion_por_dueno`; esto sale de la misma fila.
  const [dobleActivo, setDobleActivo] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [fallo, setFallo] = useState(false)
  const [accion, setAccion] = useState<string | null>(null)
  const [via, setVia] = useState<Via | null>(null)
  const [soloPerfil, setSoloPerfil] = useState<string | null>(null)
  const [hoja, setHoja] = useState<any>(null)
  const [citas, setCitas] = useState<any[]>([])
  const [usuarioNombre, setUsuarioNombre] = useState('')
  const [ratings, setRatings] = useState<Record<string, { promedio: number; total: number }>>({})
  // Su barbero de confianza en este local (migración 83). Se marca en «Mi
  // barbería», que es donde está la ficha de cada uno.
  const [preferido, setPreferido] = useState<string | null>(null)
  // El próximo hueco de hoy cuando el local solo trabaja con cita. Ver más
  // abajo: es una consulta aparte porque solo hace falta en ese caso.
  const [hueco, setHueco] = useState<{ hora: string; mio: boolean } | null>(null)
  const [tic, setTic] = useState(0)

  // La ventana de llegada corre desde que el barbero llama (`expira_at`, que lo
  // pone turno_llamar_siguiente). El cliente nunca la vio: leía "es tu turno" y
  // no tenía forma de saber si le sobraban dos minutos o veinte. Se recalcula
  // sola cada 15 s — al minuto no hace falta más precisión y no merece despertar
  // la pantalla cada segundo.
  const quedan: Record<string, number | null> = {}
  void tic
  for (const t of turnos) {
    quedan[t.id] = t.expira_at
      ? Math.max(0, Math.ceil((new Date(t.expira_at).getTime() - Date.now()) / 60000))
      : null
  }
  const hayCuenta = turnos.some((t: any) => t.expira_at && t.estado !== 'atendiendo')
  useEffect(() => {
    if (!hayCuenta) return
    const i = setInterval(() => setTic(x => x + 1), 15000)
    return () => clearInterval(i)
  }, [hayCuenta])

  const cargar = useCallback(async () => {
   try {
    setFallo(false)
    const ss = await getSesion()
    if (!ss?.usuario_id || !ss?.negocio_id) { setSinLocal(true); return }
    setSinLocal(false)
    const [ts, neg, perf, cfg, cts, yo, rt, pref, est, res] = await Promise.all([
      getMisTurnosActivos(ss.usuario_id, ss.negocio_id),
      getNegocioById(ss.negocio_id).catch(() => null),
      getPerfilesNegocio(ss.negocio_id, { soloAlDia: true }).catch(() => []),
      getConfiguracion(ss.negocio_id).catch(() => null),
      // Las citas reservadas también son "mi turno": tenerlas solo en Inicio
      // obligaba a recordar en qué pantalla estaba cada cosa.
      getMisCitas(ss.usuario_id, ss.negocio_id).catch(() => []),
      getMiUsuario().catch(() => null),
      getRatingsNegocio(ss.negocio_id).catch(() => ({})),
      getMiPreferido(ss.negocio_id).catch(() => null),
      getEstadoLocal(ss.negocio_id).catch(() => []),
      getResumenFila(ss.negocio_id).catch(() => ({ delante: 0, espera_min: 0 })),
    ])
    setPreferido(pref as string | null)
    setTurnos(ts as any[]); setNegocio(neg); setPerfiles(perf as any[]); setPorDueno(!!cfg?.asignacion_por_dueno)
    setSillas(est as any[]); setResumen(res as any); setDesconectado(false)
    // Por defecto SÍ, igual que en la base (`coalesce(doble_servicio_activo,
    // true)`): un local sin fila de configuración no es un local que lo haya
    // apagado. Si la consulta falla, `cfg` es null y aquí da falso — en la duda
    // no se ofrece, que es lo mismo que hace el resto de la pantalla.
    setDobleActivo(cfg ? cfg.doble_servicio_activo !== false : false)
    setRatings(rt as any)
    setCitas(cts as any[]); setUsuarioNombre((yo as any)?.nombre ?? '')
    // El nombre del local solo se vuelve conmutador si hay a dónde conmutar.
    // Con un local, una flecha que no lleva a ningún sitio.
    if ((yo as any)?.id) {
      setVariosLocales(((await getMisNegociosCliente((yo as any).id).catch(() => [])) as any[]).length > 1)
    }
    setExpirado((ts as any[]).length === 0 ? await getTurnoExpirado(ss.usuario_id, ss.negocio_id).catch(() => null) : null)
    await calcularEtas(ts as any[])
   } catch {
    setFallo(true)
   } finally {
    setLoading(false); setRefreshing(false)
   }
  }, [])

  /**
   * Iba de uno en uno, con dos `await` en serie por turno. Con la conexión de un
   * móvil eso se nota: cada turno sumaba dos idas y vueltas ENCADENADAS, después
   * de las de arriba. Ahora van todas a la vez.
   */
  const calcularEtas = useCallback(async (ts: any[]) => {
    const res = await Promise.all(ts.map(async (t: any) => ({
      id: t.id,
      eta: t.estado === 'en_fila' ? await etaCola(t.id).catch(() => null) : null,
      puesto: t.estado === 'en_fila' ? await getPuesto(t.id).catch(() => null) : null,
      puede: await puedeConfirmar(t.id).catch(() => false),   // gating R2
    })))
    const map: Record<string, number | null> = {}
    const pmap: Record<string, boolean> = {}
    const qmap: Record<string, number | null> = {}
    for (const r of res) { map[r.id] = r.eta; pmap[r.id] = r.puede; qmap[r.id] = r.puesto }
    setEtas(map); setPuede(pmap); setPuestos(qmap)
  }, [])

  /**
   * Lo que cambia mientras esperas es tu turno, su ETA y la fila del local. El
   * negocio, los barberos, la configuración y tu nombre no cambian porque
   * alguien más entre a la fila, y sin embargo se volvían a pedir con cada
   * evento y cada 60 s.
   */
  const cargarVivo = useCallback(async () => {
    const ss = await getSesion()
    if (!ss?.usuario_id || !ss?.negocio_id) return
    const [ts, cts, est, res] = await Promise.all([
      getMisTurnosActivos(ss.usuario_id, ss.negocio_id).catch(() => []),
      getMisCitas(ss.usuario_id, ss.negocio_id).catch(() => []),
      getEstadoLocal(ss.negocio_id).catch(() => null),
      getResumenFila(ss.negocio_id).catch(() => null),
    ])
    setTurnos(ts as any[]); setCitas(cts as any[])
    // `null` aquí es "no pude preguntar", no "no hay nadie": pisar las sillas
    // con una lista vacía apagaría un local que está abierto. Se conserva lo
    // último que se supo y se marca como viejo — un dato viejo etiquetado
    // sirve, uno viejo disfrazado de fresco manda al cliente al local.
    setDesconectado(!est || !res)
    if (est) setSillas(est as any[])
    if (res) setResumen(res as any)
    setExpirado((ts as any[]).length === 0 ? await getTurnoExpirado(ss.usuario_id, ss.negocio_id).catch(() => null) : null)
    await calcularEtas(ts as any[])
  }, [calcularEtas])

  /**
   * EL PRÓXIMO HUECO, SOLO CUANDO HACE FALTA.
   *
   * Con el local trabajando únicamente con cita, la cifra grande de la tarjeta
   * no tiene espera que enseñar. Enseñaba un guion: verdad inútil, porque deja
   * al cliente con la pregunta entera y le obliga a abrir la agenda para
   * saber a qué hora puede venir.
   *
   * Se pregunta por TU BARBERO primero, y si no tiene nada, por el resto en
   * orden. Las consultas salen a la vez —con cuatro barberos, en serie, eran
   * cuatro idas y vueltas antes de pintar nada— y la prioridad se aplica
   * después, sobre las respuestas.
   *
   * El servicio de referencia es el primero activo de cada uno: los huecos
   * dependen de cuánto dura el servicio, así que hace falta uno para poder
   * preguntar. No se busca el habitual del cliente porque el habitual es de
   * quien lo hace, y aquí todavía no se ha elegido con quién.
   *
   * Solo mira HOY. «Mañana a las nueve» no es una respuesta que merezca la
   * cifra principal: para eso está el botón de reservar, que abre la agenda.
   */
  const soloCitas = soloConCita(sillas as any)
  const hayTurno = turnos.length > 0
  useEffect(() => {
    if (!soloCitas || hayTurno) { setHueco(null); return }
    // Como cualquier `await` dentro de un efecto: si la pantalla se fue o los
    // datos cambiaron mientras la red iba y venía, lo que vuelve ya no vale.
    let vigente = true
    const candidatos = perfiles
      .filter((p: any) => aceptaCitas(p))
      .map((p: any) => ({ p, sv: (p.turno_servicios ?? []).find((x: any) => x.activo) }))
      .filter((c: any) => !!c.sv)
      .sort((a: any, b: any) => (b.p.id === preferido ? 1 : 0) - (a.p.id === preferido ? 1 : 0))
    if (candidatos.length === 0) { setHueco(null); return }
    const hoy = fechaISOLocal()
    Promise.all(candidatos.map((c: any) =>
      slotsDisponibles(c.p.id, hoy, c.sv.id).catch(() => [] as string[])))
      .then(listas => {
        if (!vigente) return
        const i = listas.findIndex(l => l.length > 0)
        setHueco(i < 0 ? null
          : { hora: hora12(listas[i][0]), mio: candidatos[i].p.id === preferido })
      })
    return () => { vigente = false }
  }, [soloCitas, hayTurno, perfiles, preferido])

  // El parámetro se consume UNA vez: sin esto, cada vuelta a la pestaña
  // reabriría la hoja del barbero que se tocó hace media hora.
  const perfilParam = params.perfil
  useEffect(() => {
    if (!perfilParam) return
    setSoloPerfil(perfilParam)
    setVia('fila')
    router.setParams({ perfil: undefined })
  }, [perfilParam])

  // Una acción dispara varios eventos de cola casi a la vez; se agrupan.
  const pendiente = useRef<any>(null)
  const refrescar = useCallback(() => {
    if (pendiente.current) clearTimeout(pendiente.current)
    pendiente.current = setTimeout(() => { pendiente.current = null; cargarVivo() }, 250)
  }, [cargarVivo])
  useEffect(() => () => { if (pendiente.current) clearTimeout(pendiente.current) }, [])

  // Volver a la pantalla recarga: reservar una cita o cambiar de local no
  // dispara ningún evento de cola.
  const yaEnfocado = useRef(false)
  useFocusEffect(useCallback(() => {
    if (!yaEnfocado.current) { yaEnfocado.current = true; return }
    cargarVivo()
  }, [cargarVivo]))

  useEffect(() => {
    cargar()
    let sub: any
    getSesion().then(ss => { if (ss?.negocio_id) sub = suscribirCola(ss.negocio_id, () => refrescar()) })
    // El ETA envejece solo: la silla ocupada se vacía con el reloj, no con un
    // cambio en la base, así que sin este refresco el cliente ve una espera
    // que ya no es cierta.
    const t = setInterval(() => cargarVivo(), 60000)
    return () => { if (sub) desuscribir(sub); clearInterval(t) }
  }, [cargar])

  /**
   * LA RESPUESTA AL "ES TU TURNO" ES UNA SOLA, Y DEPENDE DE DÓNDE ESTÉS.
   *
   * Llamado significa que la silla te espera: lo que hace falta es apagar la
   * cuenta atrás, y eso es «ya llegué». Todavía en la fila, lo útil es avisar
   * de que vienes para que no llamen al siguiente mientras cruzas la calle.
   */
  async function responder(t: any) {
    setAccion(t.id)
    try {
      const barbero = perfiles.find((p: any) => p.id === t.perfil_id)
      if (t.estado === 'llamado' || t.estado === 'en_camino') {
        await yaLlegue(t.id)
        if (barbero?.usuario_id) avisos.barberoYaLlego(barbero.usuario_id, usuarioNombre || 'Tu cliente')
      } else {
        await confirmarCamino(t.id)
        if (barbero?.usuario_id) avisos.barberoVaEnCamino(barbero.usuario_id, usuarioNombre || 'Tu cliente')
      }
      await cargarVivo()
    }
    catch (e: any) { Alert.alert('Error', e.message ?? 'Intenta de nuevo.') } finally { setAccion(null) }
  }

  function salir(t: any) {
    Alert.alert('Salir de la fila digital', '¿Seguro que quieres cancelar este turno?', [
      { text: 'No' },
      { text: 'Sí, salir', style: 'destructive', onPress: async () => {
        setAccion(t.id)
        try { await salirDeCola(t.id); await cargarVivo() }
        catch (e: any) { Alert.alert('Error', e.message ?? 'Intenta de nuevo.') } finally { setAccion(null) }
      } },
    ])
  }

  // E16 · El esqueleto tiene la forma de la tarjeta, así que lo que llega la
  // rellena en vez de sustituirla. Un aro girando no promete nada.
  if (loading) return (
    <View style={s.container}>
      <View style={{ padding: 16, paddingTop: insets.top + 12 }}><TarjetaEsqueleto /></View>
    </View>
  )
  if (fallo) return (
    <View style={s.center}>
      <NoCargo que="tu turno" onReintentar={() => { setLoading(true); cargar() }} />
    </View>
  )

  const abiertos = perfiles.filter((p: any) => filaAbierta(p))
  // Para "cualquiera disponible" hace falta UN servicio de referencia: el turno
  // entra sin barbero, pero sí con servicio (de ahí sale la duración y el ETA).
  const servicioComun = abiertos
    .flatMap((p: any) => (p.turno_servicios ?? []).filter((sv: any) => sv.activo))[0] ?? null

  /**
   * CUÁL DE MIS TURNOS MANDA EN LA TARJETA.
   *
   * Con un doble servicio hay dos vivos a la vez y solo una tarjeta. El que
   * manda no es el más nuevo —`getMisTurnosActivos` ordena por entrada al
   * revés— sino el más urgente: primero el que te están llamando, después el
   * que ya está en la silla, y al final el que espera. El otro baja a una
   * línea debajo, que es exactamente su peso: todavía no es asunto tuyo.
   */
  const PESO: Record<string, number> = { llamado: 0, en_camino: 1, atendiendo: 2, en_fila: 3 }
  const ordenados = [...turnos].sort((a: any, b: any) => {
    const d = (PESO[a.estado] ?? 9) - (PESO[b.estado] ?? 9)
    if (d) return d
    // A igualdad de estado, primero el que no espera a nadie: en un doble
    // servicio el segundo va detrás del primero, y leerlo al revés es leer el
    // futuro antes que el presente.
    return (a.espera_a_id ? 1 : 0) - (b.espera_a_id ? 1 : 0)
  })
  const principal = ordenados[0] ?? null
  const detras = ordenados.slice(1)

  const vivo: TurnoVivo | null = principal ? {
    id: principal.id,
    estado: principal.estado,
    codigo: principal.codigo ?? null,
    servicio: principal.turno_servicios?.nombre ?? null,
    barbero: principal.turno_perfiles?.turno_usuarios?.nombre ?? null,
    perfilId: principal.perfil_id ?? null,
    precio: principal.turno_servicios?.precio != null
      ? dinero(principal.turno_servicios.precio, negocio?.moneda) : null,
    llego: !!principal.llego_at,
  } : null

  // El cerrojo de distancia solo tiene sentido mientras haya algo que
  // responder; ya dentro de la silla no hay botón que apagar.
  const bloqueo = principal && !puede[principal.id]
    && principal.estado !== 'atendiendo' && !principal.llego_at
    ? 'Se activa cuando estés cerca' : null

  function abrir(v: Via) {
    // Con el local repartiendo los turnos no hay barbero que elegir: la hoja
    // enseñaría una lista que no decide nada. Se entra derecho.
    if (v === 'fila' && porDueno) {
      if (!servicioComun || !abiertos.length) {
        Alert.alert('Ahora no se puede entrar', 'Ninguna silla está tomando gente en este momento.')
        return
      }
      setHoja({ negocio, perfil: undefined, servicio: servicioComun })
      return
    }
    setSoloPerfil(null)
    setVia(v)
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar() }} />}>

      {expirado && (
        <View style={s.expirado}>
          <Ionicons name="time-outline" size={20} color={COLORS.red} />
          <View style={{ flex: 1 }}>
            <Text style={s.expT}>Tu turno expiró</Text>
            <Text style={s.expS}>No alcanzaste a llegar en la ventana. Puedes entrar de nuevo desde la tarjeta.</Text>
          </View>
        </View>
      )}

      <TarjetaTurno
        negocio={negocio}
        variosLocales={variosLocales}
        // El conmutador de locales vive en «Mi barbería» y solo ahí: dos
        // implementaciones del mismo selector es como empiezan a divergir.
        onCambiarLocal={() => router.push('/(app)/cliente/barberia')}
        sillas={sillas as any}
        delante={resumen.delante}
        esperaMin={resumen.espera_min}
        desconectado={desconectado}
        sinLocal={sinLocal}
        onAgregarLocal={() => router.push('/(app)/cliente/buscar-barbero')}
        proximoHueco={hueco?.hora ?? null}
        deTuBarbero={!!hueco?.mio}
        turno={vivo}
        puesto={principal ? puestos[principal.id] ?? null : null}
        etaMin={principal ? etas[principal.id] ?? null : null}
        quedanMin={principal ? quedan[principal.id] ?? null : null}
        bloqueo={bloqueo}
        onFila={() => abrir('fila')}
        onAgendar={() => abrir('cita')}
        onVoyEnCamino={() => principal && accion !== principal.id && responder(principal)}
        onCancelar={() => principal && salir(principal)}
      />

      {/* EL SEGUNDO SERVICIO DE LA VISITA. Una línea, no otra tarjeta: todavía
          no te toca, y darle el mismo tamaño haría dudar de cuál de los dos
          es el que corre. */}
      {detras.map((t: any) => (
        <View key={t.id} style={s.detras}>
          <Ionicons name="return-down-forward-outline" size={17} color={COLORS.textMid} />
          <View style={{ flex: 1 }}>
            <Text style={s.detrasT}>Después: {t.turno_servicios?.nombre ?? 'tu otro servicio'}</Text>
            <Text style={s.detrasM}>
              {t.turno_perfiles?.turno_usuarios?.nombre ?? 'Sin asignar'}
              {t.turno_servicios?.duracion_min ? ` · ${t.turno_servicios.duracion_min} min` : ''}
            </Text>
          </View>
          <TouchableOpacity onPress={() => salir(t)} hitSlop={8} disabled={accion === t.id}>
            <Text style={s.detrasX}>Quitar</Text>
          </TouchableOpacity>
        </View>
      ))}

      {citas.length > 0 && (
        <>
          <Text style={s.sec}>TUS CITAS RESERVADAS</Text>
          {citas.map((c: any) => (
            <View key={c.id} style={s.cita}>
              <View style={s.citaFecha}>
                <Text style={s.citaDia}>{fechaDeISO(c.fecha).getDate()}</Text>
                <Text style={s.citaMes}>
                  {fechaDeISO(c.fecha).toLocaleDateString('es', { month: 'short' }).replace('.', '').toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.citaServ}>{c.turno_servicios?.nombre ?? 'Servicio'}</Text>
                <Text style={s.citaMeta}>
                  {hora12(c.hora_inicio)} · {c.turno_perfiles?.turno_usuarios?.nombre ?? 'Sin asignar'}
                </Text>
                <Text style={s.citaDia2}>{fechaLarga(fechaDeISO(c.fecha))}</Text>
              </View>
            </View>
          ))}
        </>
      )}

      {/* ASIGNACIÓN POR DUEÑO. La configuración existe desde el principio y
          esta pantalla la cargaba… y no la usaba: el cliente elegía barbero
          igual, en un local donde el dueño ha dicho que reparte él. Con ella
          encendida la hoja de elegir ni se abre, y se dice por qué en vez de
          dejar al cliente preguntándose qué pasó. */}
      {porDueno && (
        <Text style={s.nota}>Aquí el local reparte los turnos: te toca el barbero que se desocupe.</Text>
      )}

      {/* Elegir con quién y qué. La misma hoja para las dos vías: lo que
          cambia es quién puede salir en ella. */}
      <HojaPedir
        via={via ?? 'fila'}
        visible={!!via}
        onClose={() => { setVia(null); setSoloPerfil(null) }}
        negocio={negocio}
        perfiles={perfiles}
        ratings={ratings}
        preferido={preferido}
        soloPerfil={soloPerfil}
        onCualquiera={servicioComun ? () => { setVia(null); setSoloPerfil(null); setHoja({ negocio, perfil: undefined, servicio: servicioComun }) } : undefined}
        onElegir={(p, sv) => {
          const v = via
          setVia(null); setSoloPerfil(null)
          if (v === 'fila') setHoja({ negocio, perfil: p, servicio: sv })
          // La agenda necesita su propia pantalla: hay que elegir día y hora,
          // y eso no cabe en una hoja encima de otra hoja.
          else router.push({ pathname: '/(app)/cliente/agendar', params: { perfil: p.id, servicio: sv.id } })
        }}
      />

      <HojaFila seleccion={hoja} visible={!!hoja} onClose={() => setHoja(null)} onEntrado={() => { setHoja(null); cargarVivo() }}
        abiertos={abiertos} dobleActivo={dobleActivo} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },

  expirado: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderColor: COLORS.red, padding: 13, marginBottom: 14 },
  expT: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.red },
  expS: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textMid, marginTop: 2, lineHeight: 17 },

  detras: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 13, paddingHorizontal: 13,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 10 },
  detrasT: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.ink },
  detrasM: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textMid, marginTop: 2 },
  detrasX: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.danger },

  nota: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.textMid, marginTop: 14, lineHeight: 18 },

  sec: { fontFamily: FONTS.bold, fontSize: 11, color: COLORS.textLight, letterSpacing: 2, textTransform: 'uppercase',
    borderBottomWidth: 2, borderBottomColor: COLORS.ink, paddingBottom: 8, marginTop: 20, marginBottom: 4 },
  cita: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  citaFecha: { width: 52, height: 52, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  citaDia: { fontFamily: FONTS.display, fontSize: 21, color: COLORS.ink },
  citaMes: { fontFamily: FONTS.bold, fontSize: 9.5, color: COLORS.textLight, letterSpacing: 1.2 },
  citaServ: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  citaMeta: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.red, marginTop: 2 },
  citaDia2: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 1, textTransform: 'capitalize' },
})
