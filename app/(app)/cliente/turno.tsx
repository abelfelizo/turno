import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, RefreshControl } from 'react-native'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getSesion } from '../../../lib/storage'
import {
  getMisTurnosActivos, getTurnoExpirado, confirmarCamino, salirDeCola, etaCola, yaLlegue,
  getPerfilesNegocio, getNegocioById, getConfiguracion, puedeConfirmar, getMisCitas, getMiUsuario,
  getRatingsNegocio, getPuesto, getMiPreferido, marcarPreferido,
} from '../../../lib/db'
import { hora12, fechaLarga, fechaDeISO } from '../../../lib/format'
import { avisos } from '../../../lib/notificaciones'
import { aceptaFila, filaAbierta, fraseFila } from '../../../lib/atencion'
import { suscribirCola, desuscribir } from '../../../lib/realtime'
import { dinero } from '../../../lib/format'
import { COLORS, FONTS } from '../../../constants'
import { Display, Avatar } from '../../../components/ui'
import HojaFila from '../../../components/hoja-fila'
import Resenas from '../../../components/resenas'

export default function MiTurno() {
  const [turnos, setTurnos] = useState<any[]>([])
  const [etas, setEtas] = useState<Record<string, number | null>>({})
  const [puede, setPuede] = useState<Record<string, boolean>>({})
  // El puesto REAL en la fila, no la columna posicion. Ver getPuesto.
  const [puestos, setPuestos] = useState<Record<string, number | null>>({})
  const [expirado, setExpirado] = useState<any>(null)
  const [negocio, setNegocio] = useState<any>(null)
  const [perfiles, setPerfiles] = useState<any[]>([])
  const [porDueno, setPorDueno] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [accion, setAccion] = useState<string | null>(null)
  const [hoja, setHoja] = useState<any>(null)
  const [citas, setCitas] = useState<any[]>([])
  const [usuarioNombre, setUsuarioNombre] = useState('')
  // Especialidad y estrellas: estaban en Inicio, dentro del catálogo que se
  // quitó. Van donde se elige de verdad — aquí — porque son exactamente lo que
  // se mira para decidir con quién te sientas.
  const [ratings, setRatings] = useState<Record<string, { promedio: number; total: number }>>({})
  const [resenasDe, setResenasDe] = useState<{ id: string; nombre?: string } | null>(null)
  // Su barbero de confianza en este local (migración 83).
  const [preferido, setPreferido] = useState<string | null>(null)
  const [negocioId, setNegocioId] = useState<string | null>(null)
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
    const ss = await getSesion()
    if (!ss?.usuario_id || !ss?.negocio_id) { setLoading(false); return }
    const [ts, neg, perf, cfg, cts, yo, rt, pref] = await Promise.all([
      getMisTurnosActivos(ss.usuario_id, ss.negocio_id).catch(() => []),
      getNegocioById(ss.negocio_id).catch(() => null),
      getPerfilesNegocio(ss.negocio_id).catch(() => []),
      getConfiguracion(ss.negocio_id).catch(() => null),
      // Las citas reservadas también son "mi turno": tenerlas solo en Inicio
      // obligaba a recordar en qué pantalla estaba cada cosa.
      getMisCitas(ss.usuario_id, ss.negocio_id).catch(() => []),
      getMiUsuario().catch(() => null),
      getRatingsNegocio(ss.negocio_id).catch(() => ({})),
      getMiPreferido(ss.negocio_id).catch(() => null),
    ])
    setNegocioId(ss.negocio_id)
    setPreferido(pref as string | null)
    setTurnos(ts as any[]); setNegocio(neg); setPerfiles(perf as any[]); setPorDueno(!!cfg?.asignacion_por_dueno)
    setRatings(rt as any)
    setCitas(cts as any[]); setUsuarioNombre((yo as any)?.nombre ?? '')
    setExpirado((ts as any[]).length === 0 ? await getTurnoExpirado(ss.usuario_id, ss.negocio_id).catch(() => null) : null)
    await calcularEtas(ts as any[])
    setLoading(false); setRefreshing(false)
  }, [])

  /**
   * Iba de uno en uno, con dos `await` en serie por turno. Con la conexión de un
   * móvil eso se nota: cada turno sumaba dos idas y vueltas ENCADENADAS, después
   * de las seis de arriba. Ahora van todas a la vez.
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
   * Lo que cambia mientras esperas es tu turno y su ETA. El negocio, los
   * barberos, la configuración y tu nombre no cambian porque alguien más entre a
   * la fila, y sin embargo se volvían a pedir con cada evento y cada 60 s.
   */
  const cargarVivo = useCallback(async () => {
    const ss = await getSesion()
    if (!ss?.usuario_id || !ss?.negocio_id) return
    const [ts, cts] = await Promise.all([
      getMisTurnosActivos(ss.usuario_id, ss.negocio_id).catch(() => []),
      getMisCitas(ss.usuario_id, ss.negocio_id).catch(() => []),
    ])
    setTurnos(ts as any[]); setCitas(cts as any[])
    setExpirado((ts as any[]).length === 0 ? await getTurnoExpirado(ss.usuario_id, ss.negocio_id).catch(() => null) : null)
    await calcularEtas(ts as any[])
  }, [calcularEtas])

  // Una acción dispara varios eventos de cola casi a la vez; se agrupan.
  const pendiente = useRef<any>(null)
  const refrescar = useCallback(() => {
    if (pendiente.current) clearTimeout(pendiente.current)
    pendiente.current = setTimeout(() => { pendiente.current = null; cargarVivo() }, 250)
  }, [cargarVivo])
  useEffect(() => () => { if (pendiente.current) clearTimeout(pendiente.current) }, [])

  // Igual que en Inicio: volver a la pantalla recarga. Aquí también viven las
  // citas, y reservar una no dispara ningún evento de cola.
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
    // El ETA envejece solo aunque no pase nada en el servidor.
    const t = setInterval(() => cargarVivo(), 60000)
    return () => { if (sub) desuscribir(sub); clearInterval(t) }
  }, [cargar])

  async function voy(t: any) {
    setAccion(t.id)
    try {
      await confirmarCamino(t.id)
      // El barbero necesita saber que viene en camino para no llamar al
      // siguiente mientras este cruza la calle.
      const barbero = perfiles.find((p: any) => p.id === t.perfil_id)
      if (barbero?.usuario_id) avisos.barberoVaEnCamino(barbero.usuario_id, usuarioNombre || 'Tu cliente')
      await cargarVivo()
    }
    catch (e: any) { Alert.alert('Error', e.message ?? 'Intenta de nuevo.') } finally { setAccion(null) }
  }
  /**
   * "Estoy aquí" no es un "voy en camino" más entusiasta: apaga la cuenta atrás
   * de la ventana de llegada. Ese reloj existe para el que no aparece, y quien
   * está de pie en el local ya apareció — perder el turno ahí sería absurdo.
   */
  async function llegue(t: any) {
    setAccion(t.id)
    try {
      await yaLlegue(t.id)
      const barbero = perfiles.find((p: any) => p.id === t.perfil_id)
      if (barbero?.usuario_id) avisos.barberoYaLlego(barbero.usuario_id, usuarioNombre || 'Tu cliente')
      await cargarVivo()
    }
    catch (e: any) { Alert.alert('Error', e.message ?? 'Intenta de nuevo.') } finally { setAccion(null) }
  }
  /**
   * MARCAR A MI BARBERO. Un toque en la estrella, sin pantalla intermedia: es
   * una preferencia, no una configuración, y se cambia el día que te cambias de
   * barbero. Se guarda en el acto y se refleja aquí mismo.
   */
  async function alternarPreferido(p: any) {
    if (!negocioId) return
    const nuevo = preferido === p.id ? null : p.id
    setPreferido(nuevo)                       // optimista: el toque se ve al instante
    try { await marcarPreferido(negocioId, nuevo) }
    catch (e: any) {
      setPreferido(preferido)                 // se deshace si el servidor dice que no
      Alert.alert('No se pudo guardar', e.message ?? 'Intenta de nuevo.')
    }
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

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>

  // Para "cualquiera disponible" hace falta UN servicio de referencia: el turno
  // entra sin barbero, pero sí con servicio (de ahí sale la duración y el ETA).
  // Se coge el primero activo de quien esté aceptando; si un día hay que dejar
  // elegir servicio primero, este es el punto por donde crece.
  // Quien trabaja SOLO CON CITA no tiene fila: ofrecerle un turno al cliente
  // sería mandarlo a un error, porque turno_entrar_a_cola lo rechaza.
  //
  // Los DEMÁS salen todos, abiertos o no. Antes se filtraba por
  // estado_actual === 'disponible' y el barbero desaparecía sin más; ahora el
  // que está cerrado se queda a la vista, apagado y CON EL MOTIVO —"abre de
  // 09:00 a 18:00"—, que es justo lo que el cliente necesita saber. El motivo
  // lo da el servidor (migración 74) con las mismas palabras que usaría para
  // rechazar el turno: el letrero y la puerta dicen lo mismo.
  const conFila = perfiles.filter((p: any) => aceptaFila(p))
  const abiertos = conFila.filter((p: any) => filaAbierta(p))
  const servicioComun = abiertos
    .flatMap((p: any) => (p.turno_servicios ?? []).filter((sv: any) => sv.activo))[0] ?? null

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: 60, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar() }} />}>
      <Display size={26} style={{ marginBottom: 18 }}>Mi turno</Display>

      {expirado && (
        <View style={s.expirado}>
          <Ionicons name="time-outline" size={20} color={COLORS.red} />
          <View style={{ flex: 1 }}>
            <Text style={s.expT}>Tu turno expiró</Text>
            <Text style={s.expS}>No alcanzaste a llegar en la ventana. Puedes entrar de nuevo abajo.</Text>
          </View>
        </View>
      )}

      {turnos.map((t: any) => {
        const llamado = t.estado === 'llamado'
        const enCamino = t.estado === 'en_camino'
        const atendiendo = t.estado === 'atendiendo'
        const heroBg = atendiendo ? COLORS.blue : llamado ? COLORS.success : enCamino ? COLORS.blue : COLORS.carbon
        return (
          <View key={t.id} style={s.turnoCard}>
            <View style={[s.hero, { backgroundColor: heroBg }]}>
              {/* EL PUESTO, no la columna `posicion`. Con un walk-in en la
                  silla, aquí salía un 2 siendo el siguiente: `posicion` es el
                  contador de entrada y cuenta al que ya está sentado. */}
              {t.estado === 'en_fila' && (<>
                <Text style={s.heroNum}>{puestos[t.id] ?? '—'}</Text>
                <Text style={s.heroLabel}>
                  {puestos[t.id] === 1 ? 'eres el siguiente' : 'tu puesto en la fila digital'}
                </Text>
                {etas[t.id] != null && <View style={s.etaPill}><Text style={s.etaT}>≈ {etas[t.id]} min de espera</Text></View>}
              </>)}
              {/* El mismo reloj que ve el barbero. Sin el número, "es tu turno"
                  no le dice a nadie si puede terminarse el café. */}
              {llamado && (() => {
                const min = quedan[t.id]
                return (<>
                  <Text style={s.heroBig}>¡Es tu turno!</Text>
                  <Text style={s.heroLabel}>
                    {min == null ? 'Ve al local ahora'
                      : min > 0 ? `Te esperan ${min} min más`
                      : 'Se te pasó el tiempo — avisa que ya llegas'}
                  </Text>
                </>)
              })()}
              {enCamino && (<>
                <Text style={s.heroBig}>{t.llego_at ? 'Ya llegaste' : 'Vas en camino'}</Text>
                <Text style={s.heroLabel}>{t.llego_at ? 'El barbero ya lo sabe' : 'El barbero te espera'}</Text>
              </>)}
              {atendiendo && (<><Text style={s.heroBig}>Te están atendiendo</Text><Text style={s.heroLabel}>Disfruta tu corte ✂️</Text></>)}
            </View>
            <View style={s.detalle}>
              <Text style={s.dServ}>{t.turno_servicios?.nombre}</Text>
              <Text style={s.dMeta}>{t.turno_perfiles?.turno_usuarios?.nombre ?? 'Sin asignar'} · {t.turno_servicios?.duracion_min ?? '—'} min · {t.estado.replace('_', ' ')}</Text>
            </View>
            {/* Las dos respuestas al "es tu turno". Antes solo estaba "voy en
                camino", que no sirve para quien YA está en la puerta: tenía que
                decir que venía de camino estando dentro, y el reloj le seguía
                corriendo igual. */}
            <View style={s.acciones}>
              {/* Ya dijo que está aquí: no quedan respuestas que dar, y dejar el
                  hueco vacío al lado de "Salir" descuadra la fila de botones. */}
              {!atendiendo && (t.estado === 'en_fila' || llamado || enCamino) && !t.llego_at && (
                puede[t.id]
                  ? <View style={s.respuestas}>
                      <TouchableOpacity style={s.cta} onPress={() => llegue(t)} disabled={accion === t.id}>
                        {accion === t.id ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaT}>Ya estoy aquí</Text>}
                      </TouchableOpacity>
                      {!enCamino && (
                        <TouchableOpacity style={s.ctaSec} onPress={() => voy(t)} disabled={accion === t.id}>
                          <Text style={s.ctaSecT}>Voy en camino</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  : <View style={s.ctaOff}><Ionicons name="lock-closed" size={14} color={COLORS.textLight} /><Text style={s.ctaOffT}>Se activa cuando estés cerca</Text></View>
              )}
              {!atendiendo && t.llego_at && (
                <View style={s.yaAqui}>
                  <Ionicons name="checkmark-circle" size={15} color={COLORS.success} />
                  <Text style={s.yaAquiT}>El barbero sabe que estás aquí</Text>
                </View>
              )}
              {!atendiendo && <TouchableOpacity style={s.salir} onPress={() => salir(t)} disabled={accion === t.id}><Text style={s.salirT}>Salir</Text></TouchableOpacity>}
            </View>
          </View>
        )
      })}

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

      {/* Pedir un turno desde aquí mismo (R3) */}
      {/* "FILA DIGITAL" con todas las letras. Aquí decía solo "pedir un turno",
          y en el local hay dos filas: la de la app y la gente sentada en el
          banco. Nombrarla es lo que deja claro cuál de las dos es esta. */}
      <Text style={s.sec}>{turnos.length ? 'ENTRAR OTRA VEZ A LA FILA DIGITAL' : 'ENTRAR A LA FILA DIGITAL'}</Text>
      {perfiles.length === 0 && <Text style={s.empty}>No hay profesionales disponibles ahora.</Text>}

      {/* ELEGIR BARBERO ES DEL CLIENTE, SIEMPRE.
          Antes era todo o nada: con "asignación por dueño" encendida el cliente
          NUNCA elegía, y apagada elegía siempre a la fuerza. No había forma de
          decir "me da igual, el que esté libre", que es lo más normal en una
          barbería. Ahora se elige a quien se quiera, y quien no tenga
          preferencia entra sin barbero asignado: lo coge el que se desocupe, o
          se lo asigna el dueño desde su panel. */}
      {perfiles.length > 0 && (
        <>
          {/* Sin nadie abierto esto no es "cualquiera disponible": es un botón
              que va a dar error. Se apaga y lo dice. */}
          <TouchableOpacity style={[s.cualquiera, !abiertos.length && s.barberoCerrado]}
            onPress={() => setHoja({ negocio, perfil: undefined, servicio: servicioComun })}
            disabled={!servicioComun || !abiertos.length}>
            <Ionicons name="people-outline" size={20} color={COLORS.ink} />
            <View style={{ flex: 1 }}>
              <Text style={s.cualquieraT}>Cualquiera disponible</Text>
              <Text style={s.cualquieraD}>
                {!abiertos.length ? 'Ahora mismo no hay nadie abierto en el local'
                  : preferido && conFila.some((p: any) => p.id === preferido && filaAbierta(p))
                    ? `Te ponemos con ${conFila.find((p: any) => p.id === preferido)?.turno_usuarios?.nombre ?? 'tu barbero'}, que está abierto`
                    : 'Te atiende el primero que se desocupe'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
          </TouchableOpacity>
          {/* ASIGNACIÓN POR DUEÑO. La configuración existe desde el principio
              y esta pantalla la cargaba en `porDueno`… y no la usaba: el
              cliente elegía barbero igual, en un local donde el dueño ha dicho
              que reparte él. Otra regla que solo vivía en la pantalla del que
              la puso. Con ella encendida solo queda una puerta, y se dice por
              qué en vez de esconder la lista sin explicación. */}
          {porDueno
            ? <Text style={s.oElige}>Aquí el local reparte los turnos: te toca el barbero que se desocupe.</Text>
            : <Text style={s.oElige}>o elige a tu barbero</Text>}
        </>
      )}

      {!porDueno && conFila.map((p: any) => {
            const abierta = filaAbierta(p)
            const motivo = fraseFila(p)
            return (
            <View key={p.id} style={[s.barbero, !abierta && s.barberoCerrado]}>
              <View style={s.barberoHead}>
                <Avatar name={p.turno_usuarios?.nombre} uri={p.turno_usuarios?.foto_url} size={38} />
                <View style={{ flex: 1 }}>
                  <Text style={s.barberoN}>{p.turno_usuarios?.nombre ?? 'Profesional'}</Text>
                  {!abierta && !!motivo
                    ? <Text style={s.barberoCerradoT}>{motivo}</Text>
                    : (() => {
                        const r = ratings[p.id]
                        const linea = [p.turno_usuarios?.especialidad,
                          r ? `★ ${r.promedio} (${r.total})` : 'Sin reseñas'].filter(Boolean).join(' · ')
                        // Las estrellas se tocan: hasta ahora eran un número
                        // suelto y lo que la gente escribió no se leía en
                        // ningún sitio.
                        return (
                          <TouchableOpacity onPress={() => setResenasDe({ id: p.id, nombre: p.turno_usuarios?.nombre })}>
                            <Text style={s.barberoMeta}>{linea}{r ? '  ·  ver reseñas' : ''}</Text>
                          </TouchableOpacity>
                        )
                      })()}
                </View>
                {/* MI BARBERO. La estrella es la relación que sostiene una
                    barbería —"voy donde Abel"— y hasta ahora la app no sabía
                    nada de ella: cada turno había que volver a buscarlo en la
                    lista. Marcado, "cualquiera disponible" lo intenta a él. */}
                <TouchableOpacity style={s.estrella} onPress={() => alternarPreferido(p)} hitSlop={10}>
                  <Ionicons name={preferido === p.id ? 'star' : 'star-outline'} size={20}
                    color={preferido === p.id ? COLORS.red : COLORS.textLight} />
                </TouchableOpacity>
              </View>
              {preferido === p.id && <Text style={s.esMio}>Tu barbero · te lo asignamos cuando pidas turno</Text>}
              {abierta && (p.turno_servicios ?? []).filter((sv: any) => sv.activo).map((sv: any) => (
                <TouchableOpacity key={sv.id} style={s.servRow} onPress={() => setHoja({ negocio, perfil: p, servicio: sv })}>
                  <Text style={s.servN}>{sv.nombre} · {sv.duracion_min} min</Text>
                  <Text style={s.servP}>{dinero(sv.precio, negocio?.moneda)}</Text>
                </TouchableOpacity>))}
            </View>)})}

      <Resenas perfilId={resenasDe?.id ?? null} nombre={resenasDe?.nombre} visible={!!resenasDe} onClose={() => setResenasDe(null)} />

      <HojaFila seleccion={hoja} visible={!!hoja} onClose={() => setHoja(null)} onEntrado={() => { setHoja(null); cargarVivo() }} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  cualquiera: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  cualquieraT: { color: COLORS.ink, fontSize: 15, fontWeight: '700' },
  cualquieraD: { color: COLORS.textMid, fontSize: 12.5, marginTop: 2 },
  oElige: { color: COLORS.textLight, fontSize: 12, textAlign: 'center', marginBottom: 10 },
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  cita: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, marginBottom: 8 },
  citaFecha: { width: 52, height: 52, borderRadius: 12, backgroundColor: COLORS.carbon, alignItems: 'center', justifyContent: 'center' },
  citaDia: { fontFamily: FONTS.display, fontSize: 20, color: '#fff' },
  citaMes: { fontFamily: FONTS.bold, fontSize: 9, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.5 },
  citaServ: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  citaMeta: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.red, marginTop: 2 },
  citaDia2: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 1, textTransform: 'capitalize' },
  expirado: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.redLight, borderRadius: 14, padding: 14, marginBottom: 16 },
  expT: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.red },
  expS: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textMid, marginTop: 2 },
  turnoCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 18, padding: 12, marginBottom: 14 },
  hero: { borderRadius: 14, padding: 24, alignItems: 'center', marginBottom: 10 },
  heroNum: { fontFamily: FONTS.display, fontSize: 68, color: COLORS.red, lineHeight: 72 },
  heroLabel: { fontFamily: FONTS.medium, fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 4 },
  heroBig: { fontFamily: FONTS.display, fontSize: 32, color: '#fff' },
  etaPill: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginTop: 10 },
  etaT: { fontFamily: FONTS.bold, fontSize: 14, color: '#fff' },
  detalle: { paddingHorizontal: 6, marginBottom: 10 },
  dServ: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.ink },
  dMeta: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textLight, marginTop: 2, textTransform: 'capitalize' },
  acciones: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  // "Ya estoy aquí" es la respuesta que cierra el asunto —apaga el reloj— así
  // que se lleva el botón lleno; "voy en camino" queda de secundaria.
  respuestas: { flex: 1, gap: 8 },
  cta: { backgroundColor: COLORS.red, borderRadius: 12, padding: 14, alignItems: 'center' },
  ctaT: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
  ctaSec: { borderRadius: 12, padding: 13, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.border },
  ctaSecT: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.textMid },
  yaAqui: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: COLORS.successLight, borderRadius: 12, padding: 14 },
  yaAquiT: { fontFamily: FONTS.bold, fontSize: 13.5, color: COLORS.ink },
  ctaOff: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.surfaceAlt, borderRadius: 12, padding: 14 },
  ctaOffT: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textLight },
  salir: { padding: 14, alignItems: 'center' },
  salirT: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.danger },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginTop: 8, marginBottom: 12 },
  empty: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, paddingVertical: 12 },
  barbero: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, marginBottom: 10 },
  barberoHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  barberoN: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  // Cerrado se ve apagado, no escondido: el cliente tiene que poder leer a qué
  // hora abre sin salir de la pantalla.
  barberoCerrado: { opacity: 0.55, backgroundColor: COLORS.bg },
  barberoCerradoT: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textMid, marginTop: 2 },
  barberoMeta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  estrella: { padding: 4 },
  esMio: { fontFamily: FONTS.bold, fontSize: 11.5, color: COLORS.red, marginTop: -2, marginBottom: 6 },
  servRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surfaceAlt, borderRadius: 10, padding: 12, marginTop: 6 },
  servN: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink },
  servP: { fontFamily: FONTS.display, fontSize: 18, color: COLORS.red },
})
