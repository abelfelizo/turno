import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { getSesion } from '../../../lib/storage'
import { getMisEstadisticas, getNegocioById, getStatsPeriodoPerfil, type StatsPeriodo } from '../../../lib/db'
import { dinero, fechaISOLocal } from '../../../lib/format'
import { COLORS, FONTS } from '../../../constants'
import { Display } from '../../../components/ui'
import PanelBadge from '../../../components/panel-badge'

const ORIGEN: Record<string, string> = { cita: 'Cita', cola_digital: 'Fila digital', cola_fisica: 'Fila física', cola_prioritaria: 'Prioritario' }
const PERIODOS = [{ k: 'hoy', l: 'Hoy' }, { k: '7d', l: '7 días' }, { k: '30d', l: '30 días' }, { k: 'todo', l: 'Todo' }] as const
type PeriodoK = typeof PERIODOS[number]['k']
function desdeDe(p: PeriodoK): string {
  if (p === 'hoy') return fechaISOLocal()
  if (p === '7d') return fechaISOLocal(new Date(Date.now() - 6 * 864e5))
  if (p === '30d') return fechaISOLocal(new Date(Date.now() - 29 * 864e5))
  return '2000-01-01'
}

export default function Stats() {
  const [data, setData] = useState<any>(null)
  const [moneda, setMoneda] = useState('')
  const [periodo, setPeriodo] = useState<PeriodoK>('todo')
  const [pstats, setPstats] = useState<StatsPeriodo | null>(null)
  const [perfilId, setPerfilId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const cargar = useCallback(async () => {
    const ss = await getSesion()
    if (!ss?.perfil_id) { setLoading(false); return }
    setPerfilId(ss.perfil_id)
    const [st, neg] = await Promise.all([
      getMisEstadisticas().catch(() => null),
      ss.negocio_id ? getNegocioById(ss.negocio_id).catch(() => null) : Promise.resolve(null),
    ])
    setData(st); setMoneda(neg?.moneda ?? '')
    setLoading(false); setRefreshing(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  // Recalcula las métricas del encabezado según el período elegido.
  useEffect(() => {
    if (!perfilId || periodo === 'todo') { setPstats(null); return }
    getStatsPeriodoPerfil(perfilId, desdeDe(periodo), fechaISOLocal()).then(setPstats).catch(() => setPstats(null))
  }, [perfilId, periodo])

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>

  const visitas: any[] = data?.visitas ?? []
  // "Todo" usa el agregado de por vida; los demás, el período.
  const ingresos = periodo === 'todo' ? (data?.totalIngresos ?? 0) : (pstats?.ingresos ?? 0)
  const nVisitas = periodo === 'todo' ? (data?.totalVisitas ?? 0) : (pstats?.visitas ?? 0)
  const nClientes = periodo === 'todo' ? (data?.clientesUnicos ?? 0) : (pstats?.clientes ?? 0)
  const ticket = periodo === 'todo' ? (data?.totalVisitas ? Math.round(data.totalIngresos / data.totalVisitas) : 0) : Math.round(pstats?.ticket ?? 0)

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: 72, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar() }} />}>
      <PanelBadge />
      <Display size={30} style={{ marginBottom: 14 }}>Estadísticas</Display>

      <View style={s.periodos}>
        {PERIODOS.map(p => (
          <TouchableOpacity key={p.k} style={[s.periodo, periodo === p.k && s.periodoOn]} onPress={() => setPeriodo(p.k)}>
            <Text style={[s.periodoT, periodo === p.k && s.periodoTOn]}>{p.l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.bigCard}>
        <Text style={s.bigLbl}>INGRESOS · {PERIODOS.find(p => p.k === periodo)?.l.toUpperCase()}</Text>
        <Text style={s.bigNum}>{dinero(ingresos, moneda)}</Text>
      </View>

      <View style={s.grid}>
        <Metric n={nVisitas} l="Visitas" />
        <Metric n={nClientes} l="Clientes" />
        <Metric n={ticket} l="Ticket prom." />
      </View>

      <Text style={s.sec}>VISITAS RECIENTES</Text>
      {visitas.length === 0 && <Text style={s.empty}>Aún no tienes visitas registradas.</Text>}
      {visitas.slice(0, 12).map((v: any, i: number) => (
        <View key={i} style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.rowName}>{v.turno_servicios?.nombre ?? 'Servicio'}</Text>
            <Text style={s.rowMeta}>{v.fecha} · {ORIGEN[v.origen] ?? v.origen}</Text>
          </View>
          <Text style={s.rowPrecio}>{dinero(v.precio_cobrado, moneda)}</Text>
        </View>
      ))}
    </ScrollView>
  )
}

function Metric({ n, l }: { n: number; l: string }) {
  return <View style={s.metric}><Text style={s.mNum}>{n}</Text><Text style={s.mLbl}>{l}</Text></View>
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  periodos: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  periodo: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  periodoOn: { backgroundColor: COLORS.carbon, borderColor: COLORS.carbon },
  periodoT: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid },
  periodoTOn: { color: '#fff' },
  bigCard: { backgroundColor: COLORS.carbon, borderRadius: 16, padding: 20, marginBottom: 12 },
  bigLbl: { fontFamily: FONTS.bold, fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 },
  bigNum: { fontFamily: FONTS.display, fontSize: 48, color: '#fff', marginTop: 6 },
  grid: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  metric: { flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, alignItems: 'flex-start' },
  mNum: { fontFamily: FONTS.display, fontSize: 26, color: COLORS.ink },
  mLbl: { fontFamily: FONTS.medium, fontSize: 11, color: COLORS.textLight, marginTop: 4 },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginBottom: 12 },
  empty: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, textAlign: 'center', paddingVertical: 16 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, marginBottom: 8 },
  rowName: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  rowMeta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  rowPrecio: { fontFamily: FONTS.display, fontSize: 20, color: COLORS.ink },
})
