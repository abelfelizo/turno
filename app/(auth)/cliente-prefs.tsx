import { useState } from 'react'
import { useRouter } from 'expo-router'
import { Alert, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { OnbScreen, Campo, BotonPrimario } from '../../components/onb'
import { borrador, resetBorrador } from '../../lib/onboarding'
import { guardarPreferencias, getMiUsuario } from '../../lib/db'
import { COLORS } from '../../constants'

export default function ClientePrefs() {
  const router = useRouter()
  const [tipoCorte, setTipoCorte] = useState('')
  const [barba, setBarba] = useState('')
  const [alergias, setAlergias] = useState('')
  const [notas, setNotas] = useState('')
  const [cargando, setCargando] = useState(false)

  async function guardar(saltar: boolean) {
    setCargando(true)
    try {
      if (!saltar) {
        const usuario = await getMiUsuario()
        if (usuario && borrador.negocioId) {
          await guardarPreferencias({
            usuario_id: usuario.id, negocio_id: borrador.negocioId,
            tipo_corte: tipoCorte.trim() || null, barba: barba.trim() || null,
            alergias: alergias.trim() || null, notas: notas.trim() || null,
          })
        }
      }
      resetBorrador()
      router.replace('/(app)/cliente/home')
    } catch (e: any) {
      Alert.alert('No se pudo guardar', e.message ?? 'Intenta de nuevo.')
    } finally { setCargando(false) }
  }

  return (
    <OnbScreen paso="Cliente · 2 de 2" titulo="Tus preferencias"
      subtitulo="Opcional. Ayuda a tu barbero a atenderte mejor.">
      <Campo label="Tipo de corte" placeholder="Fade, clásico, a máquina…" value={tipoCorte} onChangeText={setTipoCorte} />
      <Campo label="Barba" placeholder="Perfilado, recorte…" value={barba} onChangeText={setBarba} />
      <Campo label="Alergias" placeholder="Productos que debes evitar" value={alergias} onChangeText={setAlergias} />
      <Campo label="Notas" placeholder="Algo más que tu barbero deba saber" value={notas} onChangeText={setNotas} />
      <BotonPrimario texto="Guardar y entrar" onPress={() => guardar(false)} cargando={cargando} />
      <TouchableOpacity style={s.link} onPress={() => guardar(true)} disabled={cargando}>
        <Text style={s.linkT}>Omitir por ahora</Text>
      </TouchableOpacity>
    </OnbScreen>
  )
}

const s = StyleSheet.create({
  link: { alignItems: 'center', padding: 16, marginTop: 4 },
  linkT: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' },
})
