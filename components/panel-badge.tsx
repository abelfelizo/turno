import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getSesion, guardarSesion } from '../lib/storage'
import { getMisRoles, type OpcionPanel } from '../lib/db'
import { COLORS, FONTS } from '../constants'

const DESTINO: Record<string, string> = {
  cliente: '/(app)/cliente/home',
  barberia: '/(app)/dueno/dashboard',
  silla: '/(app)/barbero/agenda',
}
const ETIQUETA: Record<string, string> = { cliente: 'CLIENTE', barberia: 'BARBERÍA', silla: 'MI SILLA' }
const ICONO: Record<string, keyof typeof Ionicons.glyphMap> = {
  cliente: 'person', barberia: 'storefront', silla: 'cut',
}
// Color distinto por panel: la señal más rápida de "dónde estoy".
const FONDO: Record<string, string> = { cliente: COLORS.blue, barberia: COLORS.carbon, silla: COLORS.red }

/**
 * Distintivo del panel activo. Nace de una confusión real en el piloto: con
 * dos paneles sobre el mismo local ("Barbería" y "Mi silla") nada en pantalla
 * decía en cuál estabas. Se oculta si la persona solo tiene un panel.
 */
export default function PanelBadge() {
  const router = useRouter()
  const [opciones, setOpciones] = useState<OpcionPanel[]>([])
  const [actual, setActual] = useState<{ panel?: string; negocio_id?: string }>({})

  const cargar = useCallback(async () => {
    const ss = await getSesion()
    if (!ss?.usuario_id) return
    setActual({ panel: ss.panel, negocio_id: ss.negocio_id })
    setOpciones(await getMisRoles(ss.usuario_id).catch(() => []))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  if (opciones.length < 2 || !actual.panel) return null
  const aqui = opciones.find(o => o.panel === actual.panel && o.negocio_id === actual.negocio_id)

  async function ir(o: OpcionPanel) {
    const ss = await getSesion(); if (!ss) return
    await guardarSesion({
      ...ss, rol: o.rol as any, panel: o.panel, negocio_id: o.negocio_id,
      perfil_id: o.panel === 'cliente' ? undefined : o.perfil_id,
    })
    router.replace(DESTINO[o.panel] as any)
  }

  function abrir() {
    const otros = opciones.filter(o => !(o.panel === actual.panel && o.negocio_id === actual.negocio_id))
    Alert.alert('Cambiar de panel', 'Estás en: ' + (aqui ? `${ETIQUETA[aqui.panel]} · ${aqui.negocio}` : ''),
      [...otros.map(o => ({ text: `${ETIQUETA[o.panel]} · ${o.negocio}`, onPress: () => ir(o) })),
       { text: 'Quedarme aquí', style: 'cancel' as const }])
  }

  return (
    <TouchableOpacity style={[s.pill, { backgroundColor: FONDO[actual.panel] }]} onPress={abrir} activeOpacity={0.85}>
      <Ionicons name={ICONO[actual.panel]} size={13} color="#fff" />
      <Text style={s.txt} numberOfLines={1}>{ETIQUETA[actual.panel]}{aqui ? ` · ${aqui.negocio}` : ''}</Text>
      <Ionicons name="swap-horizontal" size={14} color="rgba(255,255,255,0.7)" />
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, marginBottom: 12 },
  txt: { fontFamily: FONTS.bold, fontSize: 11, color: '#fff', letterSpacing: 0.8, maxWidth: 220 },
})
