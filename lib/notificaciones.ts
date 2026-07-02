import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from './supabase'

// Cómo se muestran las notificaciones con la app en primer plano.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

/**
 * Pide permiso, obtiene el Expo push token y lo guarda en turno_push_tokens.
 * Devuelve el token o null (simulador, permiso denegado, o falta de dev build).
 * Seguro de llamar siempre: nunca lanza.
 */
export async function registrarPush(): Promise<string | null> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Turno',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      })
    }

    const { status: existente } = await Notifications.getPermissionsAsync()
    let status = existente
    if (existente !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status
    }
    if (status !== 'granted') return null

    const projectId =
      (Constants?.expoConfig as any)?.extra?.eas?.projectId ??
      (Constants as any)?.easConfig?.projectId
    const token = (await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    )).data

    await supabase.rpc('turno_guardar_push_token', { p_token: token, p_plataforma: Platform.OS })
    return token
  } catch (e) {
    // Esperado en Expo Go / simulador / sin permiso. No es un error fatal.
    if (__DEV__) console.log('[push] no disponible:', (e as Error)?.message)
    return null
  }
}

/**
 * Envía un push a un usuario (vía edge function turno-enviar-push).
 * Fire-and-forget: nunca lanza, solo loguea.
 */
export async function enviarPush(
  usuarioId: string,
  titulo: string,
  cuerpo: string,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.functions.invoke('turno-enviar-push', {
      body: { usuario_id: usuarioId, titulo, cuerpo, data },
    })
  } catch (e) {
    if (__DEV__) console.log('[push] no se pudo enviar:', (e as Error)?.message)
  }
}
