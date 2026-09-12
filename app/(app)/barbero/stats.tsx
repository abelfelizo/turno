import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { getSesion } from '../../../lib/storage'
import { getMisEstadisticas, getNegocioById, getStatsPeriodoPerfil, type StatsPeriodo } from '../../../lib/db'
import { dinero, fechaISOLocal } from '../../../lib/format'
import { COLORS, FONTS } from '../../../constants'
import { Ionicons } from '@expo/vector-icons'
import { Display } from '../../../components/ui'
import Resenas from '../../../components/resenas'
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

/** De cuántas en cuántas se abre la lista de visitas. */
const PASO_VISITAS = 12

export default function Stats() {
  const [data, setData] = useState<any>(null)
  const [moneda, setMoneda] = useState('')
  const [periodo, setPeriodo] = useState<PeriodoK>('todo')
  const [pstats, setPstats] = useState<StatsPeriodo | null>(null)
  // Lo de HOY va aparte del período elegido: es la segunda escala de tiempo que
  // el panel del dueño enseña bajo el número grande, y sin ella la tarjeta dice
  // "30 días" y no dice cómo va el día que estás trabajando.
  const [hoy, setHoy] = useState<StatsPeriodo | null>(null)
  const [perfilId, setPerfilId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [verResenas, setVerResenas] = useState(false)
  // Cuántas visitas se enseñan. Crece por tandas en vez de pintarlas todas:
  // una lista de cuatrocientas filas en un ScrollView es lo que hacía que la
  // pantalla "se alargara sin fin".
  const [verVisitas, setVerVisitas] = useState(PASO_VISITAS)

  const cargar = useCallback(async () => {
    const ss = await getSesion()
    if (!ss?.perfil_id) { setLoading(false); return }
    setPerfilId(ss.perfil_id)
    const [st, neg, hy] = await Promise.all([
      getMisEstadisticas().catch(() => null),
      ss.negocio_id ? getNegocioById(ss.negocio_id).catch(() => null) : Promise.resolve(null),
      getStatsPeriodoPerfil(ss.perfil_id, fechaISOLocal(), fechaISOLocal()).catch(() => null),
    ])
    setData(st); setMoneda(neg?.moneda ?? ''); setHoy(hy)
    setLoading(false); setRefreshing(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  // Recalcula las métricas del encabezado según el período elegido.
  useEffect(() => {
    if (!perfilId || periodo === 'todo') { setPstats(null); return }
    getStatsPeriodoPerfil(perfilId, desdeDe(periodo), fechaISOLocal()).then(setPstats).catch(() => setPstats(null))
  }, [perfilId, periodo])

  // Cambiar de período empieza la lista de nuevo: si no, viniendo de "Todo"
  // con cien filas abiertas, "Hoy" heredaba el desplegado y se veía un botón de
  // "ver más" que no tenía nada que abrir.
  useEffect(() => { setVerVisitas(PASO_VISITAS) }, [periodo])

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>

  const visitas: any[] = data?.visitas ?? []
  // "Todo" usa el agregado de por vida; los demás, el período.
  /** Las visitas del período elegido, que es lo que los botones de arriba
   *  prometen. `todo` no filtra; el resto compara contra la misma fecha de
   *  corte que se le manda al servidor para los números, para que la lista y el
   *  titular no puedan discrepar. */
  const visitasDelPeriodo = (() => {
    if (periodo === 'todo') return visitas
    const desde = desdeDe(periodo)
    return visitas.filter((v: any) => String(v.fecha) >= desde)
  })()
  const ingresos = periodo === 'todo' ? (data?.totalIngresos ?? 0) : (pstats?.ingresos ?? 0)
  const nVisitas = periodo === 'todo' ? (data?.totalVisitas ?? 0) : (pstats?.visitas ?? 0)
  const nClientes = periodo === 'todo' ? (data?.clientesUnicos ?? 0) : (pstats?.clientes ?? 0)
  const ticket = periodo === 'todo' ? (data?.totalVisitas ? Math.round(data.totalIngresos / data.totalVisitas) : 0) : Math.round(pstats?.ticket ?? 0)

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: 72, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar() }} />}>
      <PanelBadge />
      <Display size={30} style={{ marginBottom: 14 }}>Estadísticas</Display>

      {/* EL MISMO ORDEN QUE EL PANEL DEL DUEÑO, que es el que está bien: el
          número grande primero —lo que se viene a ver— con la segunda escala de
          tiempo debajo en rojo, y solo después los mandos y el desglose. Aquí
          estaba al revés, con los mandos arriba: se entraba a la pantalla y lo
          primero que había que hacer era decidir un período.

          Adaptado a quien lo mira: el dueño ve el local y su equipo, el barbero
          ve su silla y sus últimos cortes. */}
      <View style={s.bigCard}>
        <Text style={s.bigLbl}>MIS INGRESOS · {PERIODOS.find(p => p.k === periodo)?.l.toUpperCase()}</Text>
        <Text style={s.bigNum}>{dinero(ingresos, moneda)}</Text>
        <Text style={s.bigSub}>{dinero(hoy?.ingresos ?? 0, moneda)} hoy · citas y fila</Text>
      </View>

      <View style={s.periodos}>
        {PERIODOS.map(p => (
          <TouchableOpacity key={p.k} style={[s.periodo, periodo === p.k && s.periodoOn]} onPress={() => setPeriodo(p.k)}>
            <Text style={[s.periodoT, periodo === p.k && s.periodoTOn]}>{p.l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={s.periodoLbl}>Tu movimiento · {PERIODOS.find(p => p.k === periodo)?.l.toLowerCase()}</Text>
      <View style={s.grid}>
        <Metric n={nVisitas} l="Visitas" />
        <Metric n={nClientes} l="Clientes" />
        <Metric n={ticket} l="Ticket prom." />
      </View>

      {/* SUS RESEÑAS. El barbero era el único que no podía leer lo que sus
          clientes escribían de él. */}
      <TouchableOpacity style={s.resenasFila} onPress={() => setVerResenas(true)} disabled={!perfilId}>
        <Ionicons name="star-outline" size={20} color={COLORS.ink} />
        <View style={{ flex: 1 }}>
          <Text style={s.resenasT}>Lo que dicen tus clientes</Text>
          <Text style={s.resenasD}>Tu promedio, el reparto de estrellas y sus comentarios.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
      </TouchableOpacity>
      <Resenas perfilId={perfilId} nombre={null} visible={verResenas} onClose={() => setVerResenas(false)} />

      {/* LA LISTA OBEDECE AL FILTRO DE ARRIBA.
          Reportado desde el teléfono: «los filtros de estadísticas deberían
          filtrar también la lista». Antes los botones de período cambiaban los
          números de arriba y la lista seguía enseñando las últimas doce visitas
          de siempre, así que mirando "7 días" se veían cortes de hace dos meses
          debajo del titular. Dos respuestas distintas a la misma pregunta en la
          misma pantalla.

          Y crecía de doce en doce sin decir cuántas había: «las listas se
          alargan sin fin». Ahora el encabezado trae el total del período y la
          lista se abre por tandas. */}
      <Text style={s.sec}>
        VISITAS · {PERIODOS.find(p => p.k === periodo)?.l.toUpperCase()}
        {visitasDelPeriodo.length > 0 ? ` · ${visitasDelPeriodo.length}` : ''}
      </Text>
      {visitasDelPeriodo.length === 0 && (
        <Text style={s.empty}>
          {visitas.length === 0
            ? 'Aún no tienes visitas registradas.'
            : 'Ninguna visita en este período. Prueba con uno más largo.'}
        </Text>
      )}
      {visitasDelPeriodo.slice(0, verVisitas).map((v: any, i: number) => (
        <View key={i} style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.rowName}>{v.turno_servicios?.nombre ?? 'Servicio'}</Text>
            <Text style={s.rowMeta}>{v.fecha} · {ORIGEN[v.origen] ?? v.origen}</Text>
          </View>
          <Text style={s.rowPrecio}>{dinero(v.precio_cobrado, moneda)}</Text>
        </View>
      ))}
      {visitasDelPeriodo.length > verVisitas && (
        <TouchableOpacity onPress={() => setVerVisitas(n => n + PASO_VISITAS)}>
          <Text style={s.verMas}>
            Ver {Math.min(PASO_VISITAS, visitasDelPeriodo.length - verVisitas)} más
            {' '}· quedan {visitasDelPeriodo.length - verVisitas}
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  )
}

function Metric({ n, l }: { n: number; l: string }) {
  return <View style={s.metric}><Text style={s.mNum}>{n}</Text><Text style={s.mLbl}>{l}</Text></View>
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  periodos: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  periodo: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  periodoOn: { backgroundColor: COLORS.carbon, borderColor: COLORS.carbon },
  periodoT: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid },
  periodoTOn: { color: '#fff' },
  // Tarjeta, rejilla y mandos son LOS MISMOS valores que en dueno/stats.tsx.
  // Dos pantallas que cuentan lo mismo para dos personas distintas no tienen
  // por qué verse distintas.
  bigCard: { backgroundColor: COLORS.carbon, borderRadius: 16, padding: 20, marginBottom: 12 },
  bigLbl: { fontFamily: FONTS.bold, fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 },
  bigNum: { fontFamily: FONTS.display, fontSize: 48, color: '#fff', marginTop: 6 },
  bigSub: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.red, marginTop: 2 },
  verMas: { fontFamily: FONTS.bold, fontSize: 13.5, color: COLORS.red, textAlign: 'center', paddingVertical: 14 },
  periodoLbl: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginBottom: 10 },
  grid: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  metric: { flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, alignItems: 'flex-start' },
  mNum: { fontFamily: FONTS.display, fontSize: 26, color: COLORS.ink },
  mLbl: { fontFamily: FONTS.medium, fontSize: 11, color: COLORS.textLight, marginTop: 4 },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginBottom: 12 },
  resenasFila: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, marginBottom: 22 },
  resenasT: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  resenasD: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.textMid, marginTop: 3 },
  empty: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, textAlign: 'center', paddingVertical: 16 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, marginBottom: 8 },
  rowName: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  rowMeta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  rowPrecio: { fontFamily: FONTS.display, fontSize: 20, color: COLORS.ink },
})
