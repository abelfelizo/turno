import { useState } from 'react'
import { useRouter } from 'expo-router'
import { OnbScreen, Opcion, BotonPrimario } from '../../components/onb'
import { borrador, resetBorrador } from '../../lib/onboarding'
import type { TipoServicio } from '../../types'

export default function BarberoTipo() {
  const router = useRouter()
  const [tipo, setTipo] = useState<TipoServicio | undefined>(borrador.tipoServicio)

  function continuar() {
    resetBorrador()
    borrador.tipoServicio = tipo
    router.push('/(auth)/barbero-donde')
  }

  return (
    <OnbScreen paso="Tu trabajo · 1 de 4" titulo="¿A qué te dedicas?"
      subtitulo="Elige el tipo de servicio que ofreces.">
      <Opcion label="Barbería" desc="Cortes, barba, arreglos."
        seleccionado={tipo === 'barbero'} onPress={() => setTipo('barbero')} />
      <Opcion label="Manicure / Pedicure"
        seleccionado={tipo === 'manicuri_pedicuri'} onPress={() => setTipo('manicuri_pedicuri')} />
      <BotonPrimario texto="Continuar" onPress={continuar} disabled={!tipo} />
    </OnbScreen>
  )
}
