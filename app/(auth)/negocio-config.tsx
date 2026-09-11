import { useState } from 'react'
import { useRouter } from 'expo-router'
import { Alert } from 'react-native'
import { OnbScreen, Campo, BotonPrimario } from '../../components/onb'
import { borrador, resetBorrador } from '../../lib/onboarding'
import { crearNegocio } from '../../lib/db'

export default function NegocioConfig() {
  const router = useRouter()
  // El barbero por su cuenta pasa por aquí con las dos preguntas de modalidad
  // ya resueltas (ver barbero-donde.tsx). Lo único que cambia son las palabras: por
  // dentro se crea el mismo negocio, porque no existe el barbero sin negocio.
  const solo = !!borrador.solo
  const [nombreNegocio, setNombreNegocio] = useState('')
  const [nombreDueno, setNombreDueno] = useState('')
  const [telefono, setTelefono] = useState('')
  const [moneda, setMoneda] = useState('RD$')
  const [cargando, setCargando] = useState(false)

  // Trabajando solo, el nombre del sitio ES su nombre mientras no diga otra
  // cosa. Obligarle a inventarse un rótulo para poder empezar es pedirle una
  // decisión de marca en la pantalla de alta.
  const rotulo = () => (nombreNegocio.trim() || (solo ? nombreDueno.trim() : ''))

  async function crear() {
    if (!rotulo() || !nombreDueno.trim() || !telefono.trim()) {
      Alert.alert('Faltan datos', 'Completa todos los campos.'); return
    }
    setCargando(true)
    try {
      const neg = await crearNegocio({
        nombre_negocio: rotulo(),
        tipo: borrador.tipoNegocio ?? 'empleados',
        moneda: moneda.trim() || 'RD$',
        atiende: !!borrador.atiende,
        tipo_servicio: borrador.tipoServicio ?? 'barbero',
        nombre_dueno: nombreDueno.trim(),
        telefono: telefono.trim(),
      })
      resetBorrador()
      // Ir a "/" y no al panel directo: index.tsx resuelve membresías, rol y
      // perfil y GUARDA la sesión. Saltárselo dejaba el panel sin negocio_id
      // y por tanto vacío, aunque los datos estuvieran bien creados.
      Alert.alert('¡Listo! 🎉',
        solo
          ? `Tu código es:\n\n${neg.codigo_acceso}\n\nPásaselo a tus clientes para que te pidan turno.`
          : `Tu código de acceso es:\n\n${neg.codigo_acceso}\n\nCompártelo con tus barberos y clientes.`,
        [{ text: 'Ir al panel', onPress: () => router.replace('/') }])
    } catch (e: any) {
      Alert.alert('No se pudo crear', e.message ?? 'Intenta de nuevo.')
    } finally { setCargando(false) }
  }

  return (
    <OnbScreen
      paso={solo ? 'Tu trabajo · 3 de 3' : 'Tu barbería · 3 de 3'}
      titulo={solo ? 'Tus datos' : 'Datos del local'}
      subtitulo={solo
        ? 'Generaremos tu código para que tus clientes te encuentren y te pidan turno.'
        : 'Generaremos un código de acceso para que se unan tu equipo y tus clientes.'}>
      <Campo label="Tu nombre" placeholder="Tu nombre" value={nombreDueno} onChangeText={setNombreDueno} />
      <Campo
        label={solo ? 'Cómo te ven tus clientes (opcional)' : 'Nombre del local'}
        placeholder={solo ? (nombreDueno.trim() || 'Tu nombre') : 'Barbería El Buen Corte'}
        value={nombreNegocio} onChangeText={setNombreNegocio} />
      <Campo label="Tu teléfono" placeholder="+1 809 000 0000" keyboardType="phone-pad" value={telefono} onChangeText={setTelefono} />
      <Campo label="Moneda" placeholder="RD$" value={moneda} onChangeText={setMoneda} autoCapitalize="characters" />
      <BotonPrimario texto={solo ? 'Empezar' : 'Crear barbería'} onPress={crear} cargando={cargando} />
    </OnbScreen>
  )
}
