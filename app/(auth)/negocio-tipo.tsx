import { useState } from 'react'
import { useRouter } from 'expo-router'
import { OnbScreen, Opcion, BotonPrimario } from '../../components/onb'
import { borrador, resetBorrador } from '../../lib/onboarding'
import type { TipoNegocio } from '../../types'

export default function NegocioTipo() {
  const router = useRouter()
  const [tipo, setTipo] = useState<TipoNegocio | undefined>(borrador.tipoNegocio)

  function continuar() {
    resetBorrador()
    borrador.tipoNegocio = tipo
    router.push('/(auth)/negocio-atiende')
  }

  return (
    <OnbScreen paso="Tu barbería · 1 de 3" titulo="¿Cómo trabaja tu local?"
      subtitulo="Esto define cómo se organizan los barberos y los cobros.">
      <Opcion label="Espacios rentados"
        desc="Cada barbero es independiente y paga su suscripción."
        seleccionado={tipo === 'espacios_rentados'} onPress={() => setTipo('espacios_rentados')} />
      <Opcion label="Empleados"
        desc="Los barberos trabajan para ti y tú pagas por ellos."
        seleccionado={tipo === 'empleados'} onPress={() => setTipo('empleados')} />
      <BotonPrimario texto="Continuar" onPress={continuar} disabled={!tipo} />
    </OnbScreen>
  )
}
