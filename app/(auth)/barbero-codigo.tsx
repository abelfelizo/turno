import { useState } from 'react'
import { useRouter } from 'expo-router'
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { OnbScreen, Campo, BotonPrimario } from '../../components/onb'
import { borrador } from '../../lib/onboarding'
import { getNegocioPorCodigo } from '../../lib/db'
import { COLORS, FONTS } from '../../constants'

/**
 * Alta del barbero en un local.
 *
 * Antes había un paso previo preguntándole "¿eres empleado o rentas espacio?".
 * Esa pregunta no es suya: la modalidad la pone la barbería (`negocios.tipo`), y
 * el servidor la deriva de ahí. Preguntársela solo servía para que respondiera
 * algo que luego se ignora — o peor, para colarse como autónomo en un local de
 * empleados. Ahora se valida el código y se le DICE en qué entra.
 */
export default function BarberoCodigo() {
  const router = useRouter()
  const [codigo, setCodigo] = useState(borrador.codigo ?? '')
  const [negocio, setNegocio] = useState<any>(null)
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState('')

  async function verificar() {
    setBuscando(true); setError(''); setNegocio(null)
    try {
      const n = await getNegocioPorCodigo(codigo)
      setNegocio(n)
    } catch (e: any) {
      setError(e.message ?? 'No encontramos ese local.')
    } finally { setBuscando(false) }
  }

  function continuar() {
    borrador.codigo = codigo.trim().toUpperCase()
    borrador.rol = negocio?.tipo === 'espacios_rentados' ? 'barbero_renta' : 'empleado'
    router.push('/(auth)/barbero-perfil')
  }

  const renta = negocio?.tipo === 'espacios_rentados'

  return (
    <OnbScreen paso="Tu trabajo · 3 de 4" titulo="Código del local"
      subtitulo="Pídeselo al dueño de la barbería donde vas a trabajar.">
      <Campo label="Código de acceso" placeholder="ABC-1234" autoCapitalize="characters"
        maxLength={9} value={codigo}
        onChangeText={(t: string) => { setCodigo(t); setNegocio(null); setError('') }} />

      {error ? <Text style={s.error}>{error}</Text> : null}

      {negocio && (
        <View style={s.card}>
          <Text style={s.cardKicker}>TE VAS A UNIR A</Text>
          <Text style={s.cardNombre}>{negocio.nombre}</Text>
          <View style={s.modalidad}>
            <Ionicons name={renta ? 'person' : 'business'} size={16} color={COLORS.textMid} />
            <Text style={s.modalidadT}>
              {/* QUÉ CAMBIA SEGÚN LA MODALIDAD: quién pone las reglas y quién
                  paga. Lo que YA NO cambia es si hay que esperar a alguien —la
                  migración 110 lo igualó— porque entrar a un local lo firman
                  los dos, alquile asientos o tenga empleados. Este texto decía
                  «entras directo, sin esperar aprobación» y era la 94. */}
              {renta
                ? 'Alquila asientos: pones tus propios servicios, precios y horarios, y pagas tu suscripción. El dueño tiene que aceptarte, pero no te dirige.'
                : 'Trabaja con empleados: los servicios, precios y el horario los pone el local, y el dueño cubre tu suscripción. Te dará de alta él cuando envíes la solicitud.'}
            </Text>
          </View>
        </View>
      )}

      {buscando
        ? <ActivityIndicator color={COLORS.red} style={{ marginTop: 20 }} />
        : negocio
          ? <BotonPrimario texto="Continuar" onPress={continuar} />
          : <BotonPrimario texto="Buscar local" onPress={verificar} disabled={codigo.trim().length < 4} />}
    </OnbScreen>
  )
}

const s = StyleSheet.create({
  error: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.red, marginTop: 10 },
  card: { backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 16, padding: 16, marginTop: 16 },
  cardKicker: { fontFamily: FONTS.bold, fontSize: 10, color: COLORS.textLight, letterSpacing: 1 },
  cardNombre: { fontFamily: FONTS.display, fontSize: 24, color: COLORS.ink, marginTop: 4 },
  modalidad: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 12 },
  modalidadT: { flex: 1, fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textMid, lineHeight: 18 },
})
