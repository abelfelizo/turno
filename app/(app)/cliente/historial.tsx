/**
 * HISTORIAL: LO QUE YA PASÓ, Y LO ÚNICO QUE QUEDA PENDIENTE DE ÉL.
 *
 * Aquí se mudaron TUS NÚMEROS —visitas, gasto, tu servicio y tu barbero de
 * siempre—, que vivían en el perfil. No pintaban nada ahí: el perfil es quién
 * eres, y esto es lo que hiciste. Además son la suma de esta misma lista, así
 * que el número y su origen se leen juntos y se pueden comprobar.
 *
 * Y arriba del todo, la reseña pendiente. Era un enlace gris dentro de cada
 * fila, perdido entre veinte: la gente no reseña porque no ve dónde. Ahora la
 * más reciente sin calificar sube y es el único objeto oscuro de la pantalla.
 * Una sola, la última: pedir cinco reseñas a la vez no consigue ninguna.
 */
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, TextInput, Alert } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { getSesion } from '../../../lib/storage'
import { getHistorialCliente, getMisResenas, crearResena, getNegocioById } from '../../../lib/db'
import { dinero } from '../../../lib/format'
import { COLORS, FONTS } from '../../../constants'
import { Display, NoCargo, Pole } from '../../../components/ui'
import Hoja from '../../../components/hoja'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/** El que más se repite. Un solo recorrido: la lista puede ser larga. */
function masFrecuente(arr: any[], key: (x: any) => string | undefined): string | null {
  const m: Record<string, number> = {}
  arr.forEach(x => { const k = key(x); if (k) m[k] = (m[k] || 0) + 1 })
  const top = Object.entries(m).sort((a, b) => b[1] - a[1])[0]
  return top ? top[0] : null
}

