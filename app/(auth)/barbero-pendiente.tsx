import { useState, useEffect } from 'react'
import { useRouter } from 'expo-router'
import { OnbScreen, BotonPrimario } from '../../components/onb'
import { TouchableOpacity, Text, StyleSheet } from 'react-native'
import { cerrarSesion } from '../../lib/auth'
import { getSesion } from '../../lib/storage'
import { getMiPerfil } from '../../lib/db'
import { suscribirPerfil, desuscribir } from '../../lib/realtime'
import { COLORS } from '../../constants'

export default function BarberoPendiente() {
  const router = useRouter()
  const [verificando, setVerificando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

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

  /**
   * Antes esto era `router.replace('/')` a secas. Si el dueño todavía no te
   * había aprobado, el arranque te devolvía a esta misma pantalla, el botón se
   * quedaba girando —`verificando` no se reseteaba nunca— y desde fuera parecía
   * un botón muerto: le das y no pasa nada. No sabías si estabas esperando o si
   * la app estaba rota.
   *
   * Ahora se comprueba de verdad y se dice el resultado, que es lo único que
   * hacía falta.
   */
  async function verificar() {
    setVerificando(true); setAviso(null)
    try {
      const ss = await getSesion()
      if (!ss?.usuario_id || !ss?.negocio_id) { router.replace('/'); return }
      const perfil = await getMiPerfil(ss.usuario_id, ss.negocio_id).catch(() => null)
      if (perfil?.aprobado) { router.replace('/'); return }
      setAviso('Todavía no. El dueño aún no ha aprobado tu solicitud. En cuanto lo haga entras solo, sin tener que tocar nada.')
    } catch {
      setAviso('No se pudo comprobar ahora mismo. Revisa tu conexión e inténtalo otra vez.')
    } finally {
      setVerificando(false)
    }
  }

  return (
    <OnbScreen titulo="Solicitud enviada ⏳"
      subtitulo="El dueño del local debe aprobarte. En cuanto lo haga, esta pantalla avanza sola y te llega una notificación. También puedes verificar a mano.">
      <BotonPrimario texto="Verificar estado" cargando={verificando} onPress={verificar} />
      {aviso && <Text style={s.aviso}>{aviso}</Text>}
      <TouchableOpacity style={s.link} onPress={salir}>
        <Text style={s.linkT}>Cerrar sesión</Text>
      </TouchableOpacity>
    </OnbScreen>
  )
}

const s = StyleSheet.create({
  aviso: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 14 },
  link: { alignItems: 'center', padding: 16, marginTop: 4 },
  linkT: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' },
})
