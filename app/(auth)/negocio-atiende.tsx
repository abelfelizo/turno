import { useState } from 'react'
import { useRouter } from 'expo-router'
import { OnbScreen, Opcion, BotonPrimario } from '../../components/onb'
import { borrador } from '../../lib/onboarding'
import type { TipoServicio } from '../../types'

export default function NegocioAtiende() {
  const router = useRouter()
  const [atiende, setAtiende] = useState<boolean | undefined>(borrador.atiende)
  const [tipoServicio, setTipoServicio] = useState<TipoServicio | undefined>(borrador.tipoServicio)

  function continuar() {
    borrador.atiende = atiende
    borrador.tipoServicio = atiende ? (tipoServicio ?? 'barbero') : undefined
    router.push('/(auth)/negocio-config')
  }

  const listo = atiende === false || (atiende === true && !!tipoServicio)

  return (
    <OnbScreen paso="Tu barbería · 2 de 3" titulo="¿Tú también atiendes clientes?"
      subtitulo="Si cortas o atiendes, te crearemos tu propio perfil de trabajo.">
      <Opcion label="Sí, yo también atiendo"
        seleccionado={atiende === true} onPress={() => setAtiende(true)} />
      <Opcion label="No, solo administro"
        seleccionado={atiende === false} onPress={() => setAtiende(false)} />

      {atiende === true && (
        <>
          <Opcion label="Barbería" seleccionado={tipoServicio === 'barbero'} onPress={() => setTipoServicio('barbero')} />
          <Opcion label="Manicure / Pedicure" seleccionado={tipoServicio === 'manicuri_pedicuri'} onPress={() => setTipoServicio('manicuri_pedicuri')} />
        </>
      )}
      <BotonPrimario texto="Continuar" onPress={continuar} disabled={!listo} />
    </OnbScreen>
  )
}
