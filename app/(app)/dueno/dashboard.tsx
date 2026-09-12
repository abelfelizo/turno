import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert, Share, TextInput } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getSesion, guardarSesion } from '../../../lib/storage'
import { getNegocioById, getColaActiva, getSolicitudesPendientes, aprobarPerfil, rechazarPerfil, getEstadisticasNegocio, getPerfilesNegocio, getConfiguracion, asignarCola, getEstadoLocal, getLocalOperativo, invitarBarbero } from '../../../lib/db'
import { enviarPush } from '../../../lib/notificaciones'
import { suscribirCola, desuscribir } from '../../../lib/realtime'
import { dinero, relojesDeSilla } from '../../../lib/format'
import { COLORS, FONTS } from '../../../constants'
import { nombreOficio } from '../../../types'
import { Display, Avatar, PuntoVivo } from '../../../components/ui'
import PanelBadge from '../../../components/panel-badge'
import Hoja from '../../../components/hoja'
import ClientesLocal from '../../../components/clientes-local'

// Los nombres de los oficios viven en types/index.ts (OFICIOS). Aquí había una
// copia con dos entradas, y al añadir masajista y facial se habría quedado
// llamándolas "Barbería" sin dar error.

/** El ámbar de COLORS es para fondo claro (#B45309): sobre el carbón de estas
 *  tarjetas queda en 3:1 y un rótulo de 11px ahí no se lee. Este es el mismo
 *  color subido de tono para el lado oscuro. */
const AMBAR = '#F2B05E'

/** Una línea que diga lo que está pasando en esa silla ahora mismo. */
function estadoTexto(e: any, crudo?: string): string {
  if (!e) return crudo === 'disponible' ? 'Disponible' : 'No aparece'
  const espera = e.en_cola > 0 ? ` · ${e.en_cola} esperando` : ''
  if (e.estado === 'descanso') return 'En descanso · no aparece' + espera
  if (e.estado === 'inactivo') return 'Inactivo · no aparece' + espera
  if (e.estado === 'atendiendo') return (e.cliente ? `Atendiendo a ${e.cliente}` : 'Silla ocupada') + espera
  return 'Libre' + espera
}

