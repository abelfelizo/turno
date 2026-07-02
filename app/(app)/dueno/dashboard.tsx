import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert, Share } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { getSesion } from '../../../lib/storage'
import { getNegocioById, getColaActiva, getSolicitudesPendientes, aprobarPerfil, rechazarPerfil, getEstadisticasNegocio } from '../../../lib/db'
import { suscribirCola, desuscribir } from '../../../lib/realtime'
import { dinero } from '../../../lib/format'
import { COLORS, FONTS } from '../../../constants'
import { Display, Avatar } from '../../../components/ui'

const TIPO: Record<string, string> = { barbero: 'Barbería', manicuri_pedicuri: 'Uñas & Spa' }

export default function Dashboard() {
  const [negocio, setNegocio] = useState<any>(null)
  const [cola, setCola] = useState<any[]>([])
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const cargar = useCallback(async () => {
    const ss = await getSesion()
    if (!ss?.negocio_id) { setLoading(false); return }
    const [neg, q, sol, st] = await Promise.all([
      getNegocioById(ss.negocio_id),
      getColaActiva(ss.negocio_id).catch(() => []),
      getSolicitudesPendientes(ss.negocio_id).catch(() => []),
      getEstadisticasNegocio(ss.negocio_id).catch(() => null),
    ])
    setNegocio(neg); setCola(q as any[]); setSolicitudes(sol as any[]); setStats(st)
    setLoading(false); setRefreshing(false)
  }, [])

  useEffect(() => {
    cargar()
    let sub: any
    getSesion().then(ss => { if (ss?.negocio_id) sub = suscribirCola(ss.negocio_id, () => cargar()) })
    return () => { if (sub) desuscribir(sub) }
  }, [cargar])

  async function aprobar(p: any) {
    try { await aprobarPerfil(p.id); cargar() } catch (e: any) { Alert.alert('Error', e.message) }
  }
  function rechazar(p: any) {
    Alert.alert('Rechazar', `¿Rechazar a ${p.turno_usuarios?.nombre ?? 'este profesional'}?`, [
      { text: 'No' }, { text: 'Sí', style: 'destructive', onPress: async () => { try { await rechazarPerfil(p.id); cargar() } catch (e: any) { Alert.alert('Error', e.message) } } },
    ])
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>

  const n1 = cola.filter(c => c.prioridad === 1).length
  const n2 = cola.filter(c => c.prioridad === 2).length
  const n3 = cola.filter(c => c.prioridad === 3).length

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: 72, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar() }} />}>
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
      </View>

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
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginBottom: 12 },
  empty: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, textAlign: 'center', paddingVertical: 16 },
  sol: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, marginBottom: 8 },
  solName: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  solMeta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  rechazar: { width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.dangerLight, alignItems: 'center', justifyContent: 'center' },
  aprobar: { backgroundColor: COLORS.success, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  aprobarT: { fontFamily: FONTS.bold, fontSize: 13, color: '#fff' },
})
