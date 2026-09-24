import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useState, useCallback } from 'react'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getSesion, guardarSesion } from '../lib/storage'
import { getMisRoles, type OpcionPanel } from '../lib/db'
import { COLORS, FONTS, GLASS } from '../constants'
import { INICIO_DE_PANEL } from '../lib/paneles'



function etiqueta(o: OpcionPanel) {
  if (o.panel === 'cliente') return `Cliente · ${o.negocio}`
  if (o.panel === 'barberia') return `Barbería · ${o.negocio}`
  return `Mi silla · ${o.negocio}`
}
function detalle(o: OpcionPanel) {
  if (o.panel === 'cliente') return 'Pedir turno y reservar citas'
  if (o.panel === 'barberia') return 'Cola del local, equipo y ajustes'
  return 'Tu agenda, tus servicios y horarios'
}
function icono(panel: string): keyof typeof Ionicons.glyphMap {
  return panel === 'cliente' ? 'person-outline' : panel === 'barberia' ? 'storefront-outline' : 'cut-outline'
}

/**
 * Conmutador de panel. Reemplaza los botones "(dev)" que estaban tras DEV_LOGIN.
 * Se oculta solo si la persona tiene un único panel al que entrar.
 */
export default function CambiarRol() {
  const router = useRouter()
  const [opciones, setOpciones] = useState<OpcionPanel[]>([])
  const [actual, setActual] = useState<{ panel?: string; negocio_id?: string }>({})

  const cargar = useCallback(async () => {
    const ss = await getSesion()
    if (!ss?.usuario_id) return
    setActual({ panel: ss.panel, negocio_id: ss.negocio_id })
    setOpciones(await getMisRoles(ss.usuario_id).catch(() => []))
  }, [])
  // Al enfocar, no solo al montar: si la pantalla ya estaba viva, el
  // distintivo se quedaba mostrando el panel anterior.
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  if (opciones.length < 2) return null

  async function cambiar(o: OpcionPanel) {
    const ss = await getSesion(); if (!ss) return
    await guardarSesion({
      ...ss,
      rol: o.rol as any,
      panel: o.panel,
      negocio_id: o.negocio_id,
      perfil_id: o.panel === 'cliente' ? undefined : o.perfil_id,
    })
    if (o.panel === 'silla' && o.perfil_id && !o.aprobado) {
      router.replace('/(auth)/barbero-pendiente'); return
    }
    router.replace(INICIO_DE_PANEL[o.panel] as any)
  }

  return (
    <>
      <Text style={s.sec}>CAMBIAR DE PANEL</Text>
      {opciones.map(o => {
        const esActual = o.panel === actual.panel && o.negocio_id === actual.negocio_id
        return (
          <TouchableOpacity key={`${o.panel}-${o.negocio_id}`} style={[s.fila, esActual && s.filaOn]}
            onPress={() => cambiar(o)} disabled={esActual}>
            <Ionicons name={icono(o.panel)} size={20} color={esActual ? COLORS.redText : COLORS.textMid} />
            <View style={{ flex: 1 }}>
              <Text style={s.txt}>{etiqueta(o)}</Text>
              {/* «Pendiente de aprobación» era la única espera posible hasta la
                  110. Ahora la espera puede ser AL REVÉS —te invitaron y el que
                  no ha contestado eres tú— y decirle que espera al dueño le
                  esconde que tiene algo que hacer. */}
              <Text style={s.det}>
                {!o.aprobado && o.panel === 'silla'
                  ? (o.pendiente_de === 'barbero' ? 'Te invitaron · falta que aceptes' : 'Pendiente de aprobación')
                  : detalle(o)}
              </Text>
            </View>
            {esActual
              ? <Text style={s.aqui}>AQUÍ</Text>
              : <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />}
          </TouchableOpacity>
        )
      })}
    </>
  )
}

const s = StyleSheet.create({
  // Filas con filete, no tarjetas blancas con borde: en D2 una lista es una
  // lista, y las cajas sueltas son para lo que se lee aparte.
  sec: { fontFamily: FONTS.bold, fontSize: 11, color: COLORS.textMid, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 22 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, backgroundColor: GLASS.fill, borderWidth: 1, borderColor: GLASS.border, borderRadius: GLASS.radioFila, paddingHorizontal: 14, marginBottom: 8 },
  // El panel en el que estás: filete rojo a la izquierda, como «tu barbero»
  // en Mi barbería. Una marca, no un recuadro verde.
  filaOn: { backgroundColor: GLASS.fillStrong, paddingHorizontal: 12 },
  txt: { fontFamily: FONTS.semibold, fontSize: 17, color: COLORS.ink },
  det: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textMid, marginTop: 2 },
  aqui: { fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 1.2, color: COLORS.onInk, backgroundColor: COLORS.ink, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
})
