import { useState } from 'react'
import { useRouter } from 'expo-router'
import { Alert, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { OnbScreen, Campo, BotonPrimario } from '../../components/onb'
import { borrador, resetBorrador } from '../../lib/onboarding'
import { unirseCliente, getBarberoPorCodigo, getBarberoNegocios, registrarUsuario, seguirBarberoEnNegocio } from '../../lib/db'
import { COLORS, FONTS } from '../../constants'

export default function ClienteCodigo() {
  const router = useRouter()
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [cargando, setCargando] = useState(false)
  // Si el código es de un barbero que trabaja en varios locales, hay que elegir.
  const [barbero, setBarbero] = useState<any>(null)
  const [opciones, setOpciones] = useState<any[]>([])

  function faltanDatos() {
    if (!codigo.trim() || !nombre.trim() || !telefono.trim()) {
      Alert.alert('Faltan datos', 'Completa todos los campos.'); return true
    }
    return false
  }

  /** Alta por código de BARBERO: registra al cliente y lo suma al local elegido. */
  async function entrarConBarbero(n: any) {
    setCargando(true)
    try {
      await registrarUsuario(nombre.trim(), telefono.trim(), 'cliente')
      await seguirBarberoEnNegocio(n.negocio_id)
      resetBorrador()
      borrador.negocioId = n.negocio_id
      router.push('/(auth)/cliente-prefs')
    } catch (e: any) {
      Alert.alert('No se pudo entrar', e.message ?? 'Intenta de nuevo.')
    } finally { setCargando(false) }
  }

  async function entrar() {
    if (faltanDatos()) return
    setCargando(true)
    try {
      // El mismo campo acepta código de local o de barbero: el cliente casi
      // siempre llega por su barbero, no por el nombre del negocio.
      const b = await getBarberoPorCodigo(codigo.trim()).catch(() => null)
      if (b) {
        const negs = await getBarberoNegocios(b.id).catch(() => [])
        if (negs.length === 0) {
          Alert.alert('Barbero sin local', `${b.nombre ?? 'Ese barbero'} todavía no atiende en ninguna barbería. Pídele el código de su local.`)
          return
        }
        if (negs.length === 1) { setCargando(false); return entrarConBarbero(negs[0]) }
        setBarbero(b); setOpciones(negs)   // trabaja en varios → que elija
        return
      }
      // Si no es de barbero, se trata como código de local.
      const neg = await unirseCliente({ codigo: codigo.trim(), nombre: nombre.trim(), telefono: telefono.trim() })
      resetBorrador()
      borrador.negocioId = neg.id
      router.push('/(auth)/cliente-prefs')
    } catch (e: any) {
      Alert.alert('Código inválido', e.message ?? 'Revisa el código de tu barbería o de tu barbero.')
    } finally { setCargando(false) }
  }

  if (opciones.length > 0) {
    return (
      <OnbScreen paso="Cliente · 1 de 2" titulo={`¿Dónde ves a ${barbero?.nombre ?? 'tu barbero'}?`}
        subtitulo="Trabaja en más de un local. Elige en cuál lo visitas.">
        {opciones.map((n: any) => (
          <TouchableOpacity key={n.negocio_id} style={s.opcion} onPress={() => entrarConBarbero(n)} disabled={cargando}>
            <View style={{ flex: 1 }}>
              <Text style={s.opcionT}>{n.nombre}</Text>
              <Text style={s.opcionD}>Entrar aquí</Text>
            </View>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={() => { setOpciones([]); setBarbero(null) }}>
          <Text style={s.volver}>Usar otro código</Text>
        </TouchableOpacity>
      </OnbScreen>
    )
  }

  return (
    <OnbScreen paso="Cliente · 1 de 2" titulo="Entra a tu barbería"
      subtitulo="Usa el código de la barbería o el de tu barbero — con cualquiera de los dos entras.">
      <Campo label="Código" placeholder="BUE-87OA o ABE-LT5X" autoCapitalize="characters" maxLength={9} value={codigo} onChangeText={setCodigo} />
      <Campo label="Tu nombre" placeholder="Tu nombre" value={nombre} onChangeText={setNombre} />
      <Campo label="Tu teléfono" placeholder="+1 809 000 0000" keyboardType="phone-pad" value={telefono} onChangeText={setTelefono} />
      <BotonPrimario texto="Continuar" onPress={entrar} cargando={cargando} />
    </OnbScreen>
  )
}

const s = StyleSheet.create({
  opcion: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.carbonEl, borderWidth: 1.5, borderColor: COLORS.carbonBorder, borderRadius: 16, padding: 18, marginBottom: 12 },
  opcionT: { fontFamily: FONTS.bold, fontSize: 16, color: '#fff' },
  opcionD: { fontFamily: FONTS.medium, fontSize: 13, color: '#9A9CA6', marginTop: 2 },
  volver: { fontFamily: FONTS.semibold, fontSize: 14, color: '#9A9CA6', textAlign: 'center', marginTop: 8 },
})
