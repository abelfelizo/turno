import { useState } from 'react'
import { useRouter } from 'expo-router'
import { OnbScreen, BotonPrimario } from '../../components/onb'
import { TouchableOpacity, Text, StyleSheet } from 'react-native'
import { cerrarSesion } from '../../lib/auth'
import { COLORS } from '../../constants'

export default function BarberoPendiente() {
  const router = useRouter()
  const [verificando, setVerificando] = useState(false)

  async function salir() {
    await cerrarSesion()
    router.replace('/(auth)/login')
  }

  return (
    <OnbScreen titulo="Solicitud enviada ⏳"
      subtitulo="El dueño del local debe aprobarte. Te avisaremos cuando puedas empezar a atender. Vuelve a verificar más tarde.">
      <BotonPrimario texto="Verificar estado" cargando={verificando}
        onPress={() => { setVerificando(true); router.replace('/') }} />
      <TouchableOpacity style={s.link} onPress={salir}>
        <Text style={s.linkT}>Cerrar sesión</Text>
      </TouchableOpacity>
    </OnbScreen>
  )
}

const s = StyleSheet.create({
  link: { alignItems: 'center', padding: 16, marginTop: 4 },
  linkT: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' },
})
