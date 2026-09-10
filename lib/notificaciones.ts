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

// ─────────────────────────────────────────────────────────────────────────────
// AVISOS CON NOMBRE
//
// Los push viajan de teléfono a teléfono: quien hace la acción avisa a quien le
// afecta. El cliente que entra a la fila avisa al barbero; el barbero que llama
// avisa al cliente. Este proyecto no tiene pg_net, así que la base no puede
// llamar a nadie por su cuenta — cualquier aviso tiene que salir de una app que
// esté haciendo algo en ese momento.
//
// Están todos aquí y no repartidos por las pantallas para que el texto que lee
// el barbero a las 8 de la mañana se pueda revisar de un vistazo.
// ─────────────────────────────────────────────────────────────────────────────

/** El barbero no se enteraba de nada de su propio trabajo: tenía que estar
 *  mirando la app para saber que había gente esperando. */
export const avisos = {
  barberoNuevoEnFila: (barberoUsuarioId: string, cliente: string, servicio?: string) =>
    enviarPush(barberoUsuarioId, 'Alguien entró a tu fila',
      `${cliente}${servicio ? ` · ${servicio}` : ''}`, { tipo: 'agenda' }),

  barberoNuevaCita: (barberoUsuarioId: string, cliente: string, cuando: string) =>
    enviarPush(barberoUsuarioId, 'Nueva cita', `${cliente} reservó para ${cuando}.`, { tipo: 'agenda' }),

  barberoCitaCancelada: (barberoUsuarioId: string, cliente: string, cuando: string) =>
    enviarPush(barberoUsuarioId, 'Cita cancelada', `${cliente} canceló la de ${cuando}.`, { tipo: 'agenda' }),

  barberoVaEnCamino: (barberoUsuarioId: string, cliente: string) =>
    enviarPush(barberoUsuarioId, 'Va en camino', `${cliente} salió para allá.`, { tipo: 'agenda' }),

  /**
   * TU TURNO. El aviso del momento en que le toca, con el reloj ya corriendo:
   * turno_llamar_siguiente pone `expira_at = now() + ventana_llegada_min`, así
   * que el minuto en que sale este push es el minuto en que empieza la cuenta
   * atrás. Decir cuántos minutos tiene es la diferencia entre un aviso y una
   * instrucción — sin el número, "es tu turno" no le dice a nadie si puede
   * terminarse el café.
   */
  clienteTuTurno: (clienteId: string, local: string, minutos: number) =>
    enviarPush(clienteId, '¡Es tu turno! 💈',
      `Te esperan en ${local}. Tienes ${minutos} min para llegar — contesta si vas en camino o ya estás allí.`,
      { tipo: 'turno' }),

  /** El cliente contestó que ya está en la puerta: el barbero deja de esperar. */
  barberoYaLlego: (barberoUsuarioId: string, cliente: string) =>
    enviarPush(barberoUsuarioId, 'Ya está aquí', `${cliente} dice que ya llegó al local.`, { tipo: 'agenda' }),

  /** R2 lo especificaba desde el principio y no estaba construido. */
  clientePrepararse: (clienteId: string, local: string, delante: number) =>
    enviarPush(clienteId, 'Prepárate, casi te toca',
      delante === 0 ? `Eres el siguiente en ${local}.` : `Quedan ${delante} delante de ti en ${local}.`,
      { tipo: 'turno' }),

  clienteCitaCancelada: (clienteId: string, local: string, cuando: string) =>
    enviarPush(clienteId, 'Se canceló tu cita', `${local} canceló la de ${cuando}.`, { tipo: 'cita' }),

  clientePremio: (clienteId: string, premio: string, local: string) =>
    enviarPush(clienteId, '¡Ganaste tu premio! 🎁',
      `${premio} en ${local}. Pídelo en tu próxima visita.`, { tipo: 'premio' }),

  duenoSolicitud: (duenoUsuarioId: string, quien: string, local: string) =>
    enviarPush(duenoUsuarioId, 'Un barbero quiere unirse',
      `${quien} pidió entrar a ${local}. Apruébalo desde tu panel.`, { tipo: 'equipo' }),

  /**
   * El tiempo de espera se movió. No es una disculpa ni una promesa nueva: es la
   * obligación de decírselo. Quien salió a hacer algo con "unos 40 minutos" en
   * la cabeza necesita saber que ahora son 10 — y quien iba a esperar de pie
   * agradece saber que puede irse.
   */
  clienteEsperaCambio(clienteId: string, local: string, minutos: number, seAdelanto: boolean) {
    return enviarPush(clienteId,
      seAdelanto ? 'Tu turno se adelantó' : 'Tu turno se movió',
      minutos <= 5
        ? `Ya casi te toca en ${local}. Acércate.`
        : `Ahora te faltan unos ${minutos} min en ${local}.`,
      { tipo: 'turno' })
  },
}
