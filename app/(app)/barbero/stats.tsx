/**
 * ESTADÍSTICAS · el único sitio del barbero donde vive el dinero.
 *
 * Decidido el 22 sep: Mi silla no enseña dinero —el teléfono se le enseña al
 * cliente—, y todo lo que es cifra de caja vive aquí. Tablero: «D2 · Barbero ·
 * Stats» del lienzo de diseño.
 *
 * TODO SALE DE LAS MISMAS VISITAS. Antes el titular venía de un agregado del
 * servidor y la lista de otro, con límite de veinte: mirando «30 días» se
 * podía leer un total que la lista no alcanzaba a explicar. Ahora se piden las
 * visitas del periodo una vez (`getVisitasPerfil`) y de ahí salen el total,
 * las cifras, de dónde vinieron, por servicio y la lista. No pueden discrepar.
 *
 * Es de ESTA silla —la del local en el que estás—. Quien trabaja en dos
 * locales ve abajo, en «Todo», la suma de los dos.
 */
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getSesion } from '../../../lib/storage'
import {
  getMisEstadisticas, getNegocioById, getStatsPeriodoPerfil, getVisitasPerfil, getResumenResenas, getResenasDe,
  type ResumenResenas,
} from '../../../lib/db'
import { dinero, fechaISOLocal, fechaDeISO } from '../../../lib/format'
import { useRecargaAlEnfocar } from '../../../lib/recarga'
import { COLORS, FONTS } from '../../../constants'
import { NoCargo, Pole } from '../../../components/ui'
import { Encabezado, Pestanas, Rotulo, Cifras } from '../../../components/d2'
import Resenas from '../../../components/resenas'
import PanelBadge from '../../../components/panel-badge'

const PERIODOS = [{ k: 'hoy', l: 'Hoy' }, { k: '7d', l: '7 días' }, { k: '30d', l: '30 días' }, { k: 'todo', l: 'Todo' }] as const
type PeriodoK = typeof PERIODOS[number]['k']
const DIAS: Record<PeriodoK, number> = { hoy: 1, '7d': 7, '30d': 30, todo: 0 }
const TITULO: Record<PeriodoK, string> = { hoy: 'HOY', '7d': 'ÚLTIMOS 7 DÍAS', '30d': 'ÚLTIMOS 30 DÍAS', todo: 'DESDE SIEMPRE' }
const ANTES: Record<PeriodoK, string> = { hoy: 'ayer', '7d': 'los 7 días antes', '30d': 'los 30 días antes', todo: '' }

const hace = (d: number) => fechaISOLocal(new Date(Date.now() - d * 864e5))
function rango(p: PeriodoK): { desde: string; hasta: string; prev?: { desde: string; hasta: string } } {
  if (p === 'todo') return { desde: '2000-01-01', hasta: fechaISOLocal() }
  const n = DIAS[p]
  return { desde: hace(n - 1), hasta: fechaISOLocal(), prev: { desde: hace(2 * n - 1), hasta: hace(n) } }
}

/**
 * DE DÓNDE VINO, con las palabras de la silla y no las de la base. Lo que la
 * base llama `cola_fisica` es quien estaba de pie en el local —la fila
 * presencial y los que entraron sin cita, que se registran igual—; decir
 * «sin cita» ahí sería afirmar algo que el dato no distingue.
 */
const ORIGEN = [
  { k: 'cita', l: 'Citas', color: COLORS.blue },
  { k: 'cola_digital', l: 'Fila por la app', color: COLORS.red },
  { k: 'cola_fisica', l: 'En el local', color: COLORS.ink },
] as const
const nombreOrigen = (o: string) => ORIGEN.find(x => x.k === o)?.l ?? (o === 'cola_prioritaria' ? 'Prioritario' : o)

const PASO_VISITAS = 12
const fechaCorta = (iso: string) => fechaDeISO(iso).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' }).replace('.', '')

