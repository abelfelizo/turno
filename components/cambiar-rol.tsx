import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useState, useCallback } from 'react'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getSesion, guardarSesion } from '../lib/storage'
import { getMisRoles, type OpcionPanel } from '../lib/db'
import { COLORS, FONTS } from '../constants'
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
      <Text style={s.sec}>Cambiar de panel</Text>
      {opciones.map(o => {
        const esActual = o.panel === actual.panel && o.negocio_id === actual.negocio_id
        return (
          <TouchableOpacity key={`${o.panel}-${o.negocio_id}`} style={[s.fila, esActual && s.filaOn]}
            onPress={() => cambiar(o)} disabled={esActual}>
            <View style={[s.ico, esActual && { backgroundColor: COLORS.ink }]}>
              <Ionicons name={icono(o.panel)} size={19} color={esActual ? '#fff' : COLORS.ink} />
            </View>
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
              ? <Text style={s.aqui}>Aquí</Text>
              : <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />}
          </TouchableOpacity>
        )
      })}
    </>
  )
}

const s = StyleSheet.create({
  // Filas con separador de 1 px, como toda lista de la línea gráfica.
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 22, marginBottom: 4 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  // El panel en el que estás: avatar en tinta y la marca «Aquí».
  filaOn: {},
  ico: { width: 42, height: 42, borderRadius: 8, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  txt: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  det: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textLight, marginTop: 2 },
  aqui: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.red },
})