export default function Historial() {
  // El hueco de arriba lo dice el sistema, no un número: en un teléfono con
  // isla dinámica 72 px se quedaban cortos y en uno sin muesca sobraban.
  const insets = useSafeAreaInsets()
  const [visitas, setVisitas] = useState<any[]>([])
  const [resenadas, setResenadas] = useState<string[]>([])
  const [moneda, setMoneda] = useState('')
  const [loading, setLoading] = useState(true)
  const [fallo, setFallo] = useState(false)
  const [activa, setActiva] = useState<any>(null)
  const [rating, setRating] = useState(0)
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)

  // El historial va sin `.catch`: es la pantalla entera. Si esa llamada se cae
  // y se devuelve una lista vacía, el cliente lee "aún no tienes visitas" y se
  // cree que se le perdieron los cortes. Las reseñas y la moneda sí lo
  // conservan: sin ellas la lista sigue diciendo la verdad.
  const cargar = useCallback(async () => {
    try {
      setFallo(false)
      const ss = await getSesion()
      if (!ss?.usuario_id || !ss?.negocio_id) return
      const [h, r, neg] = await Promise.all([
        getHistorialCliente(ss.usuario_id, ss.negocio_id),
        getMisResenas(ss.usuario_id).catch(() => []),
        getNegocioById(ss.negocio_id).catch(() => null),
      ])
      setVisitas(h as any[]); setResenadas(r as string[]); setMoneda(neg?.moneda ?? '')
    } catch {
      setFallo(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function enviar() {
    if (!activa || rating === 0) { Alert.alert('Elige una calificación', 'Toca las estrellas.'); return }
    setEnviando(true)
    try {
      await crearResena({ visita_id: activa.id, perfil_id: activa.perfil_id, rating, comentario })
      setActiva(null); setRating(0); setComentario(''); await cargar()
    } catch (e: any) { Alert.alert('No se pudo enviar', e.message ?? 'Intenta de nuevo.') }
    finally { setEnviando(false) }
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>
  if (fallo) return (
    <View style={s.center}>
      <NoCargo que="tu historial" onReintentar={() => { setLoading(true); cargar() }} />
    </View>
  )

  // La visita más reciente sin calificar. `getHistorialCliente` ya ordena por
  // fecha descendente, así que la primera que encuentre es la última que pasó.
  const pendiente = visitas.find(v => !resenadas.includes(v.id)) ?? null
  const totalGastado = visitas.reduce((sum, h) => sum + Number(h.precio_cobrado || 0), 0)
  const barberoFav = masFrecuente(visitas, h => h.turno_perfiles?.turno_usuarios?.nombre)
  const servicioFav = masFrecuente(visitas, h => h.turno_servicios?.nombre)

  return (
    <View style={[s.container, { paddingTop: insets.top + 12 }]}>
      <Display size={26} style={{ marginBottom: 18 }}>Historial</Display>
      <FlatList
        data={visitas} keyExtractor={(it) => it.id} showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Text style={s.empty}>Aún no tienes visitas registradas.</Text>}
        ListHeaderComponent={
          <>
            {pendiente && (
              <View style={s.pedir}>
                <Pole height={7} radius={0} />
                <View style={s.pedirCuerpo}>
                  <Text style={s.pedirK}>TU ÚLTIMO CORTE</Text>
                  <Text style={s.pedirT}>¿Cómo estuvo?</Text>
                  <Text style={s.pedirM} numberOfLines={1}>
                    {pendiente.turno_servicios?.nombre ?? 'Servicio'}
                    {pendiente.turno_perfiles?.turno_usuarios?.nombre ? ` · ${pendiente.turno_perfiles.turno_usuarios.nombre}` : ''}
                  </Text>
                  {/* Las estrellas ABREN la hoja con esa puntuación ya puesta.
                      Tocar una estrella y que solo se abra un formulario en
                      blanco es pedir el mismo gesto dos veces. */}
                  <View style={s.pedirStars}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <TouchableOpacity key={n} hitSlop={6}
                        onPress={() => { setActiva(pendiente); setRating(n); setComentario('') }}>
                        <Text style={s.pedirStar}>★</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {visitas.length > 0 && (
              <>
                <Text style={s.sec}>TUS NÚMEROS AQUÍ</Text>
                <View style={s.nums}>
                  <View style={s.num}>
                    <Text style={s.numN}>{visitas.length}</Text>
                    <Text style={s.numL}>visitas</Text>
                  </View>
                  <View style={s.num}>
                    <Text style={s.numN}>{dinero(totalGastado, moneda)}</Text>
                    <Text style={s.numL}>gastado</Text>
                  </View>
                </View>
                <View style={s.nums}>
                  <View style={s.num}>
                    <Text style={s.numSm} numberOfLines={1}>{servicioFav ?? '—'}</Text>
                    <Text style={s.numL}>tu servicio</Text>
                  </View>
                  <View style={s.num}>
                    <Text style={s.numSm} numberOfLines={1}>{barberoFav ?? '—'}</Text>
                    <Text style={s.numL}>tu barbero</Text>
                  </View>
                </View>
                <Text style={s.sec}>CADA VISITA</Text>
              </>
            )}
          </>
        }
        renderItem={({ item }) => {
          const ya = resenadas.includes(item.id)
          return (
            <View style={s.card}>
              <View style={{ flex: 1 }}>
                <Text style={s.servicio}>{item.turno_servicios?.nombre ?? 'Servicio'}</Text>
                <Text style={s.fecha}>{item.fecha} · {item.turno_perfiles?.turno_usuarios?.nombre ?? ''}</Text>
                {ya ? <Text style={s.calificado}>✓ Calificado</Text>
                    : <TouchableOpacity onPress={() => { setActiva(item); setRating(0); setComentario('') }}><Text style={s.calificar}>★ Calificar</Text></TouchableOpacity>}
              </View>
              <Text style={s.precio}>{dinero(item.precio_cobrado, moneda)}</Text>
            </View>
          )
        }}
      />

      {/* Hoja compartida: levanta el contenido cuando sale el teclado y cierra
          tocando fuera o con el botón de atrás. Ver components/hoja.tsx. */}
      <Hoja visible={!!activa} onClose={() => setActiva(null)}>
            <Display size={22}>¿Cómo estuvo?</Display>
            <Text style={s.modalSub}>{activa?.turno_servicios?.nombre} · {activa?.turno_perfiles?.turno_usuarios?.nombre ?? ''}</Text>
            <View style={s.stars}>
              {[1, 2, 3, 4, 5].map(n => (
                <TouchableOpacity key={n} onPress={() => setRating(n)}><Text style={[s.star, n <= rating && { color: COLORS.red }]}>★</Text></TouchableOpacity>
              ))}
            </View>
            <TextInput style={s.input} placeholder="Comentario (opcional)" placeholderTextColor={COLORS.textLight} value={comentario} onChangeText={setComentario} multiline />
            <TouchableOpacity style={s.btn} onPress={enviar} disabled={enviando}>
              {enviando ? <ActivityIndicator color="#fff" /> : <Text style={s.btnT}>Enviar reseña</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setActiva(null)}><Text style={s.cerrar}>Cancelar</Text></TouchableOpacity>
      </Hoja>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 16 },
  pedir: { backgroundColor: COLORS.carbon, borderRadius: 6, overflow: 'hidden', marginBottom: 6 },
  pedirCuerpo: { paddingHorizontal: 18, paddingTop: 15, paddingBottom: 17 },
  pedirK: { fontFamily: FONTS.bold, fontSize: 10, letterSpacing: 1.6, color: COLORS.onCarbonMid },
  pedirT: { fontFamily: FONTS.display, fontSize: 30, lineHeight: 33, color: '#fff', textTransform: 'uppercase', marginTop: 5 },
  pedirM: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.onCarbonMid, marginTop: 3 },
  pedirStars: { flexDirection: 'row', gap: 12, marginTop: 13 },
  pedirStar: { fontSize: 32, lineHeight: 36, color: 'rgba(255,255,255,0.4)' },
  sec: { fontFamily: FONTS.bold, fontSize: 11, color: COLORS.textLight, letterSpacing: 2,
    borderBottomWidth: 2, borderBottomColor: COLORS.ink, paddingBottom: 8, marginTop: 20, marginBottom: 2 },
  nums: { flexDirection: 'row', gap: 14 },
  num: { flex: 1, paddingVertical: 13, paddingRight: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  numN: { fontFamily: FONTS.display, fontSize: 30, lineHeight: 32, color: COLORS.ink },
  numSm: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink, lineHeight: 32 },
  numL: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  empty: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, textAlign: 'center', paddingVertical: 40 },
  card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.border },
  servicio: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  fecha: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 3 },
  calificar: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.red, marginTop: 6 },
  calificado: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.success, marginTop: 6 },
  precio: { fontFamily: FONTS.display, fontSize: 22, color: COLORS.ink },
  modalSub: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, marginTop: 6, marginBottom: 16 },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },
  star: { fontSize: 42, color: '#D8D6D1' },
  input: { borderWidth: 2, borderColor: COLORS.ink, borderRadius: 4, padding: 14, fontSize: 15, fontFamily: FONTS.medium, minHeight: 70, textAlignVertical: 'top', marginBottom: 16 },
  btn: { backgroundColor: COLORS.red, borderRadius: 6, padding: 16, alignItems: 'center' },
  btnT: { fontFamily: FONTS.bold, fontSize: 16, color: '#fff' },
  cerrar: { fontFamily: FONTS.semibold, textAlign: 'center', color: COLORS.textLight, fontSize: 14, marginTop: 14 },
})
