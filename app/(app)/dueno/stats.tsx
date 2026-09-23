/**
 * ESTADÍSTICAS · el único sitio del panel del local donde vive el dinero.
 * Tablero: «D2 · Barbería · Stats».
 *
 * Igual que en el barbero (decidido el 22 sep): Mi local no enseña dinero, y
 * todo lo que es cifra de caja vive aquí.
 *
 * LAS CIFRAS DE ARRIBA LAS CUENTA EL SERVIDOR (turno_stats_periodo_negocio),
 * que suma sin límite de filas. El reparto —quién mueve el local, de dónde
 * vinieron— sale de la lista de visitas, que la API corta en mil; si se llega
 * al corte se dice, en vez de enseñar un reparto a medias como si fuera todo.
 *
 * EN UN LOCAL DE ALQUILER LA CIFRA GRANDE NO ES DINERO. Quien alquila asientos
 * no ve la facturación de sus inquilinos: su negocio se mide en visitas. Si
 * además atiende, su silla sí es dinero suyo, y se enseña aparte con su nombre.
 */
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getSesion } from '../../../lib/storage'
import { getNegocioById, getStatsPeriodoNegocio, getVisitasNegocio, type StatsPeriodo } from '../../../lib/db'
import { dinero, fechaISOLocal } from '../../../lib/format'
import { useRecargaAlEnfocar } from '../../../lib/recarga'
import { COLORS, FONTS, GLASS } from '../../../constants'
import { NoCargo } from '../../../components/ui'
import { Encabezado, Pestanas, Rotulo, Cifras } from '../../../components/d2'
import PanelBadge from '../../../components/panel-badge'

const PERIODOS = [{ k: 'hoy', l: 'Hoy' }, { k: '7d', l: '7 días' }, { k: '30d', l: '30 días' }, { k: 'todo', l: 'Todo' }] as const
type PeriodoK = typeof PERIODOS[number]['k']
const DIAS: Record<PeriodoK, number> = { hoy: 1, '7d': 7, '30d': 30, todo: 0 }
const TITULO: Record<PeriodoK, string> = { hoy: 'HOY', '7d': 'ÚLTIMOS 7 DÍAS', '30d': 'ÚLTIMOS 30 DÍAS', todo: 'DESDE SIEMPRE' }
const ANTES: Record<PeriodoK, string> = { hoy: 'ayer', '7d': 'los 7 días antes', '30d': 'los 30 días antes', todo: '' }
/** Lo que la API devuelve como mucho en una lista (max_rows de Supabase). */
const CORTE_API = 1000

const hace = (d: number) => fechaISOLocal(new Date(Date.now() - d * 864e5))
function rango(p: PeriodoK): { desde: string; hasta: string; prev?: { desde: string; hasta: string } } {
  if (p === 'todo') return { desde: '2000-01-01', hasta: fechaISOLocal() }
  const n = DIAS[p]
  return { desde: hace(n - 1), hasta: fechaISOLocal(), prev: { desde: hace(2 * n - 1), hasta: hace(n) } }
}

const ORIGEN = [
  { k: 'cita', l: 'Citas', color: COLORS.blue },
  { k: 'cola_digital', l: 'Fila por la app', color: COLORS.red },
  { k: 'cola_fisica', l: 'En el local', color: COLORS.ink },
] as const

