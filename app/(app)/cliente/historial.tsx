import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, Modal, TextInput, Alert } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { getSesion } from '../../../lib/storage'
import { getHistorialCliente, getMisResenas, crearResena } from '../../../lib/db'
import { COLORS, FONTS } from '../../../constants'
import { Display } from '../../../components/ui'

export default function Historial() {
  const [visitas, setVisitas] = useState<any[]>([])
  const [resenadas, setResenadas] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [activa, setActiva] = useState<any>(null)
  const [rating, setRating] = useState(0)
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cargar = useCallback(async () => {
    const ss = await getSesion()
    if (!ss?.usuario_id || !ss?.negocio_id) { setLoading(false); return }
    const [h, r] = await Promise.all([
      getHistorialCliente(ss.usuario_id, ss.negocio_id).catch(() => []),
      getMisResenas(ss.usuario_id).catch(() => []),
    ])
    setVisitas(h as any[]); setResenadas(r as string[]); setLoading(false)
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

  return (
    <View style={s.container}>
      <Display size={26} style={{ marginBottom: 18 }}>Historial</Display>
      <FlatList
        data={visitas} keyExtractor={(it) => it.id} showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Text style={s.empty}>Aún no tienes visitas registradas.</Text>}
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
              <Text style={s.precio}>{item.precio_cobrado}</Text>
            </View>
          )
        }}
      />

      <Modal visible={!!activa} transparent animationType="slide" onRequestClose={() => setActiva(null)}>
        <View style={s.modalBg}>
          <View style={s.modal}>
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
          </View>
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 16, paddingTop: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  empty: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, textAlign: 'center', paddingVertical: 40 },
  card: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 16, marginBottom: 10 },
  servicio: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  fecha: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 3 },
  calificar: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.red, marginTop: 6 },
  calificado: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.success, marginTop: 6 },
  precio: { fontFamily: FONTS.display, fontSize: 22, color: COLORS.ink },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: COLORS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalSub: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, marginTop: 6, marginBottom: 16 },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },
  star: { fontSize: 42, color: '#D8D6D1' },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 14, fontSize: 15, fontFamily: FONTS.medium, minHeight: 70, textAlignVertical: 'top', marginBottom: 16 },
  btn: { backgroundColor: COLORS.red, borderRadius: 14, padding: 16, alignItems: 'center' },
  btnT: { fontFamily: FONTS.bold, fontSize: 16, color: '#fff' },
  cerrar: { fontFamily: FONTS.semibold, textAlign: 'center', color: COLORS.textLight, fontSize: 14, marginTop: 14 },
})
