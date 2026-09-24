import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native'
import { useState, useCallback } from 'react'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getSesion, guardarSesion } from '../lib/storage'
import { getMisRoles, type OpcionPanel } from '../lib/db'
import { COLORS, FONTS, SOBRE } from '../constants'
import { INICIO_DE_PANEL, NOMBRE_DE_PANEL } from '../lib/paneles'
import type { PanelActivo } from '../types'



const ICONO: Record<string, keyof typeof Ionicons.glyphMap> = {
  cliente: 'person', barberia: 'storefront', silla: 'cut',
}
// Color distinto por panel: la señal más rápida de "dónde estoy".
// Superficies pintadas (Regla 1): texto blanco en las tres.
const FONDO: Record<string, string> = { cliente: SOBRE.azul.fondo, barberia: SOBRE.tinta.fondo, silla: SOBRE.rojo.fondo }

/**
 * Distintivo del panel activo. Nace de una confusión real en el piloto: con
 * dos paneles sobre el mismo local ("Barbería" y "Mi silla") nada en pantalla
 * decía en cuál estabas. Se oculta si la persona solo tiene un panel.
 */
export default function PanelBadge() {
  const router = useRouter()
  const [opciones, setOpciones] = useState<OpcionPanel[]>([])
  const [actual, setActual] = useState<{ panel?: PanelActivo; negocio_id?: string }>({})

  const cargar = useCallback(async () => {
    const ss = await getSesion()
    if (!ss?.usuario_id) return
    setActual({ panel: ss.panel, negocio_id: ss.negocio_id })
    setOpciones(await getMisRoles(ss.usuario_id).catch(() => []))
  }, [])
  // Al enfocar, no solo al montar: si la pantalla ya estaba viva, el
  // distintivo se quedaba mostrando el panel anterior.
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  if (opciones.length < 2 || !actual.panel) return null
  const aqui = opciones.find(o => o.panel === actual.panel && o.negocio_id === actual.negocio_id)

  async function ir(o: OpcionPanel) {
    const ss = await getSesion(); if (!ss) return
    await guardarSesion({
      ...ss, rol: o.rol as any, panel: o.panel, negocio_id: o.negocio_id,
      perfil_id: o.panel === 'cliente' ? undefined : o.perfil_id,
    })
    router.replace(INICIO_DE_PANEL[o.panel] as any)
  }

  function abrir() {
    const otros = opciones.filter(o => !(o.panel === actual.panel && o.negocio_id === actual.negocio_id))
    Alert.alert('Cambiar de panel', 'Estás en: ' + (aqui ? `${NOMBRE_DE_PANEL[aqui.panel]} · ${aqui.negocio}` : ''),
      [...otros.map(o => ({ text: `${NOMBRE_DE_PANEL[o.panel]} · ${o.negocio}`, onPress: () => ir(o) })),
       { text: 'Quedarme aquí', style: 'cancel' as const }])
  }

  return (
    <TouchableOpacity style={[s.pill, { backgroundColor: FONDO[actual.panel] }]} onPress={abrir} activeOpacity={0.85}>
      <Ionicons name={ICONO[actual.panel]} size={13} color="#fff" />
      <Text style={s.txt} numberOfLines={1}>{NOMBRE_DE_PANEL[actual.panel]}{aqui ? ` · ${aqui.negocio}` : ''}</Text>
      <Ionicons name="swap-horizontal" size={14} color="#FFFFFF" />
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, marginBottom: 12 },
  txt: { fontFamily: FONTS.bold, fontSize: 11, color: '#FFFFFF', letterSpacing: 1.2, maxWidth: 220 },
})
