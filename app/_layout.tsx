import { Stack, useRouter } from 'expo-router'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { View, ActivityIndicator } from 'react-native'
import { useEffect } from 'react'
import * as Notifications from 'expo-notifications'
import { useFonts, Anton_400Regular } from '@expo-google-fonts/anton'
import {
  PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans'
import { Text } from 'react-native'
import { COLORS } from '../constants'
import { ErrorBoundary } from '../components/error-boundary'
import { faltaConfiguracion } from '../lib/supabase'
import { getSesion, guardarSesion } from '../lib/storage'
import { getMisRoles } from '../lib/db'
import type { PanelActivo } from '../types'

/**
 * A DÓNDE LLEVA CADA PUSH AL TOCARLO.
 *
 * Dos fallos aquí, los dos de la misma familia — el emisor y el receptor
 * dejaron de hablar el mismo idioma y nadie se enteró porque un push que no
 * hace nada al tocarlo no da error.
 *
 * 1) EL VOCABULARIO NO CUADRABA. Lo que de verdad se envía (lib/notificaciones)
 *    es `turno`, `cita`, `agenda`, `equipo` y `premio`. Lo que este mapa
 *    enrutaba era `turno`, `cita`, `agenda`, `solicitud` y `canje`. O sea:
 *
 *      · `equipo` (un barbero pide entrar) → el dueño toca y NO PASA NADA.
 *      · `premio` (el cliente ganó su corte) → toca y NO PASA NADA.
 *      · `solicitud` y `canje` eran ramas muertas: nadie las manda.
 *
 * 2) NAVEGAR NO ES CAMBIAR DE PANEL. Antes esto hacía `router.push` a secas, y
 *    los layouts no tienen guarda. Quien es cliente en un local y barbero en
 *    otro, con la sesión puesta en el primero, tocaba un push de agenda y
 *    aterrizaba en la agenda DEL LOCAL EQUIVOCADO: con datos reales, con el
 *    distintivo diciendo CLIENTE encima, y sin un solo error. Es la misma
 *    decisión que ya estaba tomada en components/cambiar-rol.tsx — «cambiar de
 *    panel es cambiar la sesión, no solo navegar»— y que aquí no se aplicaba.
 *
 * Lo que SIGUE pendiente y no se puede arreglar desde aquí: el push no lleva
 * `negocio_id`, así que si la persona tiene ese panel en DOS locales, esto
 * acierta el panel pero no puede saber de cuál de los dos le hablan. Se queda
 * en el que ya tenía, que es lo menos malo. Arreglarlo de verdad es meter el
 * negocio en el payload, y eso toca todos los emisores.
 */
const DESTINO_PUSH: Record<string, { panel: PanelActivo; ruta: string }> = {
  turno:  { panel: 'cliente',  ruta: '/(app)/cliente/turno' },
  cita:   { panel: 'cliente',  ruta: '/(app)/cliente/home' },
  premio: { panel: 'cliente',  ruta: '/(app)/cliente/perfil' },
  agenda: { panel: 'silla',    ruta: '/(app)/barbero/agenda' },
  equipo: { panel: 'barberia', ruta: '/(app)/dueno/dashboard' },
}

export default function RootLayout() {
  const router = useRouter()
  const [loaded] = useFonts({
    Anton_400Regular,
    PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
  })

  // Tocar una notificación abre la pantalla pertinente, EN SU PANEL.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(resp => {
      (async () => {
        const destino = DESTINO_PUSH[(resp.notification.request.content.data as any)?.tipo]
        if (!destino) return
        const ss = await getSesion()
        if (!ss?.usuario_id) return

        if (ss.panel !== destino.panel) {
          // Se prefiere el MISMO local en el que ya estaba: si es barbero aquí y
          // allá, el push no dice de cuál habla, y moverle de barbería sin que
          // lo pida es peor que dejarle donde estaba.
          const opciones = await getMisRoles(ss.usuario_id).catch(() => [])
          const o = opciones.find(x => x.panel === destino.panel && x.negocio_id === ss.negocio_id)
                 ?? opciones.find(x => x.panel === destino.panel)
          // Sin ese panel no se le lleva a ninguna parte: una pantalla de barbero
          // para quien no lo es sale vacía y parece rota.
          if (!o) return
          await guardarSesion({
            ...ss, negocio_id: o.negocio_id, rol: o.rol as any, panel: o.panel,
            perfil_id: o.panel === 'cliente' ? undefined : o.perfil_id,
          })
        }
        router.replace(destino.ruta as any)
      })().catch(() => {})
    })
    return () => sub.remove()
  }, [router])

  // Una actualización publicada sin las variables del servidor. Antes esto
  // cerraba la app al abrir, sin decir nada; ahora al menos se lee.
  if (faltaConfiguracion) return (
    <View style={{ flex: 1, backgroundColor: COLORS.carbon, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 10, textAlign: 'center' }}>
        Esta versión salió mal publicada
      </Text>
      <Text style={{ color: '#B9BAC0', fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
        Le faltan los datos del servidor, así que no puede conectarse. No es tu
        teléfono ni tu cuenta: hay que volver a publicar la actualización.
      </Text>
    </View>
  )

  if (!loaded) return <View style={{ flex: 1, backgroundColor: COLORS.carbon, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={COLORS.red} size="large" /></View>
  // SafeAreaProvider envuelve TODO: es de donde salen las medidas reales del
  // teléfono (la barra de gestos, los botones de Android, la muesca). Sin él,
  // useSafeAreaInsets devuelve ceros y las barras de abajo vuelven a quedar
  // debajo de los controles del sistema. Ver components/tabs.tsx.
  return (
    <SafeAreaProvider>
      <ErrorBoundary><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false }} /></ErrorBoundary>
    </SafeAreaProvider>
  )
}
