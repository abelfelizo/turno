import { useState } from 'react'
import { useRouter } from 'expo-router'
import { OnbScreen, Campo, BotonPrimario } from '../../components/onb'
import { borrador } from '../../lib/onboarding'

export default function BarberoIndependiente() {
  const router = useRouter()
  const [codigo, setCodigo] = useState(borrador.codigo ?? '')

  function continuar() {
    borrador.codigo = codigo.trim().toUpperCase()
    router.push('/(auth)/barbero-perfil')
  }

  return (
    <OnbScreen paso="Tu trabajo · 3 de 4" titulo="Local donde rentas"
      subtitulo="Como independiente, te unes al local donde trabajas con su código. Pagas tu propia suscripción.">
      <Campo label="Código del local" placeholder="ABC123" autoCapitalize="characters"
        maxLength={6} value={codigo} onChangeText={setCodigo} />
      <BotonPrimario texto="Continuar" onPress={continuar} disabled={codigo.trim().length < 4} />
    </OnbScreen>
  )
}
