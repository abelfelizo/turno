import { useState } from 'react'
import { useRouter } from 'expo-router'
import { Alert } from 'react-native'
import { OnbScreen, Campo, BotonPrimario } from '../../components/onb'
import { borrador } from '../../lib/onboarding'
import { unirseProfesional, getDuenosNegocio, getNegocioById } from '../../lib/db'
import { avisos } from '../../lib/notificaciones'

export default function BarberoPerfil() {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [cargando, setCargando] = useState(false)

  /** Nunca bloquea el alta: si el aviso falla, el barbero ya está dentro. */
  async function avisarAlDueno(negocioId?: string) {
    if (!negocioId) return
    try {
      const neg = await getNegocioById(negocioId).catch(() => null)
      for (const dueno of await getDuenosNegocio(negocioId)) {
        avisos.duenoSolicitud(dueno, nombre.trim(), (neg as any)?.nombre ?? 'tu local')
      }
    } catch { /* silencioso a propósito */ }
  }

  async function enviar() {
    if (!nombre.trim() || !telefono.trim()) { Alert.alert('Faltan datos', 'Completa nombre y teléfono.'); return }
    setCargando(true)
    try {
      const perfil = await unirseProfesional({
        codigo: borrador.codigo ?? '',
        tipo_servicio: borrador.tipoServicio ?? 'barbero',
        rol: borrador.rol ?? 'empleado',
        nombre: nombre.trim(),
        telefono: telefono.trim(),
      })
      // DESDE LA MIGRACIÓN 94 NO SIEMPRE HAY QUE ESPERAR A NADIE.
      //
      // En un local de asientos alquilados el barbero entra ACTIVO: se agrega
      // él, y quien no lo dirige tampoco lo autoriza. Mandarlo igualmente a la
      // pantalla de "el dueño debe aprobarte" lo dejaba plantado esperando un
      // permiso que ya no existe — y el dueño, recibiendo un aviso de una
      // solicitud que no tiene que resolver.
      if ((perfil as any)?.aprobado) {
        router.replace('/')
      } else {
        // El dueño tenía que descubrir las solicitudes entrando al panel. Un
        // barbero esperando aprobación es alguien que no puede trabajar.
        avisarAlDueno((perfil as any)?.negocio_id)
        router.replace('/(auth)/barbero-pendiente')
      }
    } catch (e: any) {
      Alert.alert('No se pudo enviar', e.message ?? 'Verifica el código e intenta de nuevo.')
    } finally { setCargando(false) }
  }

  return (
    <OnbScreen paso="Tu trabajo · 4 de 4" titulo="Tu perfil"
      subtitulo="Así te verán el dueño y los clientes.">
      <Campo label="Tu nombre" placeholder="Tu nombre" value={nombre} onChangeText={setNombre} />
      <Campo label="Tu teléfono" placeholder="+1 809 000 0000" keyboardType="phone-pad" value={telefono} onChangeText={setTelefono} />
      <BotonPrimario texto="Enviar solicitud" onPress={enviar} cargando={cargando} />
    </OnbScreen>
  )
}
