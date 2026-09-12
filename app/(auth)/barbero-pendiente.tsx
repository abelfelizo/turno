import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { OnbScreen, BotonPrimario } from '../../components/onb'
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { cerrarSesion } from '../../lib/auth'
import { getSesion } from '../../lib/storage'
import { getMiPerfil, getMisInvitaciones, responderInvitacion } from '../../lib/db'
import { suscribirPerfil, desuscribir } from '../../lib/realtime'
import { COLORS } from '../../constants'

/**
 * LA SALA DE ESPERA, QUE AHORA TIENE DOS PUERTAS (migración 110).
 *
 * Hasta la 110 solo podía haber una cosa pendiente: una solicitud TUYA, y esta
 * pantalla decía «el dueño debe aprobarte» sin preguntar nada, porque no había
 * otra posibilidad. Desde que el local también puede INVITAR, el mismo perfil
 * sin aprobar puede significar justo lo contrario: **que el que tiene que
 * firmar eres tú**.
 *
 * Sin esto, al barbero invitado la app le enseñaba una pantalla que le mentía
 * («esperando al dueño») y en la que no había ningún botón para aceptar: se
 * quedaba encerrado esperando algo que nunca iba a pasar, porque el que no
 * había contestado era él.
 */
export default function BarberoPendiente() {
  const router = useRouter()
  const [verificando, setVerificando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [respondiendo, setRespondiendo] = useState(false)
  // La invitación que falta por contestar, si la hay. Null = espero yo.
  const [invitacion, setInvitacion] = useState<{ perfil_id: string; negocio: string; rol: string } | null>(null)

  const mirar = useCallback(async () => {
    try {
      const ss = await getSesion()
      const invs = await getMisInvitaciones().catch(() => [])
      // La del local en el que estás ahora manda; si no, la primera que haya.
      const mia = invs.find(i => i.negocio_id === ss?.negocio_id) ?? invs[0]
      setInvitacion(mia ? { perfil_id: mia.perfil_id, negocio: mia.negocio, rol: mia.rol } : null)
    } finally {
      setCargando(false)
    }
  }, [])
  useEffect(() => { mirar() }, [mirar])

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

  async function responder(acepta: boolean) {
    if (!invitacion) return
    setRespondiendo(true)
    try {
      await responderInvitacion(invitacion.perfil_id, acepta)
      router.replace('/')
    } catch (e: any) {
      Alert.alert('No se pudo', e.message ?? 'Intenta de nuevo.')
      setRespondiendo(false)
    }
  }

  function rechazar() {
    Alert.alert('Rechazar la invitación',
      `No entrarás a ${invitacion?.negocio}. Si cambias de idea tendrán que volver a invitarte, o puedes entrar tú con el código del local.`,
      [{ text: 'Cancelar', style: 'cancel' },
       { text: 'Rechazar', style: 'destructive', onPress: () => responder(false) }])
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
      // Puede haber llegado una invitación mientras esperabas.
      await mirar()
      setAviso('Todavía no. El dueño aún no ha aprobado tu solicitud. En cuanto lo haga entras solo, sin tener que tocar nada.')
    } catch {
      setAviso('No se pudo comprobar ahora mismo. Revisa tu conexión e inténtalo otra vez.')
    } finally {
      setVerificando(false)
    }
  }

  if (cargando) {
    return (
      <OnbScreen titulo="Un momento" subtitulo="Mirando si hay algo pendiente.">
        <ActivityIndicator color="#fff" />
      </OnbScreen>
    )
  }

  // ── TE INVITARON: el que falta por firmar eres tú ──────────────────────────
  if (invitacion) {
    return (
      <OnbScreen titulo={`${invitacion.negocio} te invitó 👋`}
        subtitulo={invitacion.rol === 'barbero_renta'
          ? 'Entrarías como barbero que renta su asiento: tus servicios, tus precios y tu horario los sigues decidiendo tú. El local solo agrupa.'
          : 'Entrarías como parte del equipo: el local pone los servicios, los precios y la jornada, y te reparte el trabajo.'}>
        <BotonPrimario texto="Aceptar y entrar" cargando={respondiendo} onPress={() => responder(true)} />
        <TouchableOpacity style={s.link} onPress={rechazar} disabled={respondiendo}>
          <Text style={s.linkT}>Ahora no</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.link} onPress={salir}>
          <Text style={s.linkT}>Cerrar sesión</Text>
        </TouchableOpacity>
      </OnbScreen>
    )
  }

  // ── PEDISTE ENTRAR TÚ: falta el sí del local ───────────────────────────────
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
