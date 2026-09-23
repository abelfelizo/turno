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
import { COLORS, FONTS } from '../../../constants'
import { NoCargo } from '../../../components/ui'
import { Encabezado, Pestanas, Rotulo, Cifras } from '../../../components/d2'
import { Fila, Iniciales, Punto, Tarjeta, Sobre, Nota } from '../../../components/turno-ui'
import PanelBadge from '../../../components/panel-badge'

const PERIODOS = [{ k: 'hoy', l: 'Hoy' }, { k: '7d', l: '7 días' }, { k: '30d', l: '30 días' }, { k: 'todo', l: 'Todo' }] as const
type PeriodoK = typeof PERIODOS[number]['k']
const DIAS: Record<PeriodoK, number> = { hoy: 1, '7d': 7, '30d': 30, todo: 0 }
const TITULO: Record<PeriodoK, string> = { hoy: 'hoy', '7d': 'últimos 7 días', '30d': 'últimos 30 días', todo: 'desde siempre' }
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

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>
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
            <Tarjeta style={s.heroe}>
              <Sobre>Visitas en tu local · {TITULO[periodo]}</Sobre>
              <Text style={s.grande} numberOfLines={1}>{renta + nVisitas}</Text>
              <Text style={s.sub}>Lo que cobra cada quien es suyo: aquí se cuentan servicios, no dinero ajeno.</Text>
            </Tarjeta>
            <View style={{ marginTop: 14 }}>
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
                <Fila ultima titulo="Lo que has cobrado tú"
                  fin={<Text style={s.filaP}>{dinero(ingresos, moneda)}</Text>} />
              </>
            )}
          </>
        ) : (
          <>
            <Tarjeta style={s.heroe}>
              <Sobre>Ingresos del local · {TITULO[periodo]}</Sobre>
              <Text style={s.grande} numberOfLines={1} adjustsFontSizeToFit>{dinero(ingresos, moneda)}</Text>
              {cambio != null && (
                <View style={s.cambio}>
                  <Text style={[s.cambioN, { color: cambio >= 0 ? COLORS.success : COLORS.redText }]}>
                    {cambio >= 0 ? '▲' : '▼'} {Math.abs(cambio)}%
                  </Text>
                  <Text style={s.cambioT}>vs. {ANTES[periodo]}</Text>
                </View>
              )}
            </Tarjeta>
            <View style={{ marginTop: 14 }}>
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
                  <View key={`${x.nombre}-${i}`} style={[s.silla, i === porSilla.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={s.sillaTop}>
                      <Iniciales nombre={x.nombre} size={36} oscuro={x.tu} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.sillaN} numberOfLines={1}>{x.nombre}{x.tu ? <Text style={s.tu}>  Tú</Text> : null}</Text>
                        <Text style={s.sillaD}>{x.n} {x.n === 1 ? 'visita' : 'visitas'}</Text>
                      </View>
                      <Text style={s.sillaP}>{dinero(x.dinero, moneda)}</Text>
                    </View>
                    <View style={s.sillaBarra}>
                      <View style={[s.sillaLlena, { width: `${(x.dinero / maxSilla) * 100}%` }, x.tu && { backgroundColor: COLORS.red }]} />
                    </View>
                  </View>
                ))}
              </>
            )}

            {conOrigen > 0 && (
              <>
                <Rotulo>De dónde vinieron</Rotulo>
                <View style={s.barra}>
                  {porOrigen.filter(o => o.n > 0).map(o => <View key={o.k} style={{ flex: o.n, backgroundColor: o.color }} />)}
                </View>
                {porOrigen.filter(o => o.n > 0).map((o, i, arr) => (
                  <Fila key={o.k} ultima={i === arr.length - 1}
                    inicio={<Punto color={o.color} size={10} />}
                    titulo={o.l}
                    fin={
                      <View style={s.origenFin}>
                        <Text style={s.origenN}>{o.n}</Text>
                        <Text style={s.origenP}>{Math.round((o.n / conOrigen) * 100)}%</Text>
                      </View>
                    } />
                ))}
              </>
            )}

            {/* Un local de empleados puede tener también sillas rentadas: se
                cuentan en visitas, nunca en dinero. */}
            {renta > 0 && (
              <Nota style={s.nota}>
                Además, <Text style={s.b}>{renta} {renta === 1 ? 'visita' : 'visitas'}</Text> en sillas rentadas. Su dinero es de quien renta y no se suma aquí.
              </Nota>
            )}
          </>
        )}

        {nVisitas + renta === 0 && (
          <Nota style={s.vacio}>
            {periodo === 'todo' ? 'Todavía no hay visitas cerradas en el local.' : 'Ninguna visita en este periodo. Prueba con uno más largo.'}
          </Nota>
        )}
        {cortado && (
          <Nota style={s.nota}>El reparto por silla y por origen cuenta las {CORTE_API} visitas más recientes; las cifras de arriba cuentan todas.</Nota>
        )}
        {esRentado && !tuSilla && nVisitas === 0 && renta > 0 && (
          <Nota style={s.nota}>No atiendes en tu local, así que aquí no hay dinero tuyo que contar.</Nota>
        )}
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  heroe: { marginTop: 20, padding: 18 },
  grande: { fontFamily: FONTS.mono, fontSize: 44, lineHeight: 52, letterSpacing: -1.5, color: COLORS.ink, marginTop: 8 },
  sub: { fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19, color: COLORS.textLight, marginTop: 4 },
  cambio: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 6 },
  cambioN: { fontFamily: FONTS.mono, fontSize: 14 },
  cambioT: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textLight },
  vacio: { paddingVertical: 12 },
  silla: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  sillaTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sillaN: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  tu: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.red },
  sillaP: { fontFamily: FONTS.mono, fontSize: 15, color: COLORS.ink },
  sillaBarra: { height: 6, borderRadius: 3, backgroundColor: COLORS.surfaceAlt, marginTop: 10, overflow: 'hidden' },
  sillaLlena: { height: 6, borderRadius: 3, backgroundColor: COLORS.ink },
  sillaD: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textLight, marginTop: 2 },
  barra: { flexDirection: 'row', height: 10, borderRadius: 5, marginTop: 8, marginBottom: 4, overflow: 'hidden', gap: 2 },
  origenFin: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  origenN: { fontFamily: FONTS.monoMedium, fontSize: 13, color: COLORS.textLight },
  origenP: { fontFamily: FONTS.mono, fontSize: 15, color: COLORS.ink, minWidth: 44, textAlign: 'right' },
  filaP: { fontFamily: FONTS.mono, fontSize: 17, color: COLORS.ink },
  nota: { marginTop: 18 },
  b: { fontFamily: FONTS.semibold, color: COLORS.ink },
})
