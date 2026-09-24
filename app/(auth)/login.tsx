import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useState } from 'react'
import { useRouter } from 'expo-router'
import { enviarCodigo, verificarCodigo } from '../../lib/auth'
import { ENCENDIDA as PUERTA_PRUEBAS } from '../../lib/pruebas'
import { COLORS, FONTS, SOBRE, BOTON_CLARO } from '../../constants'
import { Display, VersionBundle } from '../../components/ui'
import { TurnoLogo } from '../../components/TurnoLogo'

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
      style={{ flex: 1, backgroundColor: SOBRE.tinta.fondo }}
      contentContainerStyle={s.c}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
      showsVerticalScrollIndicator={false}
    >
      <StatusBar style="light" />
      <View style={s.brand}>
        <TurnoLogo negative size={34} />
      </View>

      <Text style={s.kicker}>App de reservas · Barbería</Text>
      {/* Sin override de lineHeight: Display ya usa size×1.18, que la letra de titular necesita
          para no recortar los ascendentes (un 64 sobre fuente 68 cortaba "RESERVA"). */}
      <Display size={68} color={SOBRE.tinta.t1}>Reserva{'\n'}tu <Text style={{ color: SOBRE.tinta.rojo }}>corte</Text></Display>

      {paso === 'email' ? (
        <>
          <Text style={s.sub}>Entra o crea tu cuenta con tu correo. Te enviaremos un código.</Text>
          <TextInput style={s.input} placeholder="tucorreo@ejemplo.com" placeholderTextColor={SOBRE.tinta.t3} keyboardAppearance="dark" selectionColor={SOBRE.tinta.t1}
            autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} editable={!cargando} />
          <TouchableOpacity style={s.btn} onPress={pedirCodigo} disabled={cargando}>
            {cargando ? <ActivityIndicator color={BOTON_CLARO.texto} /> : <Text style={s.btnT}>Enviar código</Text>}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={s.sub}>Ingresa el código que enviamos a {email}</Text>
          <TextInput style={[s.input, s.code]} placeholder="––––––" placeholderTextColor={SOBRE.tinta.t3} keyboardAppearance="dark" selectionColor={SOBRE.tinta.t1}
            keyboardType="number-pad" maxLength={10} value={codigo}
            onChangeText={t => setCodigo(t.replace(/\D/g, ''))} editable={!cargando} />
          <TouchableOpacity style={s.btn} onPress={confirmar} disabled={cargando}>
            {cargando ? <ActivityIndicator color={BOTON_CLARO.texto} /> : <Text style={s.btnT}>Confirmar</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setPaso('email')} disabled={cargando}><Text style={s.link}>Cambiar correo</Text></TouchableOpacity>
        </>
      )}

      {/* PUERTA DE PRUEBAS · temporal, y solo en los builds de desarrollo y
          preview. En production la variable no existe, así que esto no se
          compila dentro y la ruta tampoco lleva a ninguna parte (la pantalla
          vuelve a comprobarlo por su cuenta). Ver lib/pruebas.ts. */}
      {PUERTA_PRUEBAS && (
        <TouchableOpacity style={s.pruebas} onPress={() => router.push('/(auth)/puerta-pruebas')}>
          <Text style={s.pruebasT}>Entrar como un perfil de prueba</Text>
        </TouchableOpacity>
      )}

      {/* Qué bundle corre este teléfono. En la primera pantalla de la app a
          propósito: la pregunta «¿llegó la actualización?» hay que poder
          contestarla sin iniciar sesión y sin conexión a la base. */}
      <VersionBundle tinta />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  c: { flexGrow: 1, padding: 28, paddingBottom: 56, justifyContent: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 40 },
  kicker: { fontFamily: FONTS.bold, color: SOBRE.tinta.azul, fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 },
  sub: { fontFamily: FONTS.regular, fontSize: 15, color: SOBRE.tinta.t2, marginTop: 24, marginBottom: 20, lineHeight: 22 },
  input: { backgroundColor: SOBRE.tinta.elevado, borderWidth: 1, borderColor: SOBRE.tinta.borde, borderRadius: 26, height: 52, paddingHorizontal: 18, color: SOBRE.tinta.t1, fontSize: 16, fontFamily: FONTS.regular, marginBottom: 12 },
  code: { textAlign: 'center', letterSpacing: 1.2, fontSize: 24, fontFamily: FONTS.bold },
  pruebas: { marginTop: 26, padding: 12, alignItems: 'center' },
  pruebasT: { fontFamily: FONTS.semibold, fontSize: 13, color: SOBRE.tinta.t3, textDecorationLine: 'underline' },
  btn: { backgroundColor: BOTON_CLARO.fondo, borderRadius: 26, height: 52, justifyContent: 'center', alignItems: 'center' },
  btnT: { fontFamily: FONTS.semibold, fontSize: 16, color: BOTON_CLARO.texto },
  link: { fontFamily: FONTS.semibold, color: SOBRE.tinta.t2, fontSize: 15, marginTop: 16, textAlign: 'center' },
})
