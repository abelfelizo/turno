/**
 * MI BARBERÍA — quién trabaja, qué cobra cada uno, y mis recortes.
 *
 * Es la pantalla a la que se viene ANTES de decidir. Recoge lo que estaba
 * repartido entre Inicio (la marca, la tira de locales, el catálogo de
 * barberos) y Perfil (la fidelidad, los vales), que era una de las cinco
 * duplicaciones del recorrido viejo.
 *
 * CADA BARBERO CON SUS PRECIOS, y esto no es un detalle de presentación:
 * `turno_servicios` cuelga de `perfil_id`, no del negocio. El que alquila su
 * silla pone los suyos y cobra lo suyo (migración 117). Una lista única de
 * precios, como la que había, contaba una mentira sobre el negocio.
 *
 * Y LA FIDELIDAD TAMBIÉN ES POR BARBERO. `turno_mis_tarjetas` puede devolver
 * varias: donde se alquilan asientos cada uno lleva su programa. El rótulo
 * dice de quién es —CON JEISON frente a BARBERÍA DÁVILA— porque es a quien se
 * le reclama el premio.
 */
import { useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Linking, Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useRecargaAlEnfocar } from '../../../lib/recarga'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getSesion, guardarSesion } from '../../../lib/storage'
import {
  getNegocioById, getMisNegociosCliente, getPerfilesNegocio, getEstadoLocal,
  getMisTarjetas, getMisCanjesActivos, getMiUsuario, getMiPreferido,
  emitirCanje, salirLocal, getRatingsNegocio,
} from '../../../lib/db'
import { dinero } from '../../../lib/format'
import { direccionCompleta } from '../../../lib/paises'
import { COLORS, FONTS, GLASS } from '../../../constants'
import { Avatar, NoCargo } from '../../../components/ui'
import Resenas from '../../../components/resenas'

