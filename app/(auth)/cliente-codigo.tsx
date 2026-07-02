import { useState } from 'react'
import { useRouter } from 'expo-router'
import { Alert } from 'react-native'
import { OnbScreen, Campo, BotonPrimario } from '../../components/onb'
import { borrador, resetBorrador } from '../../lib/onboarding'
import { unirseCliente } from '../../lib/db'

export default function ClienteCodigo() {
  const router = useRouter()
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [cargando, setCargando] = useState(false)

  async function entrar() {
    if (!codigo.trim() || !nombre.trim() || !telefono.trim()) {
      Alert.alert('Faltan datos', 'Completa todos los campos.'); return
    }
    setCargando(true)
    try {
      const neg = await unirseCliente({ codigo: codigo.trim().toUpperCase(), nombre: nombre.trim(), telefono: telefono.trim() })
      resetBorrador()
      borrador.negocioId = neg.id
      router.push('/(auth)/cliente-prefs')
    } catch (e: any) {
      Alert.alert('Código inválido', e.message ?? 'Verifica el código con tu barbería.')
    } finally { setCargando(false) }
  }

  return (
    <OnbScreen paso="Cliente · 1 de 2" titulo="Entra a tu barbería"
      subtitulo="Pide el código a tu barbería (o usa DEMO01 para probar).">
      <Campo label="Código del local" placeholder="DEMO01" autoCapitalize="characters" maxLength={9} value={codigo} onChangeText={setCodigo} />
      <Campo label="Tu nombre" placeholder="Tu nombre" value={nombre} onChangeText={setNombre} />
      <Campo label="Tu teléfono" placeholder="+1 809 000 0000" keyboardType="phone-pad" value={telefono} onChangeText={setTelefono} />
      <BotonPrimario texto="Continuar" onPress={entrar} cargando={cargando} />
    </OnbScreen>
  )
}
