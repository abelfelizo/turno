import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { getSesion } from '../../../lib/storage'
import { getEstadisticasNegocio, getPerfilesNegocio, getNegocioById } from '../../../lib/db'
import { dinero } from '../../../lib/format'
import { COLORS, FONTS } from '../../../constants'
import { Display, Avatar } from '../../../components/ui'

export default function Stats() {
  const [stats, setStats] = useState<any>(null)
  const [perfiles, setPerfiles] = useState<any[]>([])
  const [moneda, setMoneda] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const cargar = useCallback(async () => {
    const ss = await getSesion()
    if (!ss?.negocio_id) { setLoading(false); return }
    const [st, ps, neg] = await Promise.all([
      getEstadisticasNegocio(ss.negocio_id).catch(() => null),
      getPerfilesNegocio(ss.negocio_id).catch(() => []),
      getNegocioById(ss.negocio_id).catch(() => null),
    ])
    setStats(st); setPerfiles(ps as any[]); setMoneda(neg?.moneda ?? ''); setLoading(false); setRefreshing(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: 72, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar() }} />}>
      <Display size={30} style={{ marginBottom: 18 }}>Estadísticas</Display>

      <View style={s.bigCard}>
        <Text style={s.bigLbl}>INGRESOS DEL LOCAL</Text>
        <Text style={s.bigNum}>{dinero(stats?.ingresosPropios ?? 0, moneda)}</Text>
        <Text style={s.bigSub}>{dinero(stats?.ingresosHoy ?? 0, moneda)} hoy · empleados y tu silla</Text>
      </View>

      {(stats?.ingresosRenta ?? 0) > 0 && (
        <View style={s.rentaCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.rentaLbl}>VOLUMEN DE RENTAS</Text>
            <Text style={s.rentaSub}>Ingreso de tus barberos rentados — informativo, no es tuyo.</Text>
          </View>
          <Text style={s.rentaNum}>{dinero(stats?.ingresosRenta ?? 0, moneda)}</Text>
        </View>
      )}

      <View style={s.grid}>
        <Metric n={stats?.totalVisitas ?? 0} l="Visitas" />
        <Metric n={stats?.clientesUnicos ?? 0} l="Clientes" />
        <Metric n={stats?.atendidosHoy ?? 0} l="Hoy" />
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

function Metric({ n, l }: { n: number; l: string }) {
  return <View style={s.metric}><Text style={s.mNum}>{n}</Text><Text style={s.mLbl}>{l}</Text></View>
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