export default function MiBarberia() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [sesion, setSesion] = useState<any>(null)
  const [negocio, setNegocio] = useState<any>(null)
  const [locales, setLocales] = useState<any[]>([])
  const [perfiles, setPerfiles] = useState<any[]>([])
  const [estado, setEstado] = useState<any[]>([])
  const [tarjetas, setTarjetas] = useState<any[]>([])
  const [vales, setVales] = useState<any[]>([])
  const [preferido, setPreferido] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  /**
   * LAS ESTRELLAS Y LO QUE HAY DETRÁS.
   *
   * Vivían en la lista de barberos de «Mi turno», y esa lista se fue: quedó
   * la nota sin el texto, o sea nada. Aquí es donde se mira a cada uno, así
   * que aquí van — y se tocan, porque una media sin las palabras que la
   * hicieron no ayuda a decidir con quién te sientas.
   */
  const [ratings, setRatings] = useState<Record<string, { promedio: number; total: number }>>({})
  const [resenasDe, setResenasDe] = useState<{ id: string; nombre?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  /** «La barbería no tiene barberos» y «no pude preguntar» no son lo mismo. */
  const [fallo, setFallo] = useState(false)
  const [canjeando, setCanjeando] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // EL LOCAL Y SU GENTE VAN SIN `.catch` (auditoría 4).
  //
  // Esta pantalla nació en la reestructuración con las ocho llamadas tapadas y
  // un `try` sin `catch`, así que un tirón de red la pintaba entera: una
  // barbería sin barberos, sin tarjetas y sin vales, en silencio. El cliente lo
  // lee como «aquí no trabaja nadie» y se va — que es la mentira concreta que
  // la auditoría 4 existía para matar.
  //
  // Sin destapar quedan las accesorias: sin el estado del local, sin los otros
  // locales o sin las estrellas la pantalla enseña menos, pero lo que enseña es
  // verdad.
  const cargar = useCallback(async () => {
    try {
      setFallo(false)
      const ss = await getSesion()
      if (!ss?.negocio_id) { setLoading(false); return }
      setSesion(ss)
      const u = await getMiUsuario().catch(() => null)
      const [neg, locs, ps, est, tjs, vs, pref, rt] = await Promise.all([
        getNegocioById(ss.negocio_id),
        u?.id ? getMisNegociosCliente(u.id).catch(() => []) : Promise.resolve([]),
        getPerfilesNegocio(ss.negocio_id),
        getEstadoLocal(ss.negocio_id).catch(() => []),
        getMisTarjetas(ss.negocio_id).catch(() => []),
        u?.id ? getMisCanjesActivos(u.id, ss.negocio_id).catch(() => []) : Promise.resolve([]),
        getMiPreferido(ss.negocio_id).catch(() => null),
        getRatingsNegocio(ss.negocio_id).catch(() => ({})),
      ])
      setNegocio(neg); setLocales(locs as any[]); setPerfiles(ps as any[]); setRatings(rt as any)
      setEstado((est ?? []) as any[]); setTarjetas(tjs as any[]); setVales(vs as any[])
      setPreferido((pref as any)?.perfil_id ?? (pref as any) ?? null)
      // El tuyo abierto de entrada: es el que vas a mirar. Los demás plegados
      // con su resumen, que es lo que decide si merece la pena abrirlos.
      const p = (pref as any)?.perfil_id ?? (pref as any) ?? null
      setAbierto(p ?? (ps as any[])[0]?.id ?? null)
    } catch {
      setFallo(true)
    } finally { setLoading(false); setRefreshing(false) }
  }, [])

  useRecargaAlEnfocar(cargar)

  /** El cliente emite el vale al llegar a la meta. Lo aplica el barbero al
   *  cobrar: el cliente nunca marca su propio cobro. */
  async function canjear(perfil_id?: string | null) {
    const ss = await getSesion(); if (!ss?.negocio_id) return
    setCanjeando(true)
    try {
      await emitirCanje(ss.negocio_id, perfil_id ?? null)
      Alert.alert('Vale listo', 'Muéstraselo a tu barbero al cobrar.')
      cargar()
    } catch (e: any) {
      Alert.alert('No se pudo canjear', e?.message ?? 'Intenta de nuevo.')
    } finally { setCanjeando(false) }
  }

  function salirDeEsteLocal() {
    Alert.alert('Salir de la barbería',
      'Dejas de verla en tu app. Tu historial y tus recortes se quedan guardados por si vuelves.',
      [{ text: 'No' }, { text: 'Salir', style: 'destructive', onPress: async () => {
        const ss = await getSesion(); if (!ss?.negocio_id) return
        try { await salirLocal(ss.negocio_id); router.replace('/') }
        catch (e: any) { Alert.alert('No se pudo', e?.message ?? 'Intenta de nuevo.') }
      } }])
  }

  async function cambiarLocal(negocio_id: string) {
    const ss = await getSesion(); if (!ss) return
    await guardarSesion({ ...ss, negocio_id })
    setLoading(true); cargar()
  }

  if (loading) {
    return <View style={s.centro}><ActivityIndicator color={COLORS.ink} size="large" /></View>
  }
  if (fallo) {
    return (
      <View style={s.centro}>
        <NoCargo que="tu barbería" onReintentar={() => { setLoading(true); cargar() }} />
      </View>
    )
  }

  const estadoDe = (perfil_id: string) => estado.find((x: any) => x.perfil_id === perfil_id)

  return (
    <ScrollView
      style={s.pagina}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 20, paddingBottom: 36 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar() }} />}>

      {/* La marca del local, con la dirección entera: sector, ciudad y el punto
          de referencia, que es como se explica aquí dónde queda un sitio. */}
      <View style={s.marca}>
        <Avatar name={negocio?.nombre} uri={negocio?.logo_url} size={56} bg={COLORS.carbon} />
        <View style={{ flex: 1 }}>
          <Text style={s.marcaN}>{negocio?.nombre ?? 'Tu barbería'}</Text>
          {!!negocio?.slogan && <Text style={s.marcaS}>{negocio.slogan}</Text>}
          {!!direccionCompleta(negocio ?? {}) && (
            <Text style={s.marcaD} numberOfLines={2}>{direccionCompleta(negocio ?? {})}</Text>
          )}
        </View>
      </View>

      {locales.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ marginTop: 14 }} contentContainerStyle={{ gap: 7 }}>
          {locales.map((l: any) => {
            const on = l.negocio_id === sesion?.negocio_id
            return (
              <TouchableOpacity key={l.negocio_id} style={[s.chipLocal, on && s.chipLocalOn]}
                onPress={() => !on && cambiarLocal(l.negocio_id)}>
                <Text style={[s.chipLocalT, on && { color: COLORS.onInk }]} numberOfLines={1}>{l.nombre}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}

      {/* EL OBJETO OSCURO DE ESTA PANTALLA: la fidelidad. Solo sale si hay
          programa activo — sin activar, turno_mis_tarjetas ya no lo devuelve,
          así que no hay que anunciar una carencia. */}
      {tarjetas.map((t: any) => {
        const enCiclo = t.meta > 0 ? t.visitas % t.meta : 0
        const listo = t.visitas >= t.meta
        const pct = t.meta > 0 ? Math.min(100, Math.round((enCiclo / t.meta) * 100)) : 0
        return (
          <View key={t.perfil_id ?? 'local'} style={s.fidel}>
            <View style={s.fidelHead}>
              <Text style={s.fidelLbl}>
                {t.ambito === 'perfil' && t.barbero
                  ? `FIDELIDAD · CON ${String(t.barbero).toUpperCase()}`
                  : `FIDELIDAD · ${String(negocio?.nombre ?? 'EL LOCAL').toUpperCase()}`}
              </Text>
              <Text style={s.fidelNum}>{enCiclo} / {t.meta}</Text>
            </View>
            <View style={s.barra}><View style={[s.barraFill, { width: `${listo ? 100 : pct}%` }]} /></View>
            <View style={s.fidelFoot}>
              <Text style={s.fidelPremio} numberOfLines={1}>{t.premio}</Text>
              <Text style={s.fidelFaltan}>
                {listo ? '¡Disponible!' : `Faltan ${Math.max(0, t.meta - enCiclo)}`}
              </Text>
            </View>
            {listo && (
              <TouchableOpacity style={s.canjear} onPress={() => canjear(t.perfil_id)} disabled={canjeando}>
                {canjeando ? <ActivityIndicator color={COLORS.carbon} />
                  : <Text style={s.canjearT} numberOfLines={1}>Canjear: {t.premio}</Text>}
              </TouchableOpacity>
            )}
          </View>
        )
      })}

      {vales.length > 0 && (
        <View style={s.vale}>
          <Text style={s.valeN}>{vales.length} vale{vales.length === 1 ? '' : 's'}</Text>
          <Text style={s.valeD} numberOfLines={1}>{vales[0]?.premio ?? 'Premio'} · muéstralo al cobrar</Text>
        </View>
      )}

      <Seccion titulo="El equipo y sus precios" />
      <Text style={s.nota}>
        Cada barbero tiene sus servicios y sus precios. El que renta su silla,
        además, pone los suyos aparte del local.
      </Text>

      {perfiles.length === 0 && <Text style={s.vacio}>Todavía no hay barberos dados de alta aquí.</Text>}

      {perfiles.map((p: any) => (
        <Barbero
          key={p.id}
          perfil={p}
          estado={estadoDe(p.id)}
          preferido={p.id === preferido}
          abierto={abierto === p.id}
          onAbrir={() => setAbierto(abierto === p.id ? null : p.id)}
          onFila={() => router.push({ pathname: '/(app)/cliente/turno', params: { perfil: p.id } })}
          onAgendar={() => router.push({ pathname: '/(app)/cliente/agendar', params: { perfil: p.id } })}
          moneda={negocio?.moneda}
          rating={ratings[p.id]}
          onResenas={() => setResenasDe({ id: p.id, nombre: p.turno_usuarios?.nombre })}
        />
      ))}

      <TouchableOpacity style={s.salir} onPress={salirDeEsteLocal}>
        <Text style={s.salirT}>Salir de esta barbería</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.agregar} onPress={() => router.push('/(app)/cliente/buscar-barbero')}>
        <Text style={s.agregarT}>Agregar con un código</Text>
        <View style={{ flex: 1 }} />
        <Ionicons name="add" size={20} color={COLORS.ink} />
      </TouchableOpacity>

      <Resenas perfilId={resenasDe?.id ?? null} nombre={resenasDe?.nombre}
        visible={!!resenasDe} onClose={() => setResenasDe(null)} />
    </ScrollView>
  )
}