export default function Dashboard() {
  const router = useRouter()
  const [negocio, setNegocio] = useState<any>(null)
  // Alquilo asientos: agrupo barberos, no los dirijo. De esto cuelga media
  // pantalla — ver migraciones 92 y 94.
  const esRentado = negocio?.tipo === 'espacios_rentados'
  const [cola, setCola] = useState<any[]>([])
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  // Invitar por código de barbero (migración 110).
  const [invitando, setInvitando] = useState(false)
  const [codigoInv, setCodigoInv] = useState('')
  const [invEnviando, setInvEnviando] = useState(false)
  const [equipo, setEquipo] = useState<any[]>([])
  const [config, setConfig] = useState<any>(null)
  // Estado deducido de cada silla. `estado_actual` del perfil solo dice si la
  // persona acepta clientes; no dice si está ocupada, que es lo que el dueño
  // mira para repartir. turno_estado_local ya lo resolvía y no lo usaba nadie.
  const [estados, setEstados] = useState<Record<string, any>>({})
  // Si la consulta de estados falló, `estados` está vacío por no saber, no por
  // no haber. Sin esta distinción un fallo de red se lee como "nadie ha pagado".
  const [estadosOk, setEstadosOk] = useState(false)
  const [perfilPropio, setPerfilPropio] = useState<string | null>(null)
  const [stats, setStats] = useState<any>(null)
  // ¿Le queda al local alguna silla al día? (migraciones 95 y 96). No decide
  // nada —eso ya lo hace el servidor silla a silla— pero sin esto el dueño se
  // queda mirando un panel apagado sin que nadie le diga por qué.
  const [operativo, setOperativo] = useState(true)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [verClientes, setVerClientes] = useState(false)

  const cargar = useCallback(async () => {
    const ss = await getSesion()
    if (!ss?.negocio_id) { setLoading(false); return }
    setPerfilPropio(ss.perfil_id ?? null)
    const [neg, q, sol, est, st, eq, cfg, op] = await Promise.all([
      getNegocioById(ss.negocio_id),
      getColaActiva(ss.negocio_id).catch(() => []),
      getSolicitudesPendientes(ss.negocio_id).catch(() => []),
      // `null` NO es lo mismo que `[]`: vacío significa "ninguna silla al día" y
      // con eso se apaga el panel. Si la llamada falla no sabemos nada, y
      // apagarlo sería acusar a alguien de no pagar por un fallo de red.
      getEstadoLocal(ss.negocio_id).catch(() => null),
      getEstadisticasNegocio(ss.negocio_id).catch(() => null),
      getPerfilesNegocio(ss.negocio_id).catch(() => []),
      getConfiguracion(ss.negocio_id).catch(() => null),
      // Si esto falla se asume operativo: dejar el panel apagado por un error de
      // red sería contarle al dueño que no ha pagado cuando sí ha pagado.
      getLocalOperativo(ss.negocio_id).catch(() => true),
    ])
    const mapa: Record<string, any> = {}
    for (const e of ((est ?? []) as any[])) mapa[e.perfil_id] = e
    setEstados(mapa); setEstadosOk(est != null); setOperativo(op as boolean)
    setNegocio(neg); setCola(q as any[]); setSolicitudes(sol as any[]); setStats(st); setEquipo(eq as any[]); setConfig(cfg)
    setLoading(false); setRefreshing(false)
  }, [])

  useEffect(() => {
    cargar()
    let sub: any
    getSesion().then(ss => { if (ss?.negocio_id) sub = suscribirCola(ss.negocio_id, () => cargar()) })
    return () => { if (sub) desuscribir(sub) }
  }, [cargar])

  async function aprobar(p: any) {
    try {
      await aprobarPerfil(p.id)
      if (p.usuario_id) enviarPush(p.usuario_id, 'Te aprobaron', `Ya puedes atender en ${negocio?.nombre ?? 'el local'}.`, { tipo: 'agenda' })
      cargar()
    } catch (e: any) { Alert.alert('Error', e.message) }
  }
  /**
   * INVITAR ES LLAMAR, NO METER (migración 110).
   *
   * El servidor puede contestar tres cosas distintas y las tres importan: que
   * el código no es de nadie, que ya le invitaste, o que ya trabaja aquí. Se
   * enseñan tal cual —el mensaje del servidor es el bueno— en vez de un "no se
   * pudo" que obliga a adivinar.
   *
   * El caso feliz tiene DOS finales: si él ya había pedido entrar, tu
   * invitación es el segundo sí y queda dentro de una. Decirlo evita que el
   * dueño se quede esperando una respuesta que ya llegó.
   */
  async function invitar() {
    const cod = codigoInv.trim()
    if (!cod) return
    setInvEnviando(true)
    try {
      const ss = await getSesion()
      if (!ss?.negocio_id) return
      const p: any = await invitarBarbero(ss.negocio_id, cod)
      setInvitando(false); setCodigoInv('')
      if (p?.usuario_id) {
        enviarPush(p.usuario_id, `${negocio?.nombre ?? 'Una barbería'} te invitó`,
          p?.aprobado ? 'Ya estás dentro: abre Turno y empieza.' : 'Abre Turno para aceptar o rechazar.',
          { tipo: 'agenda' })
      }
      Alert.alert(p?.aprobado ? 'Ya está dentro' : 'Invitación enviada',
        p?.aprobado
          ? 'Él ya había pedido entrar, así que con tu sí queda dentro. Aparece en tu equipo.'
          : 'Le llegó el aviso. Entra al local cuando la acepte; hasta entonces no aparece en tu equipo.')
      cargar()
    } catch (e: any) {
      Alert.alert('No se pudo invitar', e.message ?? 'Intenta de nuevo.')
    } finally { setInvEnviando(false) }
  }

  function rechazar(p: any) {
    Alert.alert('Rechazar', `¿Rechazar a ${p.turno_usuarios?.nombre ?? 'este profesional'}?`, [
      { text: 'No' }, { text: 'Sí', style: 'destructive', onPress: async () => { try { await rechazarPerfil(p.id); cargar() } catch (e: any) { Alert.alert('Error', e.message) } } },
    ])
  }
  function asignar(item: any) {
    const opciones = equipo.filter((p: any) => p.tipo_servicio === item.tipo_servicio || !item.tipo_servicio)
    if (opciones.length === 0) { Alert.alert('Sin barberos', 'No hay profesionales activos para asignar.'); return }
    Alert.alert('Asignar a…', `${item.turno_usuarios?.nombre ?? 'Cliente'} · ${item.turno_servicios?.nombre ?? ''}`,
      [...opciones.map((p: any) => ({
        text: p.turno_usuarios?.nombre ?? 'Profesional',
        onPress: async () => { try { await asignarCola(item.id, p.id); cargar() } catch (e: any) { Alert.alert('Error', e.message) } },
      })), { text: 'Cancelar', style: 'cancel' as const }])
  }
  // Cambiar de panel es cambiar la sesión, no solo navegar: si solo navegas,
  // el distintivo sigue diciendo BARBERÍA sobre la pantalla de la silla.
  async function irAMiSilla() {
    const ss = await getSesion(); if (!ss) return
    await guardarSesion({ ...ss, panel: 'silla' })
    router.replace('/(app)/barbero/agenda')
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>

  // Cuánto lleva esperando cada uno. El mismo cálculo que en el panel del
  // barbero: es el número con el que se decide a quién se adelanta.
  const esperaDe = (q: any): number | null => {
    if (!q?.created_at) return null
    const m = Math.floor((Date.now() - new Date(q.created_at).getTime()) / 60000)
    return m > 0 ? m : null
  }

  const esperando = cola.filter(c => c.estado === 'en_fila').length
  const atendiendo = equipo.filter((p: any) => estados[p.id]?.estado === 'atendiendo').length
  const libres = equipo.filter((p: any) => estados[p.id]?.estado === 'libre').length
  const masEspera = cola.filter(c => c.estado === 'en_fila')
    .map(esperaDe).filter((m): m is number => m != null).sort((a, b) => b - a)[0] ?? null
  const sinAsignar = cola.filter(c => c.estado === 'en_fila' && !c.perfil_id).length

  // Una línea, en el orden en que se mira: quién está trabajando, cuánta gente
  // hay y qué es lo que urge. Si nadie espera no se inventa urgencia.
  const resumenLocal = [
    `${atendiendo} atendiendo`,
    libres > 0 ? `${libres} libre${libres === 1 ? '' : 's'}` : null,
    esperando > 0 ? `${esperando} esperando` : 'nadie esperando',
    masEspera && masEspera >= 15 ? `el que más lleva, ${masEspera} min` : null,
    sinAsignar > 0 ? `${sinAsignar} sin asignar` : null,
  ].filter(Boolean).join(' · ')

  const COLOR_SILLA: Record<string, string> = {
    libre: COLORS.success, atendiendo: '#8AB4FF', descanso: COLORS.warning, inactivo: 'rgba(255,255,255,0.35)',
  }
  const sillas = equipo.map((p: any) => {
    const e = estados[p.id]
    // Y a qué hora queda libre (migración 79): el dueño reparte mirando eso.
    const r = e?.estado === 'atendiendo' ? relojesDeSilla(e.desde, e.fin_estimado) : null
    return {
      id: p.id,
      nombre: (p.turno_usuarios?.nombre ?? 'Profesional').split(' ')[0],
      color: COLOR_SILLA[e?.estado ?? 'inactivo'] ?? 'rgba(255,255,255,0.35)',
      detalle: r?.fin ? (r.tarde ? `+${Math.abs(r.faltan ?? 0)} min` : `~${r.fin}`) : null,
      cerrada: e?.fila_abierta === false,
      motivo: e?.fila_motivo ?? null,
    }
  })

  /**
   * EL LOCAL CERRADO, VISTO POR EL DUEÑO (pedido del piloto: «local cerrado, la
   * tarjeta de estado debe ser diferente en dueños y barbero»).
   *
   * Y tiene que ser diferente porque la pregunta es otra. El barbero mira SU
   * silla y lo que necesita es una salida: "sigo abierto un rato". El dueño mira
   * TODAS y lo que necesita es saber si por la app le puede entrar alguien —y si
   * no, por qué—, sin poder decidir por la silla de otro.
   *
   * Aquí no hay botón de alargar a propósito. Desde la migración 88 alargar la
   * jornada INVENTA disponibilidad y por tanto la decide quien manda en el
   * horario de esa silla: en un local de empleados, él; donde alquila asientos,
   * cada barbero. Un botón que a veces funciona y a veces no, según a quién
   * apuntes, enseña peor que no tenerlo. Su propia silla la maneja entera desde
   * "Mi silla", que es donde vive esa decisión.
   */
  const sillasCerradas = sillas.filter((x: any) => x.cerrada)
  const todasCerradas = sillas.length > 0 && sillasCerradas.length === sillas.length
  const motivosCierre = Array.from(new Set(sillasCerradas.map((x: any) => x.motivo).filter(Boolean))) as string[]

  /**
   * EL LOCAL SIN NINGUNA SILLA AL DÍA (migraciones 95 y 96).
   *
   * Dicho desde el teléfono: «una cuenta de dueño necesita al menos un barbero
   * pago para habilitar las funciones de fila; sin eso no puede hacer nada, solo
   * ve la cuenta». Y eso ya ocurre en el servidor: turno_estado_local y
   * turno_filas_abiertas no devuelven esas sillas, y turno_perfil_operable las
   * apaga. El panel se quedaba enseñando la cáscara —chips grises, cero
   * esperando— sin una sola palabra de por qué.
   *
   * Así que aquí NO se decide nada, solo se cuenta lo que ya pasa. Es la
   * diferencia entre un panel apagado y un panel que explica que está apagado.
   *
   * `sinPagar` sale de restar: `equipo` son las sillas vivas y aprobadas, y
   * `estados` son las que ADEMÁS están al día. Lo que sobra es exactamente lo
   * que no se está pagando, sin una consulta más.
   */
  const sinPagar = estadosOk ? equipo.filter((p: any) => !estados[p.id]) : []
  const apagado = estadosOk && !operativo && equipo.length > 0
  const conEmpleados = !esRentado

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: 72, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar() }} />}>
      <PanelBadge />
      <Text style={s.kicker}>Mi local</Text>
      <Display size={30} style={{ marginBottom: 16 }}>{negocio?.nombre ?? 'Mi barbería'}</Display>

      {/* Código de acceso */}
      <View style={s.codeCard}>
        <View style={{ flex: 1 }}>
          <Text style={s.codeLbl}>CÓDIGO DE ACCESO</Text>
          <Text style={s.codeVal}>{negocio?.codigo_acceso ?? '—'}</Text>
          <Text style={s.codeSub}>Compártelo con tu equipo y clientes</Text>
        </View>
        <TouchableOpacity style={s.share} onPress={() => Share.share({ message: `Únete a ${negocio?.nombre} en Turno con el código ${negocio?.codigo_acceso}` })}>
          <Ionicons name="share-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Stats rápidas */}
      <View style={s.metrics}>
        <View style={s.metric}><Text style={s.mNum}>{stats?.atendidosHoy ?? 0}</Text><Text style={s.mLbl}>Atendidos hoy</Text></View>
        <View style={s.metric}><Text style={s.mNum}>{dinero(stats?.ingresosHoy ?? 0, negocio?.moneda)}</Text><Text style={s.mLbl}>Ingresos hoy</Text></View>
      </View>

      {/* ── LA COLA DEL LOCAL ────────────────────────────────────────────────
          Es el mismo cuadro de estado del barbero, pero SUMADO: allí es una
          silla, aquí son todas. Lo que se trae de allá:

          · El punto latiendo, para saber que esto es de ahora y no una captura.
          · Una línea que dice lo que pasa —"2 atendiendo · 5 esperando"— en vez
            de que el dueño lo deduzca de cuatro números.
          · La espera de cada uno en minutos, que es el dato con el que se
            decide a quién adelantar y no estaba en ninguna parte.

          Y lo que se va: el desglose Prioritario / Digital / Físico. Era
          vocabulario del sistema —nadie atiende categorías, se atiende gente en
          orden— y ocupaba la mitad de la tarjeta. Lo único que aportaba, quién
          tenía cita, se queda como etiqueta en su fila.

          Lo que NO tiene el del barbero y aquí manda: de quién es cada cliente.
          Un dueño mirando la fila del local necesita ver qué silla lo va a
          coger, o que no lo va a coger nadie todavía. */}
      {apagado ? (
        /* EL PANEL APAGADO, CONTADO. Sin esto son los mismos chips grises y el
           mismo "nadie en la fila" de un martes tranquilo, y el dueño puede
           pasarse una semana pensando que no le entra gente. */
        <View style={s.apagadoBox}>
          <View style={s.apagadoHead}>
            <Ionicons name="lock-closed-outline" size={16} color={AMBAR} />
            <Text style={s.apagadoT}>LA FILA ESTÁ APAGADA</Text>
          </View>
          <Text style={s.apagadoTxt}>
            {conEmpleados
              ? 'Ninguna silla de tu local está al día, así que por la app no puede entrar nadie: tus barberos no aparecen y la fila digital no funciona. Los datos del negocio siguen siendo tuyos y puedes seguir cambiándolos.'
              : 'Ningún barbero de tu local tiene la suscripción al día, así que ninguno aparece en la app ni recibe fila. Aquí cada uno paga su silla: la tuya la activas tú, la suya ellos.'}
          </Text>
          <Text style={s.apagadoTxt}>
            Lo que ya estaba reservado no se toca: las citas siguen en pie y el
            historial no se pierde. Y quien llegue al local se atiende igual —la
            silla es del barbero—, solo que ese corte no pasa por la app.
          </Text>
          <TouchableOpacity style={s.apagadoBtn} onPress={() => router.push('/(app)/dueno/config')}>
            <Text style={s.apagadoBtnT}>{conEmpleados ? 'Ver mi suscripción' : 'Ver la cuenta del local'}</Text>
            <Ionicons name="chevron-forward" size={17} color={COLORS.ink} />
          </TouchableOpacity>
        </View>
      ) : (
      <View style={s.colaBox}>
        <View style={s.colaHead}>
          <PuntoVivo color="rgba(255,255,255,0.95)" vivo={atendiendo > 0 || cola.length > 0} />
          <View style={{ flex: 1 }}>
            <Text style={s.colaTitle}>COLA DEL LOCAL</Text>
            <Text style={s.colaResumen}>{resumenLocal}</Text>
          </View>
        </View>

        {/* Las sillas, de un vistazo: quién está libre y quién ocupado. La que
            tiene la fila cerrada se marca aparte: puede estar "libre" y no
            entrarle nadie, que es lo que confundía. */}
        {sillas.length > 0 && (
          <View style={s.sillasRow}>
            {sillas.map((x: any) => (
              <View key={x.id} style={[s.sillaChip, x.cerrada && s.sillaChipOff]}>
                <View style={[s.sillaPunto, { backgroundColor: x.color }]} />
                <Text style={s.sillaChipT} numberOfLines={1}>
                  {x.nombre}
                  {x.cerrada
                    ? <Text style={s.sillaChipD}>  sin fila</Text>
                    : x.detalle ? <Text style={s.sillaChipD}>  {x.detalle}</Text> : null}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* EL LOCAL CERRADO PARA LA APP. Lo que el dueño necesita saber y no
            estaba en ninguna parte: si por la fila digital le puede entrar
            alguien ahora mismo, y si no, por qué. Sin botón de alargar — ver la
            nota de arriba: esa decisión es de quien manda en cada horario. */}
        {sillasCerradas.length > 0 && (
          <View style={s.cerradoBox}>
            <Ionicons name="moon-outline" size={15} color="rgba(255,255,255,0.8)" />
            <Text style={s.cerradoT}>
              {todasCerradas
                ? `Nadie puede entrar a la fila digital ahora mismo${motivosCierre.length === 1 ? `: ${motivosCierre[0]}` : '.'}`
                : `${sillasCerradas.length} de ${sillas.length} sillas tienen la fila cerrada.`}
              {' '}Quien llegue al local se atiende igual: la silla es del barbero.
            </Text>
          </View>
        )}

        {cola.length > 0 && (
          <View style={s.colaLista}>
            {cola.map((c: any, i: number) => (
              <View key={c.id} style={s.colaRow}>
                <Text style={s.colaPos}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.colaName}>
                    {c.turno_usuarios?.nombre ?? 'Cliente'}
                    {c.prioridad === 1 ? <Text style={s.colaTag}>  tenía cita</Text> : null}
                  </Text>
                  <Text style={s.colaServ}>
                    {[c.turno_servicios?.nombre ?? 'Servicio',
                      c.turno_perfiles?.turno_usuarios?.nombre ?? 'sin asignar',
                      esperaDe(c) ? `lleva ${esperaDe(c)} min` : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {config?.asignacion_por_dueno && c.estado === 'en_fila'
                  ? <TouchableOpacity style={s.asignar} onPress={() => asignar(c)}><Text style={s.asignarT}>Asignar</Text></TouchableOpacity>
                  : <Text style={[s.colaEstado, c.estado === 'llamado' && { color: COLORS.success }, c.estado === 'en_camino' && { color: '#8AB4FF' }, c.estado === 'atendiendo' && { color: '#8AB4FF' }]}>
                      {c.estado === 'en_fila' ? 'En fila' : c.estado === 'llamado' ? 'Llamado' : c.estado === 'atendiendo' ? 'En la silla' : 'En camino'}
                    </Text>}
              </View>
            ))}
          </View>
        )}
        {cola.length === 0 && (
          <Text style={s.colaVacia}>Nadie en la fila ahora mismo. Cuando un cliente entre —desde la app o como walk-in— aparecerá aquí con su nombre y servicio.</Text>
        )}

        {/* ALGUNAS SÍ Y ALGUNAS NO. El caso que la migración 96 vino a cerrar:
            se paga por N sillas y hay más dadas de alta. Las que sobran no
            aparecen en ninguna parte, y sin esta línea el dueño ve su equipo
            incompleto sin motivo. Va sin nombres: quién es se ve en Equipo, y
            aquí lo que importa es cuántas faltan y por qué. */}
        {sinPagar.length > 0 && (
          <View style={s.cerradoBox}>
            <Ionicons name="alert-circle-outline" size={15} color={AMBAR} />
            <Text style={s.cerradoT}>
              {sinPagar.length === 1 ? 'Una silla no está' : `${sinPagar.length} sillas no están`} al día,
              {sinPagar.length === 1 ? ' así que no aparece' : ' así que no aparecen'} en la app ni
              {sinPagar.length === 1 ? ' recibe' : ' reciben'} fila.
              {' '}{conEmpleados
                ? 'La suscripción del local cubre un número de sillas: las de más antigüedad entran primero.'
                : 'Aquí cada barbero paga la suya.'}
            </Text>
          </View>
        )}
      </View>
      )}

      {/* LOS CLIENTES DEL LOCAL. El dueño no tenía por dónde mirarlos: la
          cartera existía solo en la pestaña del barbero, y desde aquí lo único
          que veía eran nombres pasando por la fila. */}
      <TouchableOpacity style={s.silla} onPress={() => setVerClientes(true)}>
        <View style={[s.sillaIcon, { backgroundColor: COLORS.blue }]}><Ionicons name="people-outline" size={20} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.sillaT}>Clientes del local</Text>
          <Text style={s.sillaD}>Quién viene, cada cuánto y con quién se corta.</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
      </TouchableOpacity>
      <ClientesLocal negocioId={negocio?.id ?? null} moneda={negocio?.moneda} visible={verClientes} onClose={() => setVerClientes(false)} />

      {/* El dueño que atiende llega a su propia silla desde aquí (servicios, horarios) */}
      {perfilPropio && (
        <TouchableOpacity style={s.silla} onPress={irAMiSilla}>
          <View style={s.sillaIcon}><Ionicons name="cut-outline" size={20} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.sillaT}>Mi silla</Text>
            <Text style={s.sillaD}>Tu agenda, tus servicios y tus horarios como barbero.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
        </TouchableOpacity>
      )}

      {/* SOLICITUDES · en los DOS tipos de local desde la migración 110.
          Aquí había una bifurcación: en asientos alquilados esta sección no
          existía, y en su lugar se leía «los barberos entran con tu código y
          empiezan a trabajar solos». Eso era la migración 94, y el dueño del
          producto la corrigió: «barbero y barbería se pueden agregar
          mutuamente, pero requiere aprobación del otro».

          La 94 razonaba que quien no dirige tampoco autoriza. Confundía dos
          cosas: DECIDIR QUIÉN ENTRA EN TU CASA NO ES DIRIGIR A NADIE. El casero
          sigue sin poner precios ni horarios y sin ver lo que su inquilino
          factura — pero el código del local se comparte por WhatsApp, y con la
          94 eso bastaba para aparecer en su escaparate. */}
      <Text style={s.sec}>SOLICITUDES{solicitudes.length ? ` · ${solicitudes.length}` : ''}</Text>
      {solicitudes.length === 0 && <Text style={s.empty}>No hay barberos pendientes de aprobación.</Text>}
      {solicitudes.map((p: any) => (
        <View key={p.id} style={s.sol}>
          <Avatar name={p.turno_usuarios?.nombre} size={44} bg={COLORS.surfaceAlt} color={COLORS.ink} />
          <View style={{ flex: 1 }}>
            <Text style={s.solName}>{p.turno_usuarios?.nombre ?? 'Profesional'}</Text>
            <Text style={s.solMeta}>{nombreOficio(p.tipo_servicio)} · quiere unirse</Text>
          </View>
          <TouchableOpacity style={s.rechazar} onPress={() => rechazar(p)}><Ionicons name="close" size={20} color={COLORS.danger} /></TouchableOpacity>
          <TouchableOpacity style={s.aprobar} onPress={() => aprobar(p)}><Text style={s.aprobarT}>Aprobar</Text></TouchableOpacity>
        </View>
      ))}

      {/* Alta activa: invitar a un barbero con el código del local */}
      <Text style={s.sec}>EQUIPO{equipo.length ? ` · ${equipo.length}` : ''}</Text>
      <TouchableOpacity style={s.agregar} onPress={() => Share.share({
        message: `Únete a ${negocio?.nombre ?? 'mi barbería'} en Turno.\n\nDescarga la app, elige "Soy barbero" y entra con este código:\n\n${negocio?.codigo_acceso}\n\n${esRentado ? 'Rentarías tu asiento: mandas tú en tus precios y tus horarios. Cuando envíes la solicitud te acepto desde mi panel.' : 'Cuando envíes la solicitud te apruebo desde mi panel.'}`,
      })}>
        <View style={s.agregarIcon}><Ionicons name="person-add-outline" size={20} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.agregarT}>Agregar barbero</Text>
          <Text style={s.agregarD}>Comparte el código por WhatsApp. Al solicitar, lo apruebas aquí.</Text>
        </View>
        <Ionicons name="share-outline" size={20} color={COLORS.textLight} />
      </TouchableOpacity>

      {/* LA DIRECCIÓN QUE NO EXISTÍA (migración 110). Compartir el código es
          esperar a que el otro dé el paso; esto es darlo tú. Se invita por su
          CÓDIGO DE BARBERO —único, se lo genera la app al hacerse profesional y
          lo tiene a la vista en su pantalla— y no por teléfono, que permitiría
          ir probando números hasta dar con alguien.

          Invitar no mete a nadie: queda esperando a que él acepte. */}
      <TouchableOpacity style={s.agregar} onPress={() => { setCodigoInv(''); setInvitando(true) }}>
        <View style={[s.agregarIcon, { backgroundColor: COLORS.blue }]}><Ionicons name="search-outline" size={20} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.agregarT}>Invitar con su código</Text>
          <Text style={s.agregarD}>Si ya usa Turno, le llega la invitación y decide él.</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
      </TouchableOpacity>

      {equipo.map((p: any) => (
        <View key={p.id} style={s.sol}>
          <Avatar name={p.turno_usuarios?.nombre} uri={p.turno_usuarios?.foto_url} size={44} bg={COLORS.surfaceAlt} color={COLORS.ink} />
          <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push({
            pathname: '/(app)/dueno/barbero',
            params: { perfil: p.id, nombre: p.turno_usuarios?.nombre ?? 'Barbero', rol: p.rol ?? '' },
          } as any)}>
            <Text style={s.solName}>{p.turno_usuarios?.nombre ?? 'Profesional'}</Text>
            {/* El estado que importa para repartir gente es el DEDUCIDO —si la
                silla está ocupada y cuántos esperan—, no el campo que la persona
                marcó a mano. Antes esta línea decía "Disponible" de alguien que
                llevaba media hora con un cliente sentado. */}
            <Text style={s.solMeta}>
              {p.rol === 'barbero_renta' ? 'Renta su espacio' : p.rol === 'dueno' ? 'Dueño' : 'Empleado'}
              {' · '}
              {/* Suspendido lo dice PRIMERO y con esas palabras: es una decisión
                  del dueño, y verla escrita es lo que le recuerda reanudarlo. */}
              {p.suspendido ? 'Suspendido' : estadoTexto(estados[p.id], p.estado_actual)}
            </Text>
          </TouchableOpacity>
          {/* COMPARTIR SU CÓDIGO, no echarlo. Aquí había un botón rojo de
              desvincular pegado a cada barbero: la acción más destructiva del
              panel, a un toque de distancia y sin nada que la justifique en una
              lista que se mira todos los días. Desvincular vive ahora en su
              ficha, junto a lo demás que se decide sobre esa persona.

              Lo que sí hace falta a diario es esto: el código del barbero es
              como sus clientes lo encuentran, y el dueño es quien lo tiene a
              mano para pasárselo a alguien que pregunta por él. */}
          <TouchableOpacity style={s.compartirCodigo}
            disabled={!p.turno_usuarios?.codigo_barbero}
            onPress={() => Share.share({
              message: `Reserva con ${p.turno_usuarios?.nombre ?? 'nuestro barbero'} en ${negocio?.nombre ?? 'la barbería'}.\n\nDescarga Turno y búscalo con su código de barbero:\n\n${p.turno_usuarios?.codigo_barbero}`,
            })}>
            <Ionicons name="share-outline" size={18} color={COLORS.blue} />
          </TouchableOpacity>
        </View>
      ))}

      <Hoja visible={invitando} onClose={() => setInvitando(false)}>
        <Display size={22}>Invitar con su código</Display>
        <Text style={s.invSub}>
          Cada profesional de Turno tiene un código propio que le sale en su pantalla. Pídeselo y
          escríbelo aquí. Le llega la invitación y decide él: invitar no le mete en el local.
        </Text>
        <TextInput style={s.invInput} value={codigoInv} onChangeText={t => setCodigoInv(t.toUpperCase())}
          placeholder="JUAN-4821" placeholderTextColor={COLORS.textLight}
          autoCapitalize="characters" autoCorrect={false} />
        <TouchableOpacity style={[s.invBtn, (!codigoInv.trim() || invEnviando) && { opacity: 0.45 }]}
          disabled={!codigoInv.trim() || invEnviando} onPress={invitar}>
          {invEnviando ? <ActivityIndicator color="#fff" /> : <Text style={s.invBtnT}>Invitar</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setInvitando(false)}><Text style={s.invCancel}>Cancelar</Text></TouchableOpacity>
      </Hoja>
    </ScrollView>
  )
}


