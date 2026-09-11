import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useState } from 'react'
import { useRouter } from 'expo-router'
import { enviarCodigo, verificarCodigo } from '../../lib/auth'
import { COLORS, FONTS } from '../../constants'
import { Display, Pole } from '../../components/ui'

export default function Login() {
  const router = useRouter()
  const [paso, setPaso] = useState<'email' | 'codigo'>('email')
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [cargando, setCargando] = useState(false)

  async function pedirCodigo() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { Alert.alert('Email inválido', 'Escribe un correo válido.'); return }
    setCargando(true)
    try { await enviarCodigo(email); setPaso('codigo') }
    catch (e: any) { Alert.alert('No se pudo enviar el código', e.message ?? 'Intenta de nuevo.') }
    finally { setCargando(false) }
  }
  async function confirmar() {
    // El largo del OTP es configurable en Supabase (6–10). No lo cableamos:
    // basta con exigir el mínimo y dejar que el servidor valide el resto.
    if (codigo.trim().length < 6) { Alert.alert('Código incompleto', 'Escribe el código completo que te enviamos.'); return }
    setCargando(true)
    try { await verificarCodigo(email, codigo); router.replace('/') }
    catch (e: any) { Alert.alert('Código incorrecto', e.message ?? 'Revisa el código.') }
    finally { setCargando(false) }
  }

  // MISMO ARREGLO QUE EL ONBOARDING (ver components/onb.tsx).
  // Aquí era peor: sin ScrollView, el titular de 68pt no deja nada que encoger,
  // así que con el teclado abierto el campo se iba fuera de pantalla y no había
  // forma de alcanzarlo. Ahora el contenido puede subir, y
  // `automaticallyAdjustKeyboardInsets` lleva el foco a la vista.
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.carbon }}
      contentContainerStyle={s.c}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
      showsVerticalScrollIndicator={false}
    >
      <StatusBar style="light" />
      <Pole height={8} radius={0} style={s.poleTop} />
      <View style={s.brand}>
        <View style={s.logo}><Text style={s.logoT}>N</Text></View>
        <Text style={s.wordmark}>NAVAJA · BARBER CO.</Text>
      </View>

      <Text style={s.kicker}>App de reservas · Barbería</Text>
      {/* Sin override de lineHeight: Display ya usa size×1.18, que Anton necesita
          para no recortar los ascendentes (un 64 sobre fuente 68 cortaba "RESERVA"). */}
      <Display size={68} color="#fff">Reserva{'\n'}tu <Text style={{ color: COLORS.red }}>corte</Text></Display>

      {paso === 'email' ? (
        <>
          <Text style={s.sub}>Entra o crea tu cuenta con tu correo. Te enviaremos un código.</Text>
          <TextInput style={s.input} placeholder="tucorreo@ejemplo.com" placeholderTextColor={COLORS.textLight}
            autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} editable={!cargando} />
          <TouchableOpacity style={s.btn} onPress={pedirCodigo} disabled={cargando}>
            {cargando ? <ActivityIndicator color="#fff" /> : <Text style={s.btnT}>Enviar código</Text>}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={s.sub}>Ingresa el código que enviamos a {email}</Text>
          <TextInput style={[s.input, s.code]} placeholder="––––––" placeholderTextColor={COLORS.textLight}
            keyboardType="number-pad" maxLength={10} value={codigo}
            onChangeText={t => setCodigo(t.replace(/\D/g, ''))} editable={!cargando} />
          <TouchableOpacity style={s.btn} onPress={confirmar} disabled={cargando}>
            {cargando ? <ActivityIndicator color="#fff" /> : <Text style={s.btnT}>Confirmar</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setPaso('email')} disabled={cargando}><Text style={s.link}>Cambiar correo</Text></TouchableOpacity>
        </>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  c: { flexGrow: 1, padding: 28, paddingBottom: 56, justifyContent: 'center' },
  poleTop: { position: 'absolute', top: 0, left: 0, right: 0 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 40 },
  logo: { width: 34, height: 34, borderRadius: 7, backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center' },
  logoT: { fontFamily: FONTS.extrabold, color: '#fff', fontSize: 18 },
  wordmark: { fontFamily: FONTS.bold, color: '#fff', fontSize: 13, letterSpacing: 1 },
  kicker: { fontFamily: FONTS.bold, color: COLORS.blue, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 },
  sub: { fontFamily: FONTS.regular, fontSize: 15, color: '#C7C8CF', marginTop: 24, marginBottom: 20, lineHeight: 22 },
  input: { backgroundColor: COLORS.carbonEl, borderWidth: 1, borderColor: COLORS.carbonBorder, borderRadius: 12, padding: 16, color: '#fff', fontSize: 16, fontFamily: FONTS.medium, marginBottom: 12 },
  code: { textAlign: 'center', letterSpacing: 4, fontSize: 24, fontFamily: FONTS.bold },
  btn: { backgroundColor: COLORS.red, borderRadius: 14, padding: 17, alignItems: 'center' },
  btnT: { fontFamily: FONTS.bold, fontSize: 16, color: '#fff' },
  link: { fontFamily: FONTS.semibold, color: '#9A9CA6', fontSize: 14, marginTop: 16, textAlign: 'center' },
})
