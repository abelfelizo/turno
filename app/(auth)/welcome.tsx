import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import { COLORS, FONTS, SOBRE, BOTON_CLARO } from '../../constants'
import { cerrarSesion } from '../../lib/auth'
import { Display } from '../../components/ui'
import { TurnoLogo } from '../../components/TurnoLogo'

export default function Welcome() {
  const router = useRouter()
  async function salir() { await cerrarSesion(); router.replace('/(auth)/login') }
  return (
    <View style={s.c}>
      <StatusBar style="light" />
      <View style={s.brand}>
        <TurnoLogo negative size={34} />
      </View>

      <Text style={s.kicker}>Bienvenido</Text>
      <Display size={56} color={SOBRE.tinta.t1} style={{ marginBottom: 10 }}>¿Cómo{'\n'}entras?</Display>
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
  c: { flex: 1, backgroundColor: SOBRE.tinta.fondo, padding: 28, justifyContent: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 40 },
  kicker: { fontFamily: FONTS.bold, color: SOBRE.tinta.azul, fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 },
  sub: { fontFamily: FONTS.regular, fontSize: 15, color: SOBRE.tinta.t2, marginBottom: 28 },
  // Regla 3 sobre tinta: principal blanco, secundario de contorno; 52, pastilla.
  btn: { width: '100%', height: 52, justifyContent: 'center', backgroundColor: BOTON_CLARO.fondo, borderRadius: 26, alignItems: 'center', marginBottom: 10 },
  btnT: { fontFamily: FONTS.semibold, fontSize: 16, color: BOTON_CLARO.texto },
  btn2: { width: '100%', height: 52, justifyContent: 'center', backgroundColor: 'transparent', borderRadius: 26, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)', marginBottom: 10 },
  btn2T: { fontFamily: FONTS.semibold, fontSize: 16, color: SOBRE.tinta.t1 },
  salir: { marginTop: 22, padding: 8, alignItems: 'center' },
  salirT: { fontFamily: FONTS.semibold, fontSize: 15, color: SOBRE.tinta.t2 },
})
