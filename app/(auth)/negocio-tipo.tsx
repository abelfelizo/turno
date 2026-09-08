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
      subtitulo="Define quién decide los precios y los horarios. Se puede cambiar después en Config.">
      <Opcion label="Alquilo asientos"
        desc="Cada barbero trabaja con sus reglas: pone sus servicios, sus precios y su horario, y paga su suscripción."
        seleccionado={tipo === 'espacios_rentados'} onPress={() => setTipo('espacios_rentados')} />
      <Opcion label="Tengo empleados"
        desc="Trabajan para ti: tú pones los servicios, los precios y los horarios, y cubres su suscripción."
        seleccionado={tipo === 'empleados'} onPress={() => setTipo('empleados')} />
      <BotonPrimario texto="Continuar" onPress={continuar} disabled={!tipo} />
    </OnbScreen>
  )
}
