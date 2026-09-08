import { Stack, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { View, ActivityIndicator } from 'react-native'
import { useEffect } from 'react'
import * as Notifications from 'expo-notifications'
import { useFonts, Anton_400Regular } from '@expo-google-fonts/anton'
import {
  PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans'
import { COLORS } from '../constants'
import { ErrorBoundary } from '../components/error-boundary'

// A qué pantalla lleva cada push al tocarla (deep links). Ver matriz en ARQUITECTURA-UX §4.
function rutaDeNotificacion(data: any): string | null {
  switch (data?.tipo) {
    case 'turno': return '/(app)/cliente/turno'
    case 'cita': return '/(app)/cliente/home'
    case 'agenda': return '/(app)/barbero/agenda'
    case 'solicitud': return '/(app)/dueno/dashboard'
    case 'canje': return '/(app)/cliente/perfil'
    default: return null
  }
}

export default function RootLayout() {
  const router = useRouter()
  const [loaded] = useFonts({
    Anton_400Regular,
    PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
  })

  // Tocar una notificación abre la pantalla pertinente.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(resp => {
      const ruta = rutaDeNotificacion(resp.notification.request.content.data)
      if (ruta) router.push(ruta as any)
    })
    return () => sub.remove()
  }, [router])

  if (!loaded) return <View style={{ flex: 1, backgroundColor: COLORS.carbon, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={COLORS.red} size="large" /></View>
  return (<ErrorBoundary><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false }} /></ErrorBoundary>)
}
