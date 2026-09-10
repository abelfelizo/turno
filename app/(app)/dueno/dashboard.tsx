import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert, Share } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getSesion, guardarSesion } from '../../../lib/storage'
import { getNegocioById, getColaActiva, getSolicitudesPendientes, aprobarPerfil, rechazarPerfil, getEstadisticasNegocio, getPerfilesNegocio, desvincularBarbero, getConfiguracion, asignarCola, getEstadoLocal } from '../../../lib/db'
import { enviarPush } from '../../../lib/notificaciones'
import { suscribirCola, desuscribir } from '../../../lib/realtime'
import { dinero } from '../../../lib/format'
import { COLORS, FONTS } from '../../../constants'
import { Display, Avatar, PuntoVivo } from '../../../components/ui'
import PanelBadge from '../../../components/panel-badge'

const TIPO: Record<string, string> = { barbero: 'Barbería', manicuri_pedicuri: 'Uñas & Spa' }

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
  const [cola, setCola] = useState<any[]>([])
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [equipo, setEquipo] = useState<any[]>([])
  const [config, setConfig] = useState<any>(null)
  // Estado deducido de cada silla. `estado_actual` del perfil solo dice si la
  // persona acepta clientes; no dice si está ocupada, que es lo que el dueño
  // mira para repartir. turno_estado_local ya lo resolvía y no lo usaba nadie.
  const [estados, setEstados] = useState<Record<string, any>>({})
  const [perfilPropio, setPerfilPropio] = useState<string | null>(null)
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const cargar = useCallback(async () => {
    const ss = await getSesion()
    if (!ss?.negocio_id) { setLoading(false); return }
    setPerfilPropio(ss.perfil_id ?? null)
    const [neg, q, sol, est, st, eq, cfg] = await Promise.all([
      getNegocioById(ss.negocio_id),
      getColaActiva(ss.negocio_id).catch(() => []),
      getSolicitudesPendientes(ss.negocio_id).catch(() => []),
      getEstadoLocal(ss.negocio_id).catch(() => []),
      getEstadisticasNegocio(ss.negocio_id).catch(() => null),
      getPerfilesNegocio(ss.negocio_id).catch(() => []),
      getConfiguracion(ss.negocio_id).catch(() => null),
    ])
    const mapa: Record<string, any> = {}
    for (const e of (est as any[])) mapa[e.perfil_id] = e
    setEstados(mapa)
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

  function desvincular(p: any) {
    Alert.alert('Desvincular barbero',
      `¿Sacar a ${p.turno_usuarios?.nombre ?? 'este barbero'} del local? Se cancelarán sus citas futuras y saldrá de la fila. Su historial y clientela lo acompañan.`,
      [{ text: 'No' }, { text: 'Sí, desvincular', style: 'destructive', onPress: async () => {
        try {
          await desvincularBarbero(p.id)
          if (p.usuario_id) enviarPush(p.usuario_id, 'Te desvincularon', `Ya no atiendes en ${negocio?.nombre ?? 'el local'}.`, { tipo: 'agenda' })
          cargar()
        } catch (e: any) { Alert.alert('Error', e.message) }
      } }])
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
  const sillas = equipo.map((p: any) => ({
    id: p.id,
    nombre: (p.turno_usuarios?.nombre ?? 'Profesional').split(' ')[0],
    color: COLOR_SILLA[estados[p.id]?.estado ?? 'inactivo'] ?? 'rgba(255,255,255,0.35)',
  }))

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
      <View style={s.colaBox}>
        <View style={s.colaHead}>
          <PuntoVivo color="rgba(255,255,255,0.95)" vivo={atendiendo > 0 || cola.length > 0} />
          <View style={{ flex: 1 }}>
            <Text style={s.colaTitle}>COLA DEL LOCAL</Text>
            <Text style={s.colaResumen}>{resumenLocal}</Text>
          </View>
        </View>

        {/* Las sillas, de un vistazo: quién está libre y quién ocupado. */}
        {sillas.length > 0 && (
          <View style={s.sillasRow}>
            {sillas.map((x: any) => (
              <View key={x.id} style={s.sillaChip}>
                <View style={[s.sillaPunto, { backgroundColor: x.color }]} />
                <Text style={s.sillaChipT} numberOfLines={1}>{x.nombre}</Text>
              </View>
            ))}
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
      </View>

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

      {/* Solicitudes pendientes */}
      <Text style={s.sec}>SOLICITUDES{solicitudes.length ? ` · ${solicitudes.length}` : ''}</Text>
      {solicitudes.length === 0 && <Text style={s.empty}>No hay barberos pendientes de aprobación.</Text>}
      {solicitudes.map((p: any) => (
        <View key={p.id} style={s.sol}>
          <Avatar name={p.turno_usuarios?.nombre} size={44} bg={COLORS.surfaceAlt} color={COLORS.ink} />
          <View style={{ flex: 1 }}>
            <Text style={s.solName}>{p.turno_usuarios?.nombre ?? 'Profesional'}</Text>
            <Text style={s.solMeta}>{TIPO[p.tipo_servicio] ?? 'Barbería'} · quiere unirse</Text>
          </View>
          <TouchableOpacity style={s.rechazar} onPress={() => rechazar(p)}><Ionicons name="close" size={20} color={COLORS.danger} /></TouchableOpacity>
          <TouchableOpacity style={s.aprobar} onPress={() => aprobar(p)}><Text style={s.aprobarT}>Aprobar</Text></TouchableOpacity>
        </View>
      ))}

      {/* Alta activa: invitar a un barbero con el código del local */}
      <Text style={s.sec}>EQUIPO{equipo.length ? ` · ${equipo.length}` : ''}</Text>
      <TouchableOpacity style={s.agregar} onPress={() => Share.share({
        message: `Únete a ${negocio?.nombre ?? 'mi barbería'} en Turno.\n\nDescarga la app, elige "Trabajo en una barbería" y entra con este código:\n\n${negocio?.codigo_acceso}\n\nCuando envíes la solicitud te apruebo desde mi panel.`,
      })}>
        <View style={s.agregarIcon}><Ionicons name="person-add-outline" size={20} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.agregarT}>Agregar barbero</Text>
          <Text style={s.agregarD}>Comparte el código por WhatsApp. Al solicitar, lo apruebas aquí.</Text>
        </View>
        <Ionicons name="share-outline" size={20} color={COLORS.textLight} />
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
              {' · '}{estadoTexto(estados[p.id], p.estado_actual)}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.desvincular} onPress={() => desvincular(p)}><Ionicons name="person-remove-outline" size={18} color={COLORS.danger} /></TouchableOpacity>
        </View>
      ))}
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
  colaHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  colaTitle: { fontFamily: FONTS.bold, fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 },
  colaResumen: { fontFamily: FONTS.bold, fontSize: 16, color: '#fff', marginTop: 3 },
  // Las sillas: nombre y un punto de color. Sin números, porque el número de
  // cada silla no se decide desde aquí; lo que se mira es quién puede coger al
  // siguiente.
  sillasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  sillaChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10, maxWidth: '48%' },
  sillaPunto: { width: 7, height: 7, borderRadius: 4 },
  sillaChipT: { fontFamily: FONTS.bold, fontSize: 12, color: 'rgba(255,255,255,0.9)', flexShrink: 1 },
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
  desvincular: { width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.dangerLight, alignItems: 'center', justifyContent: 'center' },
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
})
