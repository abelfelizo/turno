import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { useEffect, useState } from 'react'
import { useRouter, Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getSesion } from '../../../lib/storage'
import { getMiUsuario, getPreferenciasCliente, guardarPreferencias } from '../../../lib/db'
import { COLORS, FONTS } from '../../../constants'
import { Display } from '../../../components/ui'

export default function Preferencias() {
  const router = useRouter()
  const [sesion, setSesion] = useState<any>(null)
  const [usuario, setUsuario] = useState<any>(null)
  const [tipoCorte, setTipoCorte] = useState('')
  const [barba, setBarba] = useState('')
  const [alergias, setAlergias] = useState('')
  const [notas, setNotas] = useState('')
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    (async () => {
      const ss = await getSesion(); setSesion(ss)
      const u = await getMiUsuario().catch(() => null); setUsuario(u)
      if (u && ss?.negocio_id) {
        const p = await getPreferenciasCliente(u.id, ss.negocio_id).catch(() => null)
        if (p) { setTipoCorte(p.tipo_corte || ''); setBarba(p.barba || ''); setAlergias(p.alergias || ''); setNotas(p.notas || '') }
      }
      setLoading(false)
    })()
  }, [])

  async function guardar() {
    if (!usuario || !sesion?.negocio_id) return
    setGuardando(true)
    try {
      await guardarPreferencias({
        usuario_id: usuario.id, negocio_id: sesion.negocio_id,
        tipo_corte: tipoCorte.trim() || null, barba: barba.trim() || null,
        alergias: alergias.trim() || null, notas: notas.trim() || null,
      })
      router.back()
    } catch (e: any) { Alert.alert('No se pudo guardar', e.message ?? 'Intenta de nuevo.') }
    finally { setGuardando(false) }
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}><Ionicons name="chevron-back" size={22} color={COLORS.ink} /></TouchableOpacity>
        <Display size={24}>Preferencias</Display>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Field label="Tipo de corte" placeholder="Fade, clásico, a máquina…" value={tipoCorte} onChangeText={setTipoCorte} />
        <Field label="Barba" placeholder="Perfilado, recorte…" value={barba} onChangeText={setBarba} />
        <Field label="Alergias" placeholder="Productos que debes evitar" value={alergias} onChangeText={setAlergias} />
        <Field label="Notas" placeholder="Algo más que tu barbero deba saber" value={notas} onChangeText={setNotas} multiline />
        <TouchableOpacity style={s.btn} onPress={guardar} disabled={guardando}>
          {guardando ? <ActivityIndicator color="#fff" /> : <Text style={s.btnT}>Guardar</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function Field({ label, ...props }: any) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput style={[s.input, props.multiline && { minHeight: 80, textAlignVertical: 'top' }]} placeholderTextColor={COLORS.textLight} {...props} />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12 },
  back: { width: 36, height: 36, borderRadius: 11, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textMid, marginBottom: 7 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, padding: 15, fontSize: 15, fontFamily: FONTS.medium, color: COLORS.ink },
  btn: { backgroundColor: COLORS.red, borderRadius: 14, padding: 17, alignItems: 'center', marginTop: 8 },
  btnT: { fontFamily: FONTS.bold, fontSize: 16, color: '#fff' },
})