export default function Stats() {
  const insets = useSafeAreaInsets()
  const [periodo, setPeriodo] = useState<PeriodoK>('30d')
  const [perfilId, setPerfilId] = useState<string | null>(null)
  const [moneda, setMoneda] = useState('')
  const [local, setLocal] = useState<string | null>(null)
  const [visitas, setVisitas] = useState<any[]>([])
  const [antes, setAntes] = useState<number | null>(null)
  const [global, setGlobal] = useState<{ ingresos: number; visitas: number } | null>(null)
  const [resumen, setResumen] = useState<ResumenResenas | null>(null)
  const [ultima, setUltima] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [cambiando, setCambiando] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [fallo, setFallo] = useState(false)
  const [verResenas, setVerResenas] = useState(false)
  const [verVisitas, setVerVisitas] = useState(PASO_VISITAS)

  // Las visitas del periodo van SIN `.catch`: son la pantalla. Tapadas con
  // una lista vacía se leería «RD$ 0», que es una mentira con cara de dato.
  const cargar = useCallback(async () => {
    try {
      setFallo(false)
      const ss = await getSesion()
      if (!ss?.perfil_id) return
      setPerfilId(ss.perfil_id)
      const r = rango(periodo)
      const [vs, prev, neg, glob, res, ult] = await Promise.all([
        getVisitasPerfil(ss.perfil_id, r.desde, r.hasta),
        r.prev ? getStatsPeriodoPerfil(ss.perfil_id, r.prev.desde, r.prev.hasta).catch(() => null) : Promise.resolve(null),
        ss.negocio_id ? getNegocioById(ss.negocio_id).catch(() => null) : Promise.resolve(null),
        periodo === 'todo' ? getMisEstadisticas().catch(() => null) : Promise.resolve(null),
        getResumenResenas(ss.perfil_id).catch(() => null),
        getResenasDe(ss.perfil_id, 1).catch(() => []),
      ])
      setVisitas(vs as any[]); setAntes(prev ? prev.ingresos : null)
      setMoneda(neg?.moneda ?? ''); setLocal(neg?.nombre ?? null)
      setGlobal(glob ? { ingresos: glob.totalIngresos, visitas: glob.totalVisitas } : null)
      setResumen(res); setUltima((ult as any[])[0] ?? null)
    } catch {
      setFallo(true)
    } finally {
      setLoading(false); setRefreshing(false); setCambiando(false)
    }
  }, [periodo])
  const correr = useRecargaAlEnfocar(cargar)
  // Cambiar de periodo es otra pregunta: se vuelve a pedir y la lista empieza
  // de nuevo, sin heredar lo desplegado del periodo anterior.
  // (El primer periodo ya lo carga el enfoque: sin este salto, cada apertura
  // pediría lo mismo dos veces.)
  const primera = useRef(true)
  useEffect(() => {
    if (primera.current) { primera.current = false; return }
    setVerVisitas(PASO_VISITAS); setCambiando(true); void correr()
  }, [periodo, correr])

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.ink} /></View>
  if (fallo) return (
    <View style={s.center}><NoCargo que="tus estadísticas" onReintentar={() => { setLoading(true); void correr() }} /></View>
  )

  // ── las cuentas, todas de la misma lista ─────────────────────────────────
  const ingresos = visitas.reduce((a, v) => a + Number(v.precio_cobrado || 0), 0)
  const nVisitas = visitas.length
  const nClientes = new Set(visitas.map(v => v.cliente_id).filter(Boolean)).size
  const ticket = nVisitas ? Math.round(ingresos / nVisitas) : 0
  const cambio = antes && antes > 0 ? Math.round(((ingresos - antes) / antes) * 100) : null

  const porOrigen = ORIGEN.map(o => ({ ...o, n: visitas.filter(v => v.origen === o.k).length }))
  const otros = nVisitas - porOrigen.reduce((a, o) => a + o.n, 0)

  const servicios = (() => {
    const m = new Map<string, { nombre: string; n: number; dinero: number }>()
    for (const v of visitas) {
      const k = v.servicio_id ?? v.turno_servicios?.nombre ?? '—'
      const e = m.get(k) ?? { nombre: v.turno_servicios?.nombre ?? 'Servicio', n: 0, dinero: 0 }
      e.n++; e.dinero += Number(v.precio_cobrado || 0); m.set(k, e)
    }
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 6)
  })()
  const maxServ = Math.max(1, ...servicios.map(x => x.n))
  const otroLocal = periodo === 'todo' && global && global.visitas > nVisitas

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 14, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void correr() }} />}>
      <PanelBadge />
      <Encabezado titulo="Estadísticas" sub={local ? `Tu silla en ${local}` : null} />
      <Pestanas opciones={PERIODOS} valor={periodo} onCambio={setPeriodo} />

      <View style={[{ marginTop: 22 }, cambiando && { opacity: 0.45 }]}>
        <Text style={s.lbl}>INGRESOS · {TITULO[periodo]}</Text>
        <Text style={s.grande} numberOfLines={1} adjustsFontSizeToFit>{dinero(ingresos, moneda)}</Text>
        {/* La comparación solo cuando hay con qué: «+100 % frente a nada» es
            un número que no dice nada. */}
        {cambio != null && (
          <View style={s.chip}>
            <Text style={s.chipT}>{cambio >= 0 ? '▲' : '▼'} {Math.abs(cambio)}% vs. {ANTES[periodo]}</Text>
          </View>
        )}
      </View>

      <View style={[{ marginTop: 22 }, cambiando && { opacity: 0.45 }]}>
        <Cifras items={[
          { n: nVisitas, l: nVisitas === 1 ? 'visita' : 'visitas' },
          { n: nClientes, l: nClientes === 1 ? 'cliente' : 'clientes', color: COLORS.blue },
          { n: ticket.toLocaleString(), l: `ticket${moneda ? ' ' + moneda : ''}` },
        ]} />
      </View>

      {nVisitas === 0 ? (
        <Text style={s.vacio}>
          {periodo === 'todo' ? 'Todavía no hay visitas cerradas en esta silla.' : 'Ninguna visita en este periodo. Prueba con uno más largo.'}
        </Text>
      ) : (
        <>
          <Rotulo sinRaya>De dónde vinieron</Rotulo>
          <View style={s.barra}>
            {porOrigen.filter(o => o.n > 0).map(o => (
              <View key={o.k} style={{ flex: o.n, backgroundColor: o.color }} />
            ))}
            {otros > 0 && <View style={{ flex: otros, backgroundColor: COLORS.textLight }} />}
          </View>
          <View style={s.leyenda}>
            {porOrigen.filter(o => o.n > 0).map(o => (
              <View key={o.k} style={s.leyItem}>
                <View style={[s.leyCuadro, { backgroundColor: o.color }]} />
                <Text style={s.leyT}>{o.l} {Math.round((o.n / nVisitas) * 100)}%</Text>
              </View>
            ))}
          </View>

          <Rotulo>Por servicio</Rotulo>
          {servicios.map((sv, i) => (
            <View key={`${sv.nombre}-${i}`} style={s.serv}>
              <Text style={s.servN} numberOfLines={2}>{sv.nombre}</Text>
              <View style={s.servBarra}><View style={[s.servLlena, { width: `${(sv.n / maxServ) * 100}%` }]} /></View>
              <Text style={s.servC}>{sv.n}</Text>
            </View>
          ))}
        </>
      )}

      {/* LO QUE DICE LA GENTE. El único bloque oscuro de la pantalla: es la
          cifra que no depende del periodo, y lleva el poste porque habla de
          ti, no de la caja. */}
      <TouchableOpacity style={s.resenas} onPress={() => setVerResenas(true)} disabled={!perfilId} activeOpacity={0.85}
        accessibilityRole="button" accessibilityLabel="Ver tus reseñas">
        <Pole height={6} radius={0} animado={false} />
        <View style={{ padding: 16 }}>
          <View style={s.resFila}>
            <Text style={s.resNota}>{resumen && resumen.total > 0 ? resumen.promedio.toFixed(1) : '—'}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.resT}>Tu calificación</Text>
              <Text style={s.resD}>
                {resumen && resumen.total > 0 ? `${resumen.total} ${resumen.total === 1 ? 'reseña' : 'reseñas'}` : 'Todavía sin reseñas'}
              </Text>
            </View>
            <Text style={s.resVer}>Ver todas</Text>
          </View>
          {!!ultima?.comentario && (
            <Text style={s.resCita} numberOfLines={3}>
              «{ultima.comentario}»{ultima.autor ? ` — ${ultima.autor}` : ''}
            </Text>
          )}
        </View>
      </TouchableOpacity>
      <Resenas perfilId={perfilId} nombre={null} visible={verResenas} onClose={() => setVerResenas(false)} />

      {nVisitas > 0 && (
        <>
          <Rotulo>{`Visitas · ${nVisitas}`}</Rotulo>
          {visitas.slice(0, verVisitas).map((v: any) => (
            <View key={v.id} style={s.fila}>
              <Text style={s.filaF}>{fechaCorta(v.fecha)}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.filaN} numberOfLines={1}>{v.turno_servicios?.nombre ?? 'Servicio'}</Text>
                <Text style={s.filaD}>{nombreOrigen(v.origen)}</Text>
              </View>
              <Text style={s.filaP}>{dinero(v.precio_cobrado, moneda)}</Text>
            </View>
          ))}
          {nVisitas > verVisitas && (
            <TouchableOpacity onPress={() => setVerVisitas(n => n + PASO_VISITAS)} accessibilityRole="button">
              <Text style={s.verMas}>Ver {Math.min(PASO_VISITAS, nVisitas - verVisitas)} más · quedan {nVisitas - verVisitas}</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {otroLocal && global && (
        <Text style={s.nota}>
          Contando todos tus locales: <Text style={s.b}>{dinero(global.ingresos, moneda)}</Text> en {global.visitas} visitas.
        </Text>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  lbl: { fontFamily: FONTS.bold, fontSize: 10, letterSpacing: 2.2, color: COLORS.textLight },
  grande: { fontFamily: FONTS.monoBold, fontSize: 44, lineHeight: 52, letterSpacing: -1, color: COLORS.ink, marginTop: 6 },
  chip: { alignSelf: 'flex-start', backgroundColor: COLORS.ink, paddingHorizontal: 11, paddingVertical: 6, marginTop: 8 },
  chipT: { fontFamily: FONTS.semibold, fontSize: 11.5, color: '#fff' },
  vacio: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textMid, paddingVertical: 22 },
  barra: { flexDirection: 'row', height: 14, marginTop: 10, overflow: 'hidden' },
  leyenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 10 },
  leyItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  leyCuadro: { width: 9, height: 9 },
  leyT: { fontFamily: FONTS.semibold, fontSize: 12, color: COLORS.ink },
  serv: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  servN: { width: 104, fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.ink },
  servBarra: { flex: 1, height: 10, backgroundColor: COLORS.border },
  servLlena: { height: 10, backgroundColor: COLORS.ink },
  servC: { width: 34, textAlign: 'right', fontFamily: FONTS.monoBold, fontSize: 18, color: COLORS.ink },
  resenas: { marginTop: 24, borderRadius: 8, backgroundColor: COLORS.carbon, overflow: 'hidden' },
  resFila: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  resNota: { fontFamily: FONTS.monoBold, fontSize: 40, lineHeight: 46, color: '#fff' },
  resT: { fontFamily: FONTS.semibold, fontSize: 13.5, color: '#fff' },
  resD: { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.onCarbonMid, marginTop: 3 },
  resVer: { fontFamily: FONTS.semibold, fontSize: 12, color: '#fff' },
  resCita: { marginTop: 13, paddingTop: 13, borderTopWidth: 1, borderTopColor: COLORS.carbonDash, borderStyle: 'dashed', fontFamily: FONTS.regular, fontSize: 12.5, lineHeight: 19, color: COLORS.onCarbonMid },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  filaF: { width: 58, fontFamily: FONTS.monoBold, fontSize: 17, color: COLORS.ink },
  filaN: { fontFamily: FONTS.semibold, fontSize: 14.5, color: COLORS.ink },
  filaD: { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textMid, marginTop: 2 },
  filaP: { fontFamily: FONTS.monoBold, fontSize: 18, color: COLORS.ink },
  verMas: { fontFamily: FONTS.semibold, fontSize: 13.5, color: COLORS.blue, textAlign: 'center', paddingVertical: 14 },
  nota: { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textMid, marginTop: 18, lineHeight: 18 },
  b: { fontFamily: FONTS.semibold, color: COLORS.ink },
})