export default function EstadisticasLocal() {
  const insets = useSafeAreaInsets()
  const [periodo, setPeriodo] = useState<PeriodoK>('30d')
  const [negocio, setNegocio] = useState<any>(null)
  const [perfilPropio, setPerfilPropio] = useState<string | null>(null)
  const [st, setSt] = useState<StatsPeriodo | null>(null)
  const [antes, setAntes] = useState<StatsPeriodo | null>(null)
  const [visitas, setVisitas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [cambiando, setCambiando] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [fallo, setFallo] = useState(false)

  // El negocio y las cifras van SIN `.catch`: del negocio sale si el local es
  // de alquiler —que decide si la pantalla abre con dinero o con visitas— y
  // las cifras son la pantalla. Tapadas, un local de alquiler caería al lado
  // de empleados y enseñaría «RD$ 0», que es una mentira con cara de dato.
  const cargar = useCallback(async () => {
    try {
      setFallo(false)
      const ss = await getSesion()
      if (!ss?.negocio_id) return
      setPerfilPropio(ss.perfil_id ?? null)
      const r = rango(periodo)
      const [neg, act, prev, vs] = await Promise.all([
        getNegocioById(ss.negocio_id),
        getStatsPeriodoNegocio(ss.negocio_id, r.desde, r.hasta),
        r.prev ? getStatsPeriodoNegocio(ss.negocio_id, r.prev.desde, r.prev.hasta).catch(() => null) : Promise.resolve(null),
        getVisitasNegocio(ss.negocio_id, r.desde, r.hasta).catch(() => []),
      ])
      setNegocio(neg); setSt(act); setAntes(prev); setVisitas(vs as any[])
    } catch {
      setFallo(true)
    } finally {
      setLoading(false); setRefreshing(false); setCambiando(false)
    }
  }, [periodo])
  const correr = useRecargaAlEnfocar(cargar)
  // El primer periodo ya lo carga el enfoque; los cambios, aquí.
  const primera = useRef(true)
  useEffect(() => {
    if (primera.current) { primera.current = false; return }
    setCambiando(true); void correr()
  }, [periodo, correr])

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.ink} /></View>
  if (fallo) return <View style={s.center}><NoCargo que="las estadísticas del local" onReintentar={() => { setLoading(true); void correr() }} /></View>

  const moneda = negocio?.moneda ?? ''
  const esRentado = negocio?.tipo === 'espacios_rentados'
  const ingresos = st?.ingresos ?? 0
  const nVisitas = st?.visitas ?? 0
  const renta = st?.visitasRenta ?? 0
  const cambio = antes && antes.ingresos > 0 ? Math.round(((ingresos - antes.ingresos) / antes.ingresos) * 100) : null
  const cortado = visitas.length >= CORTE_API

  // QUIÉN MUEVE EL LOCAL: una barra por silla que el dueño manda.
  const porSilla = (() => {
    const m = new Map<string, { nombre: string; n: number; dinero: number; tu: boolean }>()
    for (const v of visitas) {
      const k = v.perfil_id ?? '—'
      const e = m.get(k) ?? {
        nombre: v.turno_perfiles?.turno_usuarios?.nombre ?? 'Silla', n: 0, dinero: 0, tu: v.perfil_id === perfilPropio,
      }
      e.n++; e.dinero += Number(v.precio_cobrado || 0); m.set(k, e)
    }
    return [...m.values()].sort((a, b) => b.dinero - a.dinero)
  })()
  const maxSilla = Math.max(1, ...porSilla.map(x => x.dinero))
  const porOrigen = ORIGEN.map(o => ({ ...o, n: visitas.filter(v => v.origen === o.k).length }))
  const conOrigen = porOrigen.reduce((a, o) => a + o.n, 0)

  const tuSilla = porSilla.find(x => x.tu)

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 14, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void correr() }} />}>
      <PanelBadge />
      <Encabezado titulo="Estadísticas" sub={negocio?.nombre ? `El local · ${negocio.nombre}` : null} />
      <Pestanas opciones={PERIODOS} valor={periodo} onCambio={setPeriodo} />

      <View style={cambiando ? { opacity: 0.45 } : null}>
        {esRentado ? (
          <>
            <View style={{ marginTop: 22 }}>
              <Text style={s.lbl}>VISITAS EN TU LOCAL · {TITULO[periodo]}</Text>
              <Text style={s.grande} numberOfLines={1}>{renta + nVisitas}</Text>
              <Text style={s.sub}>Lo que cobra cada quien es suyo: aquí se cuentan servicios, no dinero ajeno.</Text>
            </View>
            <View style={{ marginTop: 22 }}>
              <Cifras items={[
                { n: renta, l: 'de alquiler', color: COLORS.blue },
                { n: nVisitas, l: 'en tu silla' },
                { n: st?.clientes ?? 0, l: 'clientes tuyos' },
              ]} />
            </View>
            {/* Su silla sí es dinero suyo: aparte y con su nombre, no
                disfrazado de «del local». */}
            {nVisitas > 0 && (
              <>
                <Rotulo>Tu silla</Rotulo>
                <View style={s.fila}>
                  <Text style={s.filaN}>Lo que has cobrado tú</Text>
                  <Text style={s.filaP}>{dinero(ingresos, moneda)}</Text>
                </View>
              </>
            )}
          </>
        ) : (
          <>
            <View style={{ marginTop: 22 }}>
              <Text style={s.lbl}>INGRESOS DEL LOCAL · {TITULO[periodo]}</Text>
              <Text style={s.grande} numberOfLines={1} adjustsFontSizeToFit>{dinero(ingresos, moneda)}</Text>
              {cambio != null && (
                <View style={s.chip}>
                  <Text style={s.chipT}>{cambio >= 0 ? '▲' : '▼'} {Math.abs(cambio)}% vs. {ANTES[periodo]}</Text>
                </View>
              )}
            </View>
            <View style={{ marginTop: 22 }}>
              <Cifras items={[
                { n: nVisitas, l: nVisitas === 1 ? 'visita' : 'visitas' },
                { n: st?.clientes ?? 0, l: 'clientes', color: COLORS.blue },
                { n: Math.round(st?.ticket ?? 0).toLocaleString(), l: `ticket${moneda ? ' ' + moneda : ''}` },
              ]} />
            </View>

            {porSilla.length > 0 && (
              <>
                <Rotulo>Quién mueve el local</Rotulo>
                {porSilla.map((x, i) => (
                  <View key={`${x.nombre}-${i}`} style={s.silla}>
                    <View style={s.sillaTop}>
                      <Text style={s.sillaN} numberOfLines={1}>{x.nombre}{x.tu ? <Text style={s.tu}>  TÚ</Text> : null}</Text>
                      <Text style={s.sillaP}>{dinero(x.dinero, moneda)}</Text>
                    </View>
                    <View style={s.sillaBarra}><View style={[s.sillaLlena, { width: `${(x.dinero / maxSilla) * 100}%` }]} /></View>
                    <Text style={s.sillaD}>{x.n} {x.n === 1 ? 'visita' : 'visitas'}</Text>
                  </View>
                ))}
              </>
            )}

            {conOrigen > 0 && (
              <>
                <Rotulo sinRaya>De dónde vinieron</Rotulo>
                <View style={s.barra}>
                  {porOrigen.filter(o => o.n > 0).map(o => <View key={o.k} style={{ flex: o.n, backgroundColor: o.color }} />)}
                </View>
                <View style={s.leyenda}>
                  {porOrigen.filter(o => o.n > 0).map(o => (
                    <View key={o.k} style={s.leyItem}>
                      <View style={[s.leyCuadro, { backgroundColor: o.color }]} />
                      <Text style={s.leyT}>{o.l} {Math.round((o.n / conOrigen) * 100)}%</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Un local de empleados puede tener también sillas rentadas: se
                cuentan en visitas, nunca en dinero. */}
            {renta > 0 && (
              <Text style={s.nota}>
                Además, <Text style={s.b}>{renta} {renta === 1 ? 'visita' : 'visitas'}</Text> en sillas rentadas. Su dinero es de quien renta y no se suma aquí.
              </Text>
            )}
          </>
        )}

        {nVisitas + renta === 0 && (
          <Text style={s.vacio}>
            {periodo === 'todo' ? 'Todavía no hay visitas cerradas en el local.' : 'Ninguna visita en este periodo. Prueba con uno más largo.'}
          </Text>
        )}
        {cortado && (
          <Text style={s.nota}>El reparto por silla y por origen cuenta las {CORTE_API} visitas más recientes; las cifras de arriba cuentan todas.</Text>
        )}
        {esRentado && !tuSilla && nVisitas === 0 && renta > 0 && (
          <Text style={s.nota}>No atiendes en tu local, así que aquí no hay dinero tuyo que contar.</Text>
        )}
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  lbl: { fontFamily: FONTS.bold, fontSize: 10, letterSpacing: 1.2, color: COLORS.textLight },
  grande: { fontFamily: FONTS.monoBold, fontSize: 44, lineHeight: 52, letterSpacing: -1, color: COLORS.ink, marginTop: 6 },
  sub: { fontFamily: FONTS.regular, fontSize: 12.5, lineHeight: 18, color: COLORS.textMid, marginTop: 4 },
  chip: { alignSelf: 'flex-start', backgroundColor: GLASS.ink, paddingHorizontal: 11, paddingVertical: 6, marginTop: 8, borderRadius: 26 },
  chipT: { fontFamily: FONTS.semibold, fontSize: 11.5, color: '#fff' },
  vacio: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textMid, paddingVertical: 22 },
  silla: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: GLASS.hairline },
  sillaTop: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  sillaN: { flex: 1, fontFamily: FONTS.semibold, fontSize: 14.5, color: COLORS.ink },
  tu: { fontFamily: FONTS.bold, fontSize: 10.5, color: COLORS.red, letterSpacing: 1 },
  sillaP: { fontFamily: FONTS.monoBold, fontSize: 18, color: COLORS.ink },
  sillaBarra: { height: 10, backgroundColor: COLORS.border, marginTop: 8, borderRadius: 5 },
  sillaLlena: { height: 10, backgroundColor: COLORS.ink, borderRadius: 5 },
  sillaD: { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textMid, marginTop: 5 },
  barra: { flexDirection: 'row', height: 14, marginTop: 10, overflow: 'hidden' },
  leyenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 10 },
  leyItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  leyCuadro: { width: 9, height: 9 },
  leyT: { fontFamily: FONTS.semibold, fontSize: 12, color: COLORS.ink },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, backgroundColor: GLASS.fill, borderWidth: 1, borderColor: GLASS.border, borderRadius: GLASS.radioFila, paddingHorizontal: 14, marginBottom: 8 },
  filaN: { flex: 1, fontFamily: FONTS.semibold, fontSize: 14.5, color: COLORS.ink },
  filaP: { fontFamily: FONTS.monoBold, fontSize: 20, color: COLORS.ink },
  nota: { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textMid, marginTop: 18, lineHeight: 18 },
  b: { fontFamily: FONTS.semibold, color: COLORS.ink },
})
