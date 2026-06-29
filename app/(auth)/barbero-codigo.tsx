import { useState } from 'react'
import { useRouter } from 'expo-router'
import { OnbScreen, Campo, BotonPrimario } from '../../components/onb'
import { borrador } from '../../lib/onboarding'

export default function BarberoCodigo() {
  const router = useRouter()
  const [codigo, setCodigo] = useState(borrador.codigo ?? '')

  function continuar() {
    borrador.codigo = codigo.trim().toUpperCase()
    router.push('/(auth)/barbero-perfil')
  }

  return (
    <OnbScreen paso="Tu trabajo · 3 de 4" titulo="Código del local"
      subtitulo="Pídele al dueño el código de acceso de la barbería.">
      <Campo label="Código de acceso" placeholder="ABC123" autoCapitalize="characters"
        maxLength={6} value={codigo} onChangeText={setCodigo} />
      <BotonPrimario texto="Continuar" onPress={continuar} disabled={codigo.trim().length < 4} />
    </OnbScreen>
  )
}
