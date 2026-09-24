/**
 * AGREGAR CON UN CÓDIGO. UN SOLO CAMPO PARA LAS DOS COSAS.
 *
 * El cliente no sabe —ni tiene por qué— si el papelito que le dieron lleva el
 * código de la barbería o el de su barbero: es un código y ya. Preguntárselo
 * («¿es de local o de barbero?») es pedirle que nos resuelva a nosotros un
 * problema nuestro, y equivocarse le devolvía un «no encontrado» que era
 * mentira: el código existía, solo que se buscó en la tabla que no era.
 *
 * Aquí se preguntan las dos a la vez y se queda la que conteste. Salen juntas
 * y no una detrás de otra porque encadenarlas cobraría dos esperas a quien
 * traiga un código de barbero, que es el caso más común.
 *
 * Por código y NO por buscador. Una barbería no se elige de una lista de
 * resultados: se va a la del barrio, a la que le dieron a uno el papel. Un
 * buscador abierto invita a escribir «barbería» y llevarse cien nombres que
 * no le sirven a nadie.
 */
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native'
import { useState } from 'react'
import { useRouter, Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getSesion, guardarSesion } from '../../../lib/storage'
import { getBarberoPorCodigo, getBarberoNegocios, seguirBarberoEnNegocio, getNegocioPorCodigo } from '../../../lib/db'
import { COLORS, FONTS, GLASS } from '../../../constants'
import { Display, Avatar } from '../../../components/ui'
import { useGestoVolver } from '../../../components/gestos'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function BuscarBarbero() {
  // El hueco de arriba lo dice el sistema, no un número: en un teléfono con
  // isla dinámica 72 px se quedaban cortos y en uno sin muesca sobraban.
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [codigo, setCodigo] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [barbero, setBarbero] = useState<any>(null)
  const [negocios, setNegocios] = useState<any[]>([])
  const [yendo, setYendo] = useState(false)

  async function buscar() {
    if (codigo.trim().length < 4) return
    setBuscando(true); setBarbero(null); setNegocios([])
    try {
      // `getNegocioPorCodigo` LANZA cuando no lo encuentra y `getBarberoPorCodigo`
      // devuelve null: dos formas de decir lo mismo. Aquí se igualan a null,
      // porque en esta pantalla «no es un local» no es un error — es la mitad
      // de la respuesta.
      const [neg, bar] = await Promise.all([
        getNegocioPorCodigo(codigo.trim()).catch(() => null),
        getBarberoPorCodigo(codigo.trim()).catch(() => null),
      ])
      // El local primero: si un día un código valiera para los dos, entrar a
      // la barbería lleva dentro a su barbero, y al revés no.
      if (neg) { await irAlLocal({ negocio_id: neg.id, nombre: neg.nombre }); return }
      if (!bar) {
        Alert.alert('No encontrado',
          'No hay ninguna barbería ni ningún barbero con ese código. Revísalo e intenta de nuevo.')
        return
      }
      setBarbero(bar)
      setNegocios(await getBarberoNegocios(bar.id).catch(() => []))
    } catch (e: any) { Alert.alert('Error', e.message ?? 'Intenta de nuevo.') }
    finally { setBuscando(false) }
  }

  async function irAlLocal(n: any) {
    setYendo(true)
    try {
      await seguirBarberoEnNegocio(n.negocio_id)
      const ss = await getSesion()
      await guardarSesion({ ...(ss || {}), negocio_id: n.negocio_id, rol: 'cliente' } as any)
      router.replace('/(app)/cliente/turno')
    } catch (e: any) { Alert.alert('No se pudo', e.message ?? 'Intenta de nuevo.'); setYendo(false) }
  }

  // Deslizar desde el borde izquierdo vuelve atrás (components/gestos.tsx).
  const volver = useGestoVolver()

  return (
    <View style={s.container} {...volver}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}><Ionicons name="chevron-back" size={22} color={COLORS.ink} /></TouchableOpacity>
        <Display size={24}>Agregar con un código</Display>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
        <Text style={s.sec}>EL CÓDIGO</Text>
        {/* El campo es GRANDE y las letras van separadas porque un código se
            copia de un papel mirando una letra cada vez. Apretado y en
            cuerpo normal se salta un carácter y el error llega al final. */}
        <View style={s.buscarRow}>
          <TextInput style={s.input} placeholder="BD4K" placeholderTextColor={COLORS.textLight} selectionColor={COLORS.ink}
            autoCapitalize="characters" autoCorrect={false} maxLength={9}
            value={codigo} onChangeText={t => setCodigo(t.toUpperCase())}
            onSubmitEditing={buscar} returnKeyType="go" />
          <TouchableOpacity style={[s.buscarBtn, codigo.trim().length < 4 && s.buscarBtnOff]}
            onPress={buscar} disabled={buscando || codigo.trim().length < 4}>
            {buscando ? <ActivityIndicator color={COLORS.onInk} /> : <Text style={[s.buscarBtnT, codigo.trim().length < 4 && { color: COLORS.disabled }]}>Entrar</Text>}
          </TouchableOpacity>
        </View>
        <Text style={s.hint}>
          Te lo da la barbería, o tu barbero. Con él entras directo, sin buscar
          nada. Si es el suyo, te enseñamos dónde trabaja para que elijas.
        </Text>

        {/* Solo aparece con un código DE BARBERO: el de la barbería entra
            derecho, sin pantalla intermedia — no hay nada que elegir. */}
        {barbero && (
          <>
            <View style={s.card}>
              <Avatar name={barbero.nombre} uri={barbero.foto_url} size={64} />
              <View style={{ flex: 1 }}>
                <Text style={s.nombre}>{barbero.nombre}</Text>
                {barbero.especialidad ? <Text style={s.esp}>{barbero.especialidad}</Text> : null}
                {barbero.bio ? <Text style={s.bio} numberOfLines={3}>{barbero.bio}</Text> : null}
              </View>
            </View>

            <Text style={s.sec}>DÓNDE TRABAJA</Text>
            {negocios.length === 0 && <Text style={s.empty}>Este barbero no está activo en ningún local ahora.</Text>}
            {negocios.map((n) => (
              <TouchableOpacity key={n.negocio_id} style={s.local} onPress={() => irAlLocal(n)} disabled={yendo}>
                <Ionicons name="storefront-outline" size={20} color={COLORS.ink} />
                <Text style={s.localT} numberOfLines={1}>{n.nombre}</Text>
                {/* Una flecha no dice qué pasa al tocar. Esto sí, y es lo que
                    el cliente vino a hacer: sumarse a ese local. */}
                <View style={s.agregar}><Text style={s.agregarT}>Agregar</Text></View>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  back: { width: 44, height: 44, borderWidth: 1, borderColor: GLASS.border, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: GLASS.fillStrong },
  hint: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textMid, marginTop: 10, marginBottom: 26, lineHeight: 18 },
  buscarRow: { flexDirection: 'row', gap: 9, marginTop: 12 },
  input: { flex: 1, height: 52, borderWidth: 1, borderColor: GLASS.border, paddingHorizontal: 18, fontFamily: FONTS.monoBold, fontSize: 24, letterSpacing: 1.2, color: COLORS.ink, backgroundColor: GLASS.fillStrong, borderRadius: 26 },
  buscarBtn: { width: 112, height: 52, backgroundColor: COLORS.ink, borderWidth: 1, borderColor: COLORS.ink, alignItems: 'center', justifyContent: 'center', borderRadius: 26 },
  // Regla 2: apagado con borde punteado, nunca un gris lleno con texto blanco.
  buscarBtnOff: { backgroundColor: 'transparent', borderColor: COLORS.disabled, borderStyle: 'dashed' },
  buscarBtnT: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.onInk, letterSpacing: 0 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18, marginBottom: 16, borderTopWidth: 1, borderTopColor: GLASS.hairline, backgroundColor: GLASS.fill, borderWidth: 1, borderColor: GLASS.border, borderRadius: GLASS.radioFila, paddingHorizontal: 14 },
  nombre: { fontFamily: FONTS.semibold, letterSpacing: -0.2, fontSize: 17, color: COLORS.ink },
  esp: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.blue, marginTop: 2 },
  bio: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textLight, marginTop: 6 },
  sec: { fontFamily: FONTS.bold, fontSize: 11, color: COLORS.textMid, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
  empty: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textLight, paddingVertical: 12 },
  local: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, backgroundColor: GLASS.fill, borderWidth: 1, borderColor: GLASS.border, borderRadius: GLASS.radioFila, paddingHorizontal: 14, marginBottom: 8 },
  localT: { flex: 1, fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  agregar: { height: 44, justifyContent: 'center', paddingHorizontal: 16, backgroundColor: COLORS.ink, borderRadius: 22 },
  agregarT: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.onInk },
})