/* ───────────────────────────── un barbero ───────────────────────────────── */

function Barbero({ perfil, estado, preferido, abierto, onAbrir, onFila, onAgendar, moneda, rating, onResenas }: any) {
  const u = perfil?.turno_usuarios ?? {}
  const servicios: any[] = perfil?.turno_servicios ?? []
  const activos = servicios.filter((x: any) => x.activo !== false)
  const desde = activos.length ? Math.min(...activos.map((x: any) => Number(x.precio) || 0)) : null

  const cerrada = estado?.fila_abierta === false
  const est = cerrada ? (estado?.modo === 'solo_citas' ? 'Solo con cita' : 'Cerrado')
    : estado?.estado === 'libre' ? 'Libre'
    : estado?.estado === 'atendiendo' ? 'Atendiendo'
    : estado?.estado === 'descanso' ? 'En pausa'
    : estado?.en_cola > 0 ? `${estado.en_cola} esperando` : '—'
  const estCol = cerrada ? COLORS.textLight
    : estado?.estado === 'libre' ? COLORS.success
    : estado?.estado === 'descanso' ? COLORS.warning
    : COLORS.blue

  return (
    <View style={[s.barbero, preferido && { borderLeftColor: COLORS.red }]}>
      <View style={s.bHead}>
        <Avatar name={u.nombre} uri={u.foto_url} size={46}
          bg={preferido ? COLORS.red : COLORS.blueLight} color={preferido ? '#fff' : COLORS.blue} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.bNombreFila}>
            <Text style={s.bNombre} numberOfLines={1}>{u.nombre ?? 'Barbero'}</Text>
            {preferido && <Text style={s.bTuyo}>TU BARBERO</Text>}
          </View>
          {/* La nota se toca: era un número suelto y lo que la gente escribió
              no se leía en ningún sitio de la app. */}
          <TouchableOpacity onPress={rating ? onResenas : undefined} disabled={!rating} hitSlop={6}>
            <Text style={s.bMeta} numberOfLines={1}>
              {[u.especialidad || 'Barbero',
                perfil?.rol === 'barbero_renta' ? 'pone sus precios' : null,
                rating ? `★ ${rating.promedio} (${rating.total})` : 'Sin reseñas'].filter(Boolean).join(' · ')}
              {rating ? '  ·  ver reseñas' : ''}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={[s.bEstado, { color: estCol }]} numberOfLines={1}>{est}</Text>
        <Contacto whatsapp={u.whatsapp} telefono={u.telefono} instagram={u.instagram} nombre={u.nombre} />
      </View>

      {abierto ? (
        <>
          <View style={{ marginTop: 10 }}>
            {activos.map((sv: any) => (
              <View key={sv.id} style={s.servicio}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.svN} numberOfLines={1}>{sv.nombre}</Text>
                  <Text style={s.svD}>{sv.duracion_min} min</Text>
                </View>
                <Text style={s.svP}>{dinero(sv.precio, moneda)}</Text>
              </View>
            ))}
            {activos.length === 0 && <Text style={s.vacio}>Aún no ha cargado sus servicios.</Text>}
          </View>
          <View style={s.bAcciones}>
            {!cerrada && (
              <TouchableOpacity style={[s.bBtn, s.bBtnRojo]} onPress={onFila}>
                <Text style={s.bBtnT} numberOfLines={1}>Fila con {String(u.nombre ?? '').split(' ')[0]}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[s.bBtn, s.bBtnContorno]} onPress={onAgendar}>
              <Text style={[s.bBtnT, { color: COLORS.ink }]}>Reservar</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <TouchableOpacity style={s.plegado} onPress={onAbrir}>
          <Text style={s.plegadoT}>
            {activos.length} servicio{activos.length === 1 ? '' : 's'}
            {desde != null ? ` · desde ${dinero(desde, moneda)}` : ''}
          </Text>
          <View style={{ flex: 1 }} />
          <Ionicons name="chevron-down" size={17} color={COLORS.ink} />
        </TouchableOpacity>
      )}
    </View>
  )
}

