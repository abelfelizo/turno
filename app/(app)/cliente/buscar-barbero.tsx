import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native'
import { useState } from 'react'
import { useRouter, Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getSesion, guardarSesion } from '../../../lib/storage'
import { getBarberoPorCodigo, getBarberoNegocios, seguirBarberoEnNegocio } from '../../../lib/db'
import { COLORS, FONTS } from '../../../constants'
import { Display, Avatar } from '../../../components/ui'

export default function BuscarBarbero() {
  const router = useRouter()
  const [codigo, setCodigo] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [barbero, setBarbero] = useState<any>(null)
  const [negocios, setNegocios] = useState<any[]>([])
  const [yendo, setYendo] = useState(false)

  async function buscar() {
    if (codigo.trim().length < 4) return
    setBuscando(true); setBarbero(null); setNegocios([])
    try {
      const b = await getBarberoPorCodigo(codigo.trim())
      if (!b) { Alert.alert('No encontrado', 'No hay un barbero con ese código. Revísalo e intenta de nuevo.'); return }
      setBarbero(b)
      setNegocios(await getBarberoNegocios(b.id).catch(() => []))
    } catch (e: any) { Alert.alert('Error', e.message ?? 'Intenta de nuevo.') }
    finally { setBuscando(false) }
  }

  async function irAlLocal(n: any) {
    setYendo(true)
    try {
      await seguirBarberoEnNegocio(n.negocio_id)
      const ss = await getSesion()
      await guardarSesion({ ...(ss || {}), negocio_id: n.negocio_id, rol: 'cliente' } as any)
      router.replace('/(app)/cliente/home')
    } catch (e: any) { Alert.alert('No se pudo', e.message ?? 'Intenta de nuevo.'); setYendo(false) }
  }

  return (
    <View style={s.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}><Ionicons name="chevron-back" size={22} color={COLORS.ink} /></TouchableOpacity>
        <Display size={24}>Buscar barbero</Display>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
        <Text style={s.hint}>Escribe el código que te compartió tu barbero para seguirlo y reservar donde trabaje.</Text>
        <View style={s.buscarRow}>
          <TextInput style={s.input} placeholder="Código del barbero" placeholderTextColor={COLORS.textLight}
            autoCapitalize="characters" maxLength={9} value={codigo} onChangeText={t => setCodigo(t.toUpperCase())} />
          <TouchableOpacity style={s.buscarBtn} onPress={buscar} disabled={buscando || codigo.trim().length < 4}>
            {buscando ? <ActivityIndicator color="#fff" /> : <Ionicons name="search" size={20} color="#fff" />}
          </TouchableOpacity>
        </View>

        {barbero && (
          <>
            <View style={s.card}>
              <Avatar name={barbero.nombre} uri={barbero.foto_url} size={64} />
              <View style={{ flex: 1 }}>
                <Text style={s.nombre}>{barbero.nombre}</Text>
                {barbero.especialidad ? <Text style={s.esp}>{barbero.especialidad}</Text> : null}
                {barbero.bio ? <Text style={s.bio} numberOfLines={3}>{barbero.bio}</Text> : null}
              </View>
            </View>

            <Text style={s.sec}>DÓNDE TRABAJA</Text>
            {negocios.length === 0 && <Text style={s.empty}>Este barbero no está activo en ningún local ahora.</Text>}
            {negocios.map((n) => (
              <TouchableOpacity key={n.negocio_id} style={s.local} onPress={() => irAlLocal(n)} disabled={yendo}>
                <Ionicons name="storefront-outline" size={20} color={COLORS.red} />
                <Text style={s.localT}>{n.nombre}</Text>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12 },
  back: { width: 36, height: 36, borderRadius: 11, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  hint: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textMid, marginBottom: 16 },
  buscarRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  input: { flex: 1, backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, padding: 14, fontSize: 18, fontFamily: FONTS.bold, letterSpacing: 3, color: COLORS.ink },
  buscarBtn: { width: 54, borderRadius: 12, backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: 16, marginBottom: 20 },
  nombre: { fontFamily: FONTS.extrabold, fontSize: 18, color: COLORS.ink },
  esp: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.blue, marginTop: 2 },
  bio: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textLight, marginTop: 6 },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginBottom: 12 },
  empty: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, paddingVertical: 12 },
  local: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 16, marginBottom: 8 },
  localT: { flex: 1, fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
})
