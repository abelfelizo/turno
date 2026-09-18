import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useState } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { entrarConClave, cerrarSesion } from '../../lib/auth'
import { limpiarSesion } from '../../lib/storage'
import { ENCENDIDA, CLAVE, REPARTO } from '../../lib/pruebas'
import { COLORS, FONTS } from '../../constants'
import { Display, VersionBundle } from '../../components/ui'

/**
 * PUERTA DE PRUEBAS · el reparto completo, a un toque.
 *
 * TEMPORAL. Se quita cuando el onboarding esté como debe ser.
 *
 * Las cuentas son de verdad y la entrada es una sesión normal: el servidor
 * aplica las mismas reglas que a cualquiera. Ver `lib/pruebas.ts`.
 *
 * Si la puerta está apagada la pantalla no enseña el reparto. No basta con
 * esconder el botón que lleva aquí: la ruta existe en el bundle y se puede
 * alcanzar escribiéndola, así que la comprobación va también dentro.
 */
export default function PuertaPruebas() {
  const router = useRouter()
  const [entrando, setEntrando] = useState<string | null>(null)

  async function entrar(email: string) {
    setEntrando(email)
    try {
      // Fuera la sesión anterior ANTES de abrir la nueva: si no, index.tsx lee
      // el negocio guardado del personaje de antes y te deja en su local.
      await cerrarSesion().catch(() => {})
      await limpiarSesion()
      await entrarConClave(email, CLAVE)
      router.replace('/')
    } catch (e: any) {
      Alert.alert('No se pudo entrar', e.message ?? 'Revisa que la semilla esté puesta en la base.')
    } finally { setEntrando(null) }
  }

  if (!ENCENDIDA) {
    return (
      <View style={[s.c, { justifyContent: 'center' }]}>
        <StatusBar style="light" />
        <Text style={s.apagada}>Esta puerta no está disponible.</Text>
        <TouchableOpacity style={s.volver} onPress={() => router.replace('/(auth)/login')}>
          <Text style={s.volverT}>Volver</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.carbon }} contentContainerStyle={s.c}>
      <StatusBar style="light" />
      <Display size={34} style={{ color: '#fff', marginBottom: 6 }}>Puerta de pruebas</Display>
      <Text style={s.sub}>
        Cuentas de mentira, sesión de verdad. Entras como cualquiera de ellos y el servidor
        te trata igual que a un usuario real.
      </Text>

      {REPARTO.map(bloque => (
        <View key={bloque.grupo} style={{ marginTop: 22 }}>
          <Text style={s.grupo}>{bloque.grupo.toUpperCase()}</Text>
          {bloque.gente.map(p => (
            <TouchableOpacity key={p.email} style={s.ficha} activeOpacity={0.8}
              onPress={() => entrar(p.email)} disabled={entrando !== null}>
              <View style={{ flex: 1 }}>
                <Text style={s.nombre}>{p.nombre}</Text>
                <Text style={s.papel}>{p.papel}</Text>
                <Text style={s.para}>{p.para}</Text>
              </View>
              {entrando === p.email
                ? <ActivityIndicator color={COLORS.red} />
                : <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />}
            </TouchableOpacity>
          ))}
        </View>
      ))}

      <TouchableOpacity style={s.volver} onPress={() => router.replace('/(auth)/login')}>
        <Text style={s.volverT}>Entrar con mi correo</Text>
      </TouchableOpacity>

      {/* Qué bundle corre este teléfono. Aquí y no solo en ajustes porque es la
          pantalla a la que se llega sin iniciar sesión: cuando la duda es «¿me
          llegó la actualización?», la respuesta tiene que estar antes de la
          puerta, no detrás. */}
      <VersionBundle />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  c: { padding: 24, paddingTop: 72, paddingBottom: 48, backgroundColor: COLORS.carbon, flexGrow: 1 },
  sub: { fontFamily: FONTS.regular, fontSize: 14, color: '#C7C8CF', lineHeight: 20 },
  grupo: { fontFamily: FONTS.bold, fontSize: 10, color: COLORS.blue, letterSpacing: 1.4, marginBottom: 10 },
  ficha: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.carbonEl, borderWidth: 1, borderColor: COLORS.carbonBorder,
    borderRadius: 14, padding: 14, marginBottom: 8,
  },
  nombre: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
  papel: { fontFamily: FONTS.semibold, fontSize: 12, color: COLORS.red, marginTop: 2 },
  para: { fontFamily: FONTS.regular, fontSize: 12, color: '#9A9CA6', marginTop: 4, lineHeight: 17 },
  apagada: { fontFamily: FONTS.semibold, fontSize: 15, color: '#C7C8CF', textAlign: 'center' },
  volver: { marginTop: 28, padding: 12, alignItems: 'center' },
  volverT: { fontFamily: FONTS.semibold, fontSize: 13, color: '#9A9CA6' },
})
