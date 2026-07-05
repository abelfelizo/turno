import { useState, useEffect } from 'react'
import { useRouter } from 'expo-router'
import { OnbScreen, BotonPrimario } from '../../components/onb'
import { TouchableOpacity, Text, StyleSheet } from 'react-native'
import { cerrarSesion } from '../../lib/auth'
import { getSesion } from '../../lib/storage'
import { suscribirPerfil, desuscribir } from '../../lib/realtime'
import { COLORS } from '../../constants'

export default function BarberoPendiente() {
  const router = useRouter()
  const [verificando, setVerificando] = useState(false)

  // Aprobación en vivo: cuando el dueño te aprueba, avanzas solo (sin recargar a mano).
  useEffect(() => {
    let sub: any
    getSesion().then(ss => {
      if (!ss?.perfil_id) return
      sub = suscribirPerfil(ss.perfil_id, (payload: any) => {
        if (payload?.new?.aprobado) router.replace('/')
      })
    })
    return () => { if (sub) desuscribir(sub) }
  }, [router])

  async function salir() {
    await cerrarSesion()
    router.replace('/(auth)/login')
  }

  return (
    <OnbScreen titulo="Solicitud enviada ⏳"
      subtitulo="El dueño del local debe aprobarte. En cuanto lo haga, esta pantalla avanza sola y te llega una notificación. También puedes verificar a mano.">
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
