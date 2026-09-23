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
import { useState, useCallback } from 'react'
import { useRecargaAlEnfocar } from '../../../lib/recarga'
import { getSesion } from '../../../lib/storage'
import { getHistorialCliente, getMisResenas, crearResena, getNegocioById } from '../../../lib/db'
import { dinero, fechaDeISO } from '../../../lib/format'
import { COLORS, FONTS } from '../../../constants'
import { Display, NoCargo, Pole } from '../../../components/ui'
import Hoja from '../../../components/hoja'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/** Lo que quiso decir cada puntuación. La estrella es el gesto; esto es el
 *  significado, y es lo que evita el toque de más. */
/** «12 sep», no «2026-09-12». La fecha está ahí para reconocer la visita, y
 *  un ISO no se reconoce: se descifra. */
function diaCorto(iso?: string | null): string | null {
  if (!iso) return null
  const d = fechaDeISO(iso)
  return `${d.getDate()} ${d.toLocaleDateString('es', { month: 'short' }).replace('.', '')}`
}

const PALABRA: Record<number, string> = {
  1: 'MALO', 2: 'REGULAR', 3: 'BIEN', 4: 'MUY BUENO', 5: 'EXCELENTE',
}

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

  // Cargaba SOLO al montar, y una pestaña no se desmonta al salir de ella:
  // una visita nueva o una reseña recién enviada no aparecían hasta cerrar
  // la app. Ver lib/recarga.
  useRecargaAlEnfocar(cargar)

  async function enviar() {
    if (!activa || rating === 0) { Alert.alert('Elige una calificación', 'Toca las estrellas.'); return }
    setEnviando(true)
    try {
      await crearResena({ visita_id: activa.id, perfil_id: activa.perfil_id, rating, comentario })
      setActiva(null); setRating(0); setComentario(''); await cargar()
    } catch (e: any) { Alert.alert('No se pudo enviar', e.message ?? 'Intenta de nuevo.') }
    finally { setEnviando(false) }
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.ink} /></View>
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
            /* LA VISITA SE LEE COMO LA CITA DE «MI TURNO»: la fecha en un
               bloque a la izquierda —día grande en cifra, mes debajo—,
               servicio y barbero en medio, precio a la derecha. Antes era la
               fecha en ISO dentro de una línea gris, y la fecha es justo lo
               que se busca al bajar por el historial. */
            <View style={s.card}>
              <View style={s.dia}>
                <Text style={s.diaN}>{item.fecha ? fechaDeISO(item.fecha).getDate() : '—'}</Text>
                <Text style={s.diaM}>
                  {item.fecha ? fechaDeISO(item.fecha).toLocaleDateString('es', { month: 'short' }).replace('.', '').toUpperCase() : ''}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.servicio} numberOfLines={1}>{item.turno_servicios?.nombre ?? 'Servicio'}</Text>
                <Text style={s.fecha} numberOfLines={1}>{item.turno_perfiles?.turno_usuarios?.nombre ?? 'Sin barbero'}</Text>
                {ya ? <Text style={s.calificado}>Calificado</Text>
                    : <TouchableOpacity hitSlop={8} onPress={() => { setActiva(item); setRating(0); setComentario('') }}>
                        <Text style={s.calificar}>Calificar</Text>
                      </TouchableOpacity>}
              </View>
              <Text style={s.precio}>{dinero(item.precio_cobrado, moneda)}</Text>
            </View>
          )
        }}
      />

      {/* Hoja compartida: levanta el contenido cuando sale el teclado y cierra
          tocando fuera o con el botón de atrás. Ver components/hoja.tsx. */}
      <Hoja visible={!!activa} onClose={() => setActiva(null)}>
            <Display size={26}>¿Cómo estuvo?</Display>

            {/* QUÉ SE ESTÁ CALIFICANDO, con nombre, fecha y lo que costó.
                «Fade y barba · Jeison» a secas no basta cuando vas al mismo
                sitio cada dos semanas: sin la fecha no se sabe cuál de los
                cinco cortes es este. */}
            <View style={s.rVisita}>
              <View style={s.rIni}>
                <Text style={s.rIniT}>
                  {(activa?.turno_perfiles?.turno_usuarios?.nombre ?? '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rServ}>{activa?.turno_servicios?.nombre ?? 'Servicio'}</Text>
                <Text style={s.rMeta}>
                  {[activa?.turno_perfiles?.turno_usuarios?.nombre, diaCorto(activa?.fecha),
                    activa?.precio_cobrado != null ? dinero(activa.precio_cobrado, moneda) : null]
                    .filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>

            {/* LA PUNTUACIÓN SE DICE CON PALABRAS, no solo con estrellas.
                Cuatro estrellas de cinco es un gesto; «muy bueno» es lo que
                esa persona quiso decir, y es lo que evita el toque de más. */}
            <View style={s.rStars}>
              {[1, 2, 3, 4, 5].map(n => (
                <TouchableOpacity key={n} onPress={() => setRating(n)} hitSlop={6}>
                  <Text style={[s.rStar, n <= rating && { color: COLORS.red }]}>★</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.rPalabra}>{PALABRA[rating] ?? 'TOCA LAS ESTRELLAS'}</Text>

            <Text style={s.rSec}>CUÉNTALE</Text>
            <TextInput style={s.rInput} placeholder="Lo que quieras decirle al barbero."
              placeholderTextColor={COLORS.textLight} value={comentario} onChangeText={setComentario} multiline />

            <View style={s.rPie}>
              <TouchableOpacity style={s.rCta} onPress={enviar} disabled={enviando}>
                {enviando ? <ActivityIndicator color="#fff" /> : <Text style={s.rCtaT}>Enviar reseña</Text>}
              </TouchableOpacity>
              {/* «Cancelar» sonaba a deshacer algo. No se cancela nada: se deja
                  para luego, y la tarjeta seguirá arriba esperando. */}
              <TouchableOpacity onPress={() => setActiva(null)}><Text style={s.rLuego}>Ahora no</Text></TouchableOpacity>
            </View>
      </Hoja>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 20 },
  pedir: { backgroundColor: COLORS.carbon, borderRadius: 8, overflow: 'hidden', marginBottom: 6 },
  pedirCuerpo: { paddingHorizontal: 18, paddingTop: 15, paddingBottom: 17 },
  pedirK: { fontFamily: FONTS.bold, fontSize: 10, letterSpacing: 1.6, color: COLORS.onCarbonMid },
  pedirT: { fontFamily: FONTS.semibold, fontSize: 16, lineHeight: 33, color: '#fff', marginTop: 5 },
  pedirM: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.onCarbonMid, marginTop: 3 },
  pedirStars: { flexDirection: 'row', gap: 12, marginTop: 13 },
  pedirStar: { fontSize: 32, lineHeight: 36, color: COLORS.onCarbonMid },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 1, marginTop: 20, marginBottom: 2 },
  nums: { flexDirection: 'row', gap: 14 },
  num: { flex: 1, paddingVertical: 13, paddingRight: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  numN: { fontFamily: FONTS.monoBold, fontSize: 30, lineHeight: 32, color: COLORS.ink },
  numSm: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink, lineHeight: 32 },
  numL: { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textLight, marginTop: 3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  empty: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textLight, textAlign: 'center', paddingVertical: 40 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border },
  dia: { width: 52, height: 52, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  diaN: { fontFamily: FONTS.monoBold, fontSize: 21, lineHeight: 24, color: COLORS.ink },
  diaM: { fontFamily: FONTS.bold, fontSize: 9.5, color: COLORS.textLight, letterSpacing: 1.2 },
  servicio: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  fecha: { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textMid, marginTop: 2 },
  // Una acción en rojo con mayúsculas espaciadas, no un «★ Calificar» con
  // emoji: la estrella ya es de la hoja que se abre.
  calificar: { fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 1.4, color: COLORS.blue, marginTop: 6, textTransform: 'uppercase' },
  calificado: { fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 1.4, color: COLORS.textLight, marginTop: 6, textTransform: 'uppercase' },
  precio: { fontFamily: FONTS.monoBold, fontSize: 20, color: COLORS.ink },
  rVisita: { flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 14, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  rIni: { width: 46, height: 46, backgroundColor: COLORS.blueLight, alignItems: 'center', justifyContent: 'center' },
  rIniT: { fontFamily: FONTS.semibold, fontSize: 21, color: COLORS.blue },
  rServ: { fontFamily: FONTS.semibold, fontSize: 15.5, color: COLORS.ink },
  rMeta: { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textMid, marginTop: 2 },
  rStars: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 22 },
  rStar: { fontFamily: FONTS.bold, fontSize: 46, lineHeight: 50, color: COLORS.border },
  rPalabra: { fontFamily: FONTS.bold, fontSize: 12, letterSpacing: 1.6, color: COLORS.textMid,
    textAlign: 'center', marginTop: 8 },
  rSec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 1, marginTop: 22 },
  rInput: { borderWidth: 1, borderColor: COLORS.border, padding: 13, fontSize: 13.5, fontFamily: FONTS.regular, color: COLORS.ink, minHeight: 104, textAlignVertical: 'top', marginTop: 11 },
  rPie: { borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 18, paddingTop: 14 },
  rCta: { backgroundColor: COLORS.ink, height: 56, alignItems: 'center', justifyContent: 'center' },
  rCtaT: { fontFamily: FONTS.semibold, fontSize: 16, color: '#fff' },
  rLuego: { fontFamily: FONTS.semibold, textAlign: 'center', color: COLORS.textMid, fontSize: 12.5, marginTop: 11 },
})