/**
 * HABLAR CON ÉL, SIN SALIR A BUSCAR EL NÚMERO.
 * El dato ya viajaba: getPerfilesNegocio trae `whatsapp`, `instagram` y
 * `telefono` del barbero. Cada icono solo sale si ese dato existe — un botón
 * que no lleva a ninguna parte es peor que no tenerlo.
 */
function Contacto({ whatsapp, telefono, instagram, nombre }: any) {
  const wa = (whatsapp || telefono || '').replace(/[^0-9]/g, '')
  const tel = (telefono || '').replace(/[^0-9+]/g, '')
  const ig = (instagram || '').replace(/^@/, '').trim()
  if (!wa && !tel && !ig) return null

  async function abrir(url: string, fallback?: string) {
    try {
      const ok = await Linking.canOpenURL(url)
      await Linking.openURL(ok ? url : (fallback ?? url))
    } catch {
      Alert.alert('No se pudo abrir', `Escríbele a ${nombre ?? 'tu barbero'} por tu cuenta.`)
    }
  }

  return (
    <View style={s.contacto}>
      {!!wa && (
        <TouchableOpacity style={[s.ico, { borderColor: COLORS.success }]}
          accessibilityRole="button" accessibilityLabel="Escribir por WhatsApp"
          onPress={() => abrir(`whatsapp://send?phone=${wa}`, `https://wa.me/${wa}`)}>
          <Ionicons name="logo-whatsapp" size={15} color={COLORS.success} />
        </TouchableOpacity>
      )}
      {!!ig && (
        <TouchableOpacity style={[s.ico, { borderColor: COLORS.red }]}
          accessibilityRole="button" accessibilityLabel="Ver su Instagram"
          onPress={() => abrir(`instagram://user?username=${ig}`, `https://instagram.com/${ig}`)}>
          <Ionicons name="logo-instagram" size={15} color={COLORS.ink} />
        </TouchableOpacity>
      )}
      {!!tel && (
        <TouchableOpacity style={[s.ico, { borderColor: COLORS.ink }]}
          accessibilityRole="button" accessibilityLabel="Llamar"
          onPress={() => abrir(`tel:${tel}`)}>
          <Ionicons name="call" size={14} color={COLORS.ink} />
        </TouchableOpacity>
      )}
    </View>
  )
}

