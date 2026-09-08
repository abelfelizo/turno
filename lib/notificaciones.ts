import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from './supabase'
import { reportError } from './reporting'

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
    // Esperado en Expo Go / simulador / sin permiso. No es un error fatal:
    // no se reporta, solo se loguea en desarrollo.
    if (__DEV__) console.log('[push] no disponible:', (e as Error)?.message)
    return null
  }
}

/**
 * Programa recordatorios LOCALES para las próximas citas del cliente (T-24h y
 * T-2h). No necesita servidor ni push remoto: los agenda el propio dispositivo.
 * Reemplaza los programados anteriores en cada llamada. Nunca lanza.
 */
export async function programarRecordatoriosCitas(
  citas: { fecha: string; hora_inicio: string; servicio?: string }[],
): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync()
    const ahora = Date.now()
    for (const c of citas) {
      const inicio = new Date(`${c.fecha}T${c.hora_inicio}`).getTime()
      if (isNaN(inicio)) continue
      for (const [mins, txt] of [[1440, 'mañana'], [120, 'en 2 horas']] as const) {
        const cuando = inicio - mins * 60000
        if (cuando <= ahora + 60000) continue   // ya pasó o demasiado cerca
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Recordatorio de cita',
            body: `Tu cita es ${txt}${c.servicio ? `: ${c.servicio}` : ''}.`,
            data: { tipo: 'cita' },
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(cuando) },
        })
      }
    }
  } catch (e) {
    if (__DEV__) console.log('[recordatorios] no disponible:', (e as Error)?.message)
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
    reportError(e, { where: 'enviarPush', usuarioId })
  }
}
