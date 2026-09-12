import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import { COLORS, FONTS } from '../../constants'
import { cerrarSesion } from '../../lib/auth'
import { Display, Pole } from '../../components/ui'

export default function Welcome() {
  const router = useRouter()
  async function salir() { await cerrarSesion(); router.replace('/(auth)/login') }
  return (
    <View style={s.c}>
      <StatusBar style="light" />
      <Pole height={8} radius={0} style={s.poleTop} />
      <View style={s.brand}>
        <View style={s.logo}><Text style={s.logoT}>N</Text></View>
        <Text style={s.wordmark}>NAVAJA · BARBER CO.</Text>
      </View>

      <Text style={s.kicker}>Bienvenido</Text>
      <Display size={56} color="#fff" style={{ marginBottom: 10 }}>¿Cómo{'\n'}entras?</Display>
      <Text style={s.sub}>Elige tu rol para continuar.</Text>

      <TouchableOpacity style={s.btn} onPress={() => router.push('/(auth)/negocio-tipo')}>
        <Text style={s.btnT}>Tengo una barbería</Text>
      </TouchableOpacity>
      {/* TRES PUERTAS, NI UNA MÁS: cliente, barbero y dueño. El barbero que
          alquila un sillón en un local que NO usa Turno no es un cuarto tipo de
          usuario — es un barbero, y dónde trabaja se le pregunta dentro de su
          propio camino. Ver app/(auth)/barbero-donde.tsx. */}
      <TouchableOpacity style={s.btn2} onPress={() => router.push('/(auth)/barbero-tipo')}>
        <Text style={s.btn2T}>Soy barbero</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.btn2} onPress={() => router.push('/(auth)/cliente-codigo')}>
        <Text style={s.btn2T}>Soy cliente</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.salir} onPress={salir}>
        <Text style={s.salirT}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.carbon, padding: 28, justifyContent: 'center' },
  poleTop: { position: 'absolute', top: 0, left: 0, right: 0 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 40 },
  logo: { width: 34, height: 34, borderRadius: 7, backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center' },
  logoT: { fontFamily: FONTS.extrabold, color: '#fff', fontSize: 18 },
  wordmark: { fontFamily: FONTS.bold, color: '#fff', fontSize: 13, letterSpacing: 1 },
  kicker: { fontFamily: FONTS.bold, color: COLORS.blue, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 },
  sub: { fontFamily: FONTS.regular, fontSize: 15, color: '#C7C8CF', marginBottom: 28 },
  btn: { width: '100%', padding: 17, backgroundColor: COLORS.red, borderRadius: 14, alignItems: 'center', marginBottom: 10 },
  btnT: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
  btn2: { width: '100%', padding: 16, backgroundColor: COLORS.carbonEl, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.carbonBorder, marginBottom: 10 },
  btn2T: { fontFamily: FONTS.semibold, fontSize: 15, color: '#fff' },
  salir: { marginTop: 22, padding: 8, alignItems: 'center' },
  salirT: { fontFamily: FONTS.semibold, fontSize: 13, color: '#9A9CA6' },
})