function Seccion({ titulo }: { titulo: string }) {
  return (
    <View style={{ marginTop: 24 }}>
      <Text style={s.sec}>{titulo.toUpperCase()}</Text>
      <View style={s.secRegla} />
    </View>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: 'transparent' },
  centro: { flex: 1, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },

  marca: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  marcaN: { fontFamily: FONTS.bold, letterSpacing: -0.6, fontSize: 28, lineHeight: 29, color: COLORS.ink },
  marcaS: { fontFamily: FONTS.semibold, fontSize: 12.5, color: COLORS.textMid, marginTop: 3 },
  marcaD: { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textLight, marginTop: 4, lineHeight: 17 },

  chipLocal: { paddingVertical: 7, paddingHorizontal: 13, borderWidth: 1, borderColor: GLASS.border, borderRadius: 999, backgroundColor: GLASS.fill },
  chipLocalOn: { backgroundColor: COLORS.ink, borderColor: COLORS.ink, borderRadius: 26 },
  chipLocalT: { fontFamily: FONTS.semibold, fontSize: 11.5, color: COLORS.textMid },

  fidel: { marginTop: 18, backgroundColor: GLASS.ink, borderRadius: 26, padding: 17 },
  fidelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
  fidelLbl: { flex: 1, fontFamily: FONTS.bold, fontSize: 10.5, letterSpacing: 1.2, color: COLORS.onCarbonMid },
  fidelNum: { fontFamily: FONTS.monoBold, fontSize: 22, color: '#fff' },
  barra: { height: 10, backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 12, borderRadius: 5 },
  barraFill: { height: 10, backgroundColor: COLORS.red, borderRadius: 5 },
  fidelFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 11, gap: 10 },
  fidelPremio: { flex: 1, fontFamily: FONTS.semibold, fontSize: 12.5, color: COLORS.onCarbonMid },
  fidelFaltan: { fontFamily: FONTS.semibold, fontSize: 12.5, color: '#fff' },

  vale: { marginTop: 10, borderWidth: 1, borderColor: GLASS.border, borderRadius: GLASS.radioCard, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: GLASS.fill },
  valeN: { fontFamily: FONTS.monoBold, fontSize: 15, color: COLORS.ink },
  valeD: { flex: 1, fontFamily: FONTS.semibold, fontSize: 12, color: COLORS.textMid },

  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 1, marginTop: 10, marginBottom: 10 },
  secRegla: { height: 0, marginTop: 4 },
  nota: { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textMid, marginTop: 11, lineHeight: 18 },
  vacio: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textLight, marginTop: 10 },

  barbero: { backgroundColor: GLASS.fill, borderWidth: 1, borderColor: GLASS.border, borderRadius: GLASS.radioCard, padding: 14, marginBottom: 8, marginTop: 16 },
  bHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  bNombreFila: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  bNombre: { fontFamily: FONTS.semibold, letterSpacing: -0.3, fontSize: 19, color: COLORS.ink, flexShrink: 1 },
  bTuyo: { fontFamily: FONTS.bold, fontSize: 8.5, letterSpacing: 0.5, color: COLORS.onInk, backgroundColor: COLORS.ink, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  bMeta: { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textMid, marginTop: 2 },
  bEstado: { fontFamily: FONTS.semibold, fontSize: 11.5 },

  contacto: { flexDirection: 'row', gap: 6, marginLeft: 3 },
  ico: { width: 30, height: 30, borderWidth: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },

  servicio: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, backgroundColor: GLASS.fillStrong, borderRadius: 16, padding: 14, marginTop: 8 },
  svN: { fontFamily: FONTS.semibold, fontSize: 14.5, color: COLORS.ink },
  svD: { fontFamily: FONTS.regular, fontSize: 11.5, color: COLORS.textMid, marginTop: 1 },
  svP: { fontFamily: FONTS.monoBold, fontSize: 18, color: COLORS.ink },

  bAcciones: { flexDirection: 'row', gap: 9, marginTop: 13 },
  bBtn: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' },
  bBtnRojo: { backgroundColor: COLORS.ink, borderRadius: 26 },
  bBtnContorno: { borderWidth: 1, borderColor: GLASS.border, borderRadius: GLASS.radioCard, backgroundColor: GLASS.fill },
  bBtnT: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.onInk },

  plegado: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: GLASS.hairline },
  plegadoT: { fontFamily: FONTS.semibold, fontSize: 12.5, color: COLORS.textMid },

  canjear: { backgroundColor: GLASS.fill, padding: 14, alignItems: 'center', marginTop: 14, borderRadius: GLASS.radioCard, borderWidth: 1, borderColor: GLASS.border },
  canjearT: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.carbon, letterSpacing: 0 },
  salir: { marginTop: 26, paddingVertical: 13, alignItems: 'center' },
  salirT: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textMid },
  agregar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24, borderWidth: 1, borderColor: GLASS.border, padding: 15, borderRadius: GLASS.radioCard, backgroundColor: GLASS.fill },
  agregarT: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.ink },
})
