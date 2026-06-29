import { useState } from 'react'
import { useRouter } from 'expo-router'
import { Alert } from 'react-native'
import { OnbScreen, Campo, BotonPrimario } from '../../components/onb'
import { borrador, resetBorrador } from '../../lib/onboarding'
import { crearNegocio } from '../../lib/db'

export default function NegocioConfig() {
  const router = useRouter()
  const [nombreNegocio, setNombreNegocio] = useState('')
  const [nombreDueno, setNombreDueno] = useState('')
  const [telefono, setTelefono] = useState('')
  const [moneda, setMoneda] = useState('RD$')
  const [cargando, setCargando] = useState(false)

  async function crear() {
    if (!nombreNegocio.trim() || !nombreDueno.trim() || !telefono.trim()) {
      Alert.alert('Faltan datos', 'Completa todos los campos.'); return
    }
    setCargando(true)
    try {
      const neg = await crearNegocio({
        nombre_negocio: nombreNegocio.trim(),
        tipo: borrador.tipoNegocio ?? 'empleados',
        moneda: moneda.trim() || 'RD$',
        atiende: !!borrador.atiende,
        tipo_servicio: borrador.tipoServicio ?? 'barbero',
        nombre_dueno: nombreDueno.trim(),
        telefono: telefono.trim(),
      })
      resetBorrador()
      Alert.alert('¡Listo! 🎉', `Tu código de acceso es:\n\n${neg.codigo_acceso}\n\nCompártelo con tus barberos y clientes.`,
        [{ text: 'Ir al panel', onPress: () => router.replace('/(app)/dueno/dashboard') }])
    } catch (e: any) {
      Alert.alert('No se pudo crear', e.message ?? 'Intenta de nuevo.')
    } finally { setCargando(false) }
  }

  return (
    <OnbScreen paso="Tu barbería · 3 de 3" titulo="Datos del local"
      subtitulo="Generaremos un código de acceso para que se unan tu equipo y tus clientes.">
      <Campo label="Nombre del local" placeholder="Barbería El Buen Corte" value={nombreNegocio} onChangeText={setNombreNegocio} />
      <Campo label="Tu nombre" placeholder="Tu nombre" value={nombreDueno} onChangeText={setNombreDueno} />
      <Campo label="Tu teléfono" placeholder="+1 809 000 0000" keyboardType="phone-pad" value={telefono} onChangeText={setTelefono} />
      <Campo label="Moneda" placeholder="RD$" value={moneda} onChangeText={setMoneda} autoCapitalize="characters" />
      <BotonPrimario texto="Crear barbería" onPress={crear} cargando={cargando} />
    </OnbScreen>
  )
}
