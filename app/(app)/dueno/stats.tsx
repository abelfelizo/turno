import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { getSesion } from '../../../lib/storage'
import { getEstadisticasNegocio, getPerfilesNegocio, getNegocioById, getStatsPeriodoNegocio, type StatsPeriodo } from '../../../lib/db'
import { dinero, fechaISOLocal } from '../../../lib/format'
import { COLORS, FONTS } from '../../../constants'
import { nombreOficio } from '../../../types'
import { Display, Avatar, NoCargo } from '../../../components/ui'
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
  const [esRentado, setEsRentado] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [fallo, setFallo] = useState(false)

  // Aquí van SIN `.catch` dos llamadas, no una. Las cifras, por lo evidente.
  // Y el negocio, porque de él sale `esRentado`, que decide si la pantalla abre
  // con dinero o con visitas: si esa llamada se cae y se tapa con `null`, un
  // local de alquiler cae al lado de empleados y enseña "INGRESOS DEL LOCAL ·
  // empleados y tu silla" en RD$0 — justo la contradicción que arreglamos.
  // Mejor decir que no se pudo cargar que enseñar el local de otro.
  const cargar = useCallback(async () => {
    try {
      setFallo(false)
      const ss = await getSesion()
      if (!ss?.negocio_id) return
      setNegocioId(ss.negocio_id)
      const [st, ps, neg] = await Promise.all([
        getEstadisticasNegocio(ss.negocio_id),
        getPerfilesNegocio(ss.negocio_id).catch(() => []),
        getNegocioById(ss.negocio_id),
      ])
      setStats(st); setPerfiles(ps as any[]); setMoneda(neg?.moneda ?? '')
      setEsRentado(neg?.tipo === 'espacios_rentados')
    } catch {
      setFallo(true)
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (!negocioId) return
    getStatsPeriodoNegocio(negocioId, desdeDe(periodo), fechaISOLocal()).then(setPstats).catch(() => setPstats(null))
  }, [negocioId, periodo])

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>
  if (fallo) return (
    <View style={s.center}>
      <NoCargo que="las estadísticas del local" onReintentar={() => { setLoading(true); cargar() }} />
    </View>
  )

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: 72, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar() }} />}>
      <PanelBadge />
      <Display size={30} style={{ marginBottom: 18 }}>Estadísticas</Display>

      {/* EN UN LOCAL DE ALQUILER LA CIFRA GRANDE NO PUEDE SER DINERO.
          Quien alquila asientos no ve la facturación de sus inquilinos: es
          otro negocio que le paga por el espacio. La pantalla, sin embargo,
          abría con "INGRESOS DEL LOCAL · empleados y tu silla" — nombrando
          empleados que en esa modalidad no existen, y enseñando un número que
          para un casero sin silla propia es RD$0 para siempre. Se veía como un
          local que no factura nada, cuando lo que pasa es que su negocio se
          mide en visitas. */}
      {esRentado ? (
        <View style={s.bigCard}>
          <Text style={s.bigLbl}>VISITAS EN TU LOCAL</Text>
          <Text style={s.bigNum}>{stats?.totalVisitas ?? 0}</Text>
          <Text style={s.bigSub}>
            {stats?.atendidosHoy ?? 0} hoy · lo que cobra cada quien es suyo
          </Text>
        </View>
      ) : (
        <View style={s.bigCard}>
          <Text style={s.bigLbl}>INGRESOS DEL LOCAL</Text>
          <Text style={s.bigNum}>{dinero(stats?.ingresosPropios ?? 0, moneda)}</Text>
          <Text style={s.bigSub}>{dinero(stats?.ingresosHoy ?? 0, moneda)} hoy · empleados y tu silla</Text>
        </View>
      )}

      {/* En un local de alquiler esta tarjeta sale SIEMPRE, también en cero:
          es la única cifra del negocio del casero, y esconderla el día flojo
          deja la pantalla hablando de todo menos de lo suyo. En un local de
          empleados sigue apareciendo solo si hay algún asiento alquilado. */}
      {(esRentado || (stats?.visitasRenta ?? 0) > 0) && (
        <View style={s.rentaCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.rentaLbl}>ASIENTOS ALQUILADOS</Text>
            <Text style={s.rentaSub}>Servicios hechos por quienes te rentan, desde que abriste. Su facturación es suya y no se muestra.</Text>
          </View>
          <Text style={s.rentaNum}>{stats?.visitasRenta ?? 0}</Text>
        </View>
      )}

      {/* Si además atiende en su propia silla, ese dinero SÍ es suyo y se le
          enseña — pero aparte y con su nombre, no disfrazado de "del local". */}
      {esRentado && (stats?.ingresosPropios ?? 0) > 0 && (
        <View style={s.rentaCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.rentaLbl}>TU SILLA</Text>
            <Text style={s.rentaSub}>Lo que has cobrado tú atendiendo. No incluye a quienes te rentan.</Text>
          </View>
          <Text style={s.rentaNum}>{dinero(stats?.ingresosPropios ?? 0, moneda)}</Text>
        </View>
      )}

      <View style={s.periodos}>
        {PERIODOS.map(p => (
          <TouchableOpacity key={p.k} style={[s.periodo, periodo === p.k && s.periodoOn]} onPress={() => setPeriodo(p.k)}>
            <Text style={[s.periodoT, periodo === p.k && s.periodoTOn]}>{p.l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {/* El periodo tenía el mismo problema que la cifra grande, y peor: la
          base devuelve las visitas de los asientos alquilados en una columna
          aparte y la app ni la leía. El casero elegía "30 días" y veía un
          resumen del que estaban fuera TODOS sus inquilinos, sin un solo
          letrero que lo dijera. */}
      <Text style={s.periodoLbl}>
        {esRentado ? 'Tu local' : 'Movimiento del local'} · {PERIODOS.find(p => p.k === periodo)?.l.toLowerCase()}
      </Text>
      <View style={s.grid}>
        {esRentado ? (
          <>
            <Metric n={(pstats?.visitas ?? 0) + (pstats?.visitasRenta ?? 0)} l="Visitas" />
            <Metric n={pstats?.visitasRenta ?? 0} l="De alquiler" />
            <Metric n={pstats?.clientes ?? 0} l="Clientes tuyos" />
          </>
        ) : (
          <>
            <Metric n={dinero(pstats?.ingresos ?? 0, moneda)} l="Movimiento" />
            <Metric n={pstats?.visitas ?? 0} l="Visitas" />
            <Metric n={pstats?.clientes ?? 0} l="Clientes" />
          </>
        )}
      </View>

      {/* «Equipo» es de quien tiene empleados. Quien alquila asientos no tiene
          equipo: tiene inquilinos, cada uno con su negocio. */}
      <Text style={s.sec}>{esRentado ? 'QUIENES RENTAN' : 'EQUIPO'} · {perfiles.length}</Text>
      {perfiles.length === 0 && (
        <Text style={s.empty}>
          {esRentado ? 'Todavía no hay nadie rentando un asiento.' : 'Aún no tienes barberos aprobados.'}
        </Text>
      )}
      {perfiles.map((p: any) => (
        <View key={p.id} style={s.row}>
          <Avatar name={p.turno_usuarios?.nombre} size={42} />
          <View style={{ flex: 1 }}>
            <Text style={s.rowName}>{p.turno_usuarios?.nombre ?? 'Profesional'}</Text>
            <Text style={s.rowMeta}>{nombreOficio(p.tipo_servicio)} · {p.estado_actual}</Text>
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
