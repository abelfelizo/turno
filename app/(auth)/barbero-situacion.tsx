import { useState } from 'react'
import { useRouter } from 'expo-router'
import { OnbScreen, Opcion, BotonPrimario } from '../../components/onb'
import { borrador } from '../../lib/onboarding'

export default function BarberoSituacion() {
  const router = useRouter()
  const [rol, setRol] = useState<'empleado' | 'barbero_renta' | undefined>(borrador.rol)

  function continuar() {
    borrador.rol = rol
    if (rol === 'empleado') router.push('/(auth)/barbero-codigo')
    else router.push('/(auth)/barbero-independiente')
  }

  return (
    <OnbScreen paso="Tu trabajo · 2 de 4" titulo="¿Cómo trabajas?"
      subtitulo="Esto define quién paga la suscripción.">
      <Opcion label="Empleado del local"
        desc="Trabajas para un dueño y él paga por ti."
        seleccionado={rol === 'empleado'} onPress={() => setRol('empleado')} />
      <Opcion label="Independiente / rento espacio"
        desc="Trabajas por tu cuenta en un local y pagas tu suscripción."
        seleccionado={rol === 'barbero_renta'} onPress={() => setRol('barbero_renta')} />
      <BotonPrimario texto="Continuar" onPress={continuar} disabled={!rol} />
    </OnbScreen>
  )
}
