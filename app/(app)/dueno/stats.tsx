import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { getSesion } from '../../../lib/storage'
import { getEstadisticasNegocio, getPerfilesNegocio, getNegocioById, getStatsPeriodoNegocio, type StatsPeriodo } from '../../../lib/db'
import { dinero, fechaISOLocal } from '../../../lib/format'
import { COLORS, FONTS } from '../../../constants'
import { Display, Avatar } from '../../../components/ui'
import PanelBadge from '../../../components/panel-badge'

const PERIODOS = [{ k: 'hoy', l: 'Hoy' }, { k: '7d', l: '7 días' }, { k: '30d', l: '30 días' }] as const
type PeriodoK = typeof PERIODOS[number]['k']
function desdeDe(p: PeriodoK): string {
  if (p === 'hoy') return fechaISOLocal()
  if (p === '7d') return fechaISOLocal(new Date(Date.now() - 6 * 864e5))
  return fechaISOLocal(new Date(Date.now() - 29 * 864e5))
}

export default function Stats() {
  const [stats, setStats] = useState<any>(null)
  const [perfiles, setPerfiles] = useState<any[]>([])
  const [moneda, setMoneda] = useState('')
  const [periodo, setPeriodo] = useState<PeriodoK>('7d')
  const [pstats, setPstats] = useState<StatsPeriodo | null>(null)
  const [negocioId, setNegocioId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const cargar = useCallback(async () => {
    const ss = await getSesion()
    if (!ss?.negocio_id) { setLoading(false); return }
    setNegocioId(ss.negocio_id)
    const [st, ps, neg] = await Promise.all([
      getEstadisticasNegocio(ss.negocio_id).catch(() => null),
      getPerfilesNegocio(ss.negocio_id).catch(() => []),
      getNegocioById(ss.negocio_id).catch(() => null),
    ])
    setStats(st); setPerfiles(ps as any[]); setMoneda(neg?.moneda ?? ''); setLoading(false); setRefreshing(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (!negocioId) return
    getStatsPeriodoNegocio(negocioId, desdeDe(periodo), fechaISOLocal()).then(setPstats).catch(() => setPstats(null))
  }, [negocioId, periodo])

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: 72, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar() }} />}>
      <PanelBadge />
      <Display size={30} style={{ marginBottom: 18 }}>Estadísticas</Display>

      <View style={s.bigCard}>
        <Text style={s.bigLbl}>INGRESOS DEL LOCAL</Text>
        <Text style={s.bigNum}>{dinero(stats?.ingresosPropios ?? 0, moneda)}</Text>
        <Text style={s.bigSub}>{dinero(stats?.ingresosHoy ?? 0, moneda)} hoy · empleados y tu silla</Text>
      </View>

      {(stats?.visitasRenta ?? 0) > 0 && (
        <View style={s.rentaCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.rentaLbl}>ASIENTOS ALQUILADOS</Text>
            <Text style={s.rentaSub}>Servicios hechos por quienes te rentan. Su facturación es suya y no se muestra.</Text>
          </View>
          <Text style={s.rentaNum}>{stats?.visitasRenta ?? 0}</Text>
        </View>
      )}

      <View style={s.periodos}>
        {PERIODOS.map(p => (
          <TouchableOpacity key={p.k} style={[s.periodo, periodo === p.k && s.periodoOn]} onPress={() => setPeriodo(p.k)}>
            <Text style={[s.periodoT, periodo === p.k && s.periodoTOn]}>{p.l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={s.periodoLbl}>Movimiento del local · {PERIODOS.find(p => p.k === periodo)?.l.toLowerCase()}</Text>
      <View style={s.grid}>
        <Metric n={dinero(pstats?.ingresos ?? 0, moneda)} l="Movimiento" />
        <Metric n={pstats?.visitas ?? 0} l="Visitas" />
        <Metric n={pstats?.clientes ?? 0} l="Clientes" />
      </View>

      <Text style={s.sec}>EQUIPO · {perfiles.length}</Text>
      {perfiles.length === 0 && <Text style={s.empty}>Aún no tienes barberos aprobados.</Text>}
      {perfiles.map((p: any) => (
        <View key={p.id} style={s.row}>
          <Avatar name={p.turno_usuarios?.nombre} size={42} />
          <View style={{ flex: 1 }}>
            <Text style={s.rowName}>{p.turno_usuarios?.nombre ?? 'Profesional'}</Text>
            <Text style={s.rowMeta}>{p.tipo_servicio === 'manicuri_pedicuri' ? 'Uñas & Spa' : 'Barbería'} · {p.estado_actual}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  )
}

function Metric({ n, l }: { n: number | string; l: string }) {
  return <View style={s.metric}><Text style={s.mNum} numberOfLines={1}>{n}</Text><Text style={s.mLbl}>{l}</Text></View>
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  bigCard: { backgroundColor: COLORS.carbon, borderRadius: 16, padding: 20, marginBottom: 12 },
  bigLbl: { fontFamily: FONTS.bold, fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 },
  bigNum: { fontFamily: FONTS.display, fontSize: 48, color: '#fff', marginTop: 6 },
  bigSub: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.red, marginTop: 2 },
  rentaCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 16, marginBottom: 12 },
  rentaLbl: { fontFamily: FONTS.bold, fontSize: 11, color: COLORS.textLight, letterSpacing: 1 },
  rentaSub: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 3 },
  rentaNum: { fontFamily: FONTS.display, fontSize: 24, color: COLORS.textMid },
  periodos: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  periodo: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  periodoOn: { backgroundColor: COLORS.carbon, borderColor: COLORS.carbon },
  periodoT: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid },
  periodoTOn: { color: '#fff' },
  periodoLbl: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginBottom: 10 },
  grid: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  metric: { flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14 },
  mNum: { fontFamily: FONTS.display, fontSize: 26, color: COLORS.ink },
  mLbl: { fontFamily: FONTS.medium, fontSize: 11, color: COLORS.textLight, marginTop: 4 },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginBottom: 12 },
  empty: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, textAlign: 'center', paddingVertical: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, marginBottom: 8 },
  rowName: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  rowMeta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2, textTransform: 'capitalize' },
})