const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  kicker: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textLight, marginBottom: 4 },
  codeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.carbon, borderRadius: 16, padding: 18, marginBottom: 12 },
  codeLbl: { fontFamily: FONTS.bold, fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 },
  codeVal: { fontFamily: FONTS.display, fontSize: 40, color: '#fff', letterSpacing: 3, marginTop: 4 },
  codeSub: { fontFamily: FONTS.medium, fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4 },
  share: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center' },
  metrics: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  metric: { flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 16 },
  mNum: { fontFamily: FONTS.display, fontSize: 30, color: COLORS.ink },
  mLbl: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 4 },
  colaBox: { backgroundColor: COLORS.carbon, borderRadius: 16, padding: 18, marginBottom: 22 },
  // LA TARJETA DEL LOCAL APAGADO (migraciones 95 y 96). Ocupa el sitio de la
  // cola, no se añade encima: si la fila no funciona, enseñar el cuadro de la
  // fila vacío al lado de la explicación es decir dos cosas a la vez. El borde
  // ámbar la separa de una tarjeta normal sin gritar como el rojo de un error:
  // esto no está roto, está sin contratar.
  apagadoBox: { backgroundColor: COLORS.carbon, borderRadius: 16, padding: 18, marginBottom: 22,
    borderWidth: 1, borderColor: 'rgba(242,176,94,0.45)' },
  apagadoHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  apagadoT: { fontFamily: FONTS.bold, fontSize: 11, color: AMBAR, letterSpacing: 1 },
  apagadoTxt: { fontFamily: FONTS.medium, fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 19, marginBottom: 10 },
  apagadoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: '#fff', borderRadius: 12, paddingVertical: 12, marginTop: 2 },
  apagadoBtnT: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.ink },
  colaHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  colaTitle: { fontFamily: FONTS.bold, fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 },
  colaResumen: { fontFamily: FONTS.bold, fontSize: 16, color: '#fff', marginTop: 3 },
  // Las sillas: nombre y un punto de color. Sin números, porque el número de
  // cada silla no se decide desde aquí; lo que se mira es quién puede coger al
  // siguiente.
  sillasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  sillaChipOff: { opacity: 0.55, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  cerradoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12, padding: 11, marginTop: 10 },
  cerradoT: { flex: 1, fontFamily: FONTS.medium, fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 17 },
  sillaChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10, maxWidth: '48%' },
  sillaPunto: { width: 7, height: 7, borderRadius: 4 },
  sillaChipT: { fontFamily: FONTS.bold, fontSize: 12, color: 'rgba(255,255,255,0.9)', flexShrink: 1 },
  sillaChipD: { fontFamily: FONTS.medium, fontSize: 11.5, color: 'rgba(255,255,255,0.6)' },
  colaTag: { fontFamily: FONTS.bold, fontSize: 11, color: COLORS.red },
  colaLista: { marginTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 6 },
  colaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  colaPos: { fontFamily: FONTS.display, fontSize: 20, color: 'rgba(255,255,255,0.4)', width: 24, textAlign: 'center' },
  colaName: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
  colaServ: { fontFamily: FONTS.medium, fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  colaEstado: { fontFamily: FONTS.bold, fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  asignar: { backgroundColor: COLORS.red, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7 },
  asignarT: { fontFamily: FONTS.bold, fontSize: 12, color: '#fff' },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginBottom: 12 },
  empty: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, textAlign: 'center', paddingVertical: 16 },
  sol: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, marginBottom: 8 },
  solName: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  solMeta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  rechazar: { width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.dangerLight, alignItems: 'center', justifyContent: 'center' },
  compartirCodigo: { width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.blueLight, alignItems: 'center', justifyContent: 'center' },
  colaVacia: { fontFamily: FONTS.medium, fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 16, lineHeight: 19 },
  silla: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, marginBottom: 22 },
  sillaIcon: { width: 40, height: 40, borderRadius: 11, backgroundColor: COLORS.carbon, alignItems: 'center', justifyContent: 'center' },
  sillaT: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  sillaD: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  agregar: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderStyle: 'dashed', borderRadius: 14, padding: 14, marginBottom: 10 },
  agregarIcon: { width: 40, height: 40, borderRadius: 11, backgroundColor: COLORS.blue, alignItems: 'center', justifyContent: 'center' },
  agregarT: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  agregarD: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  aprobar: { backgroundColor: COLORS.success, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  aprobarT: { fontFamily: FONTS.bold, fontSize: 13, color: '#fff' },
  invSub: { fontFamily: FONTS.medium, fontSize: 13.5, color: COLORS.textMid, lineHeight: 19, marginTop: 8 },
  invInput: { backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12,
    padding: 14, fontSize: 17, fontFamily: FONTS.bold, color: COLORS.ink, letterSpacing: 1.5, marginTop: 16 },
  invBtn: { backgroundColor: COLORS.red, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 18 },
  invBtnT: { fontFamily: FONTS.bold, fontSize: 16, color: '#fff' },
  invCancel: { fontFamily: FONTS.semibold, textAlign: 'center', color: COLORS.textLight, fontSize: 14, marginTop: 14 },
})
