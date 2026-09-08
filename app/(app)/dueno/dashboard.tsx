import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert, Share } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getSesion, guardarSesion } from '../../../lib/storage'
import { getNegocioById, getColaActiva, getSolicitudesPendientes, aprobarPerfil, rechazarPerfil, getEstadisticasNegocio, getPerfilesNegocio, desvincularBarbero, getConfiguracion, asignarCola } from '../../../lib/db'
import { enviarPush } from '../../../lib/notificaciones'
import { suscribirCola, desuscribir } from '../../../lib/realtime'
import { dinero } from '../../../lib/format'
import { COLORS, FONTS } from '../../../constants'
import { Display, Avatar } from '../../../components/ui'
import PanelBadge from '../../../components/panel-badge'

const TIPO: Record<string, string> = { barbero: 'Barbería', manicuri_pedicuri: 'Uñas & Spa' }

export default function Dashboard() {
  const router = useRouter()
  const [negocio, setNegocio] = useState<any>(null)
  const [cola, setCola] = useState<any[]>([])
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [equipo, setEquipo] = useState<any[]>([])
  const [config, setConfig] = useState<any>(null)
  const [perfilPropio, setPerfilPropio] = useState<string | null>(null)
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const cargar = useCallback(async () => {
    const ss = await getSesion()
    if (!ss?.negocio_id) { setLoading(false); return }
    setPerfilPropio(ss.perfil_id ?? null)
    const [neg, q, sol, st, eq, cfg] = await Promise.all([
      getNegocioById(ss.negocio_id),
      getColaActiva(ss.negocio_id).catch(() => []),
      getSolicitudesPendientes(ss.negocio_id).catch(() => []),
      getEstadisticasNegocio(ss.negocio_id).catch(() => null),
      getPerfilesNegocio(ss.negocio_id).catch(() => []),
      getConfiguracion(ss.negocio_id).catch(() => null),
    ])
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

  const n1 = cola.filter(c => c.prioridad === 1).length
  const n2 = cola.filter(c => c.prioridad === 2).length
  const n3 = cola.filter(c => c.prioridad === 3).length

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

      {/* Cola del local */}
      <View style={s.colaBox}>
        <Text style={s.colaTitle}>COLA DEL LOCAL</Text>
        <View style={s.colaStats}>
          <Grupo n={n1} l="Prioritario" />
          <Grupo n={n2} l="Digital" />
          <Grupo n={n3} l="Físico" />
          <Grupo n={cola.length} l="Total" hl />
        </View>
        {cola.length > 0 && (
          <View style={s.colaLista}>
            {cola.map((c: any, i: number) => (
              <View key={c.id} style={s.colaRow}>
                <Text style={s.colaPos}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.colaName}>{c.turno_usuarios?.nombre ?? 'Cliente'}</Text>
                  <Text style={s.colaServ}>{c.turno_servicios?.nombre ?? 'Servicio'}{c.turno_servicios?.duracion_min ? ` · ${c.turno_servicios.duracion_min} min` : ''}</Text>
                </View>
                {config?.asignacion_por_dueno && c.estado === 'en_fila'
                  ? <TouchableOpacity style={s.asignar} onPress={() => asignar(c)}><Text style={s.asignarT}>Asignar</Text></TouchableOpacity>
                  : <Text style={[s.colaEstado, c.estado === 'llamado' && { color: COLORS.success }, c.estado === 'en_camino' && { color: '#8AB4FF' }]}>
                      {c.estado === 'en_fila' ? 'En fila' : c.estado === 'llamado' ? 'Llamado' : 'En camino'}
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
            <Text style={s.solMeta}>
              {p.rol === 'barbero_renta' ? 'Renta su espacio' : p.rol === 'dueno' ? 'Dueño' : 'Empleado'}
              {' · '}{p.estado_actual === 'disponible' ? 'Disponible' : 'En descanso'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.desvincular} onPress={() => desvincular(p)}><Ionicons name="person-remove-outline" size={18} color={COLORS.danger} /></TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  )
}

function Grupo({ n, l, hl }: { n: number; l: string; hl?: boolean }) {
  return <View style={{ alignItems: 'center' }}><Text style={[gs.num, hl && { color: COLORS.red }]}>{n}</Text><Text style={gs.lbl}>{l}</Text></View>
}
const gs = StyleSheet.create({ num: { fontFamily: FONTS.display, fontSize: 30, color: '#fff' }, lbl: { fontFamily: FONTS.medium, fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2 } })

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
  colaTitle: { fontFamily: FONTS.bold, fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, marginBottom: 14 },
  colaStats: { flexDirection: 'row', justifyContent: 'space-between' },
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
