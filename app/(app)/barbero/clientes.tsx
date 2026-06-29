import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, Modal, TextInput, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useEffect, useState, useCallback } from 'react'
import { getSesion } from '../../../lib/storage'
import { getClientesBarbero, getNotaPrivada, guardarNotaPrivada } from '../../../lib/db'
import { escribirCliente } from '../../../lib/whatsapp'
import { COLORS, FONTS } from '../../../constants'
import { Display, Avatar } from '../../../components/ui'

export default function Clientes() {
  const [perfilId, setPerfilId] = useState<string | null>(null)
  const [clientes, setClientes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activo, setActivo] = useState<any>(null)
  const [nota, setNota] = useState('')
  const [cargandoNota, setCargandoNota] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    const ss = await getSesion()
    if (!ss?.perfil_id) { setLoading(false); return }
    setPerfilId(ss.perfil_id)
    setClientes(await getClientesBarbero(ss.perfil_id).catch(() => []))
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function abrir(c: any) {
    setActivo(c); setNota(''); setCargandoNota(true)
    if (perfilId) setNota(await getNotaPrivada(perfilId, c.cliente_id).catch(() => '') || '')
    setCargandoNota(false)
  }
  async function guardar() {
    if (!perfilId || !activo) return
    setGuardando(true)
    try { await guardarNotaPrivada(perfilId, activo.cliente_id, nota.trim()); setActivo(null) }
    catch (e: any) { Alert.alert('No se pudo guardar', e.message ?? 'Intenta de nuevo.') }
    finally { setGuardando(false) }
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>

  return (
    <View style={s.container}>
      <Display size={30} style={{ marginBottom: 18 }}>Clientes</Display>
      <FlatList
        data={clientes} keyExtractor={(c) => c.cliente_id} showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Text style={s.empty}>Aún no has atendido clientes.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.row} onPress={() => abrir(item)}>
            <Avatar name={item.nombre} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{item.nombre}</Text>
              <Text style={s.meta}>{item.visitas} visita{item.visitas === 1 ? '' : 's'} · última {item.ultima}</Text>
            </View>
            <Text style={s.total}>{item.total}</Text>
          </TouchableOpacity>
        )}
      />

      <Modal visible={!!activo} transparent animationType="slide" onRequestClose={() => setActivo(null)}>
        <View style={s.modalBg}>
          <View style={s.modal}>
            <View style={s.modalHead}>
              <View style={{ flex: 1 }}>
                <Display size={22}>{activo?.nombre}</Display>
                <Text style={s.modalSub}>{activo?.telefono ?? ''} · {activo?.visitas} visitas</Text>
              </View>
              {activo?.telefono && activo.telefono !== '-' ? (
                <TouchableOpacity style={s.wa} onPress={() => escribirCliente(activo.telefono, activo.nombre)}><Ionicons name="logo-whatsapp" size={22} color={COLORS.success} /></TouchableOpacity>
              ) : null}
            </View>
            <Text style={s.notaLbl}>NOTA PRIVADA</Text>
            {cargandoNota ? <ActivityIndicator color={COLORS.red} style={{ marginVertical: 20 }} /> : (
              <TextInput style={s.input} placeholder="Preferencias, alergias, recordatorios…" placeholderTextColor={COLORS.textLight}
                value={nota} onChangeText={setNota} multiline />
            )}
            <TouchableOpacity style={s.btn} onPress={guardar} disabled={guardando}>
              {guardando ? <ActivityIndicator color="#fff" /> : <Text style={s.btnT}>Guardar nota</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setActivo(null)}><Text style={s.cerrar}>Cerrar</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 16, paddingTop: 72 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  empty: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, textAlign: 'center', paddingVertical: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, marginBottom: 8 },
  name: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  meta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  total: { fontFamily: FONTS.display, fontSize: 20, color: COLORS.ink },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: COLORS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalSub: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, marginTop: 6, marginBottom: 18 },
  modalHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  wa: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.successLight, alignItems: 'center', justifyContent: 'center' },
  notaLbl: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginBottom: 8 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 14, fontSize: 15, fontFamily: FONTS.medium, minHeight: 90, textAlignVertical: 'top', marginBottom: 16, color: COLORS.ink },
  btn: { backgroundColor: COLORS.red, borderRadius: 14, padding: 16, alignItems: 'center' },
  btnT: { fontFamily: FONTS.bold, fontSize: 16, color: '#fff' },
  cerrar: { fontFamily: FONTS.semibold, textAlign: 'center', color: COLORS.textLight, fontSize: 14, marginTop: 14 },
})
