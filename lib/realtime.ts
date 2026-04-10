/**
 * REALTIME - Supabase subscriptions para Turno
 * Cola y estado de barberos en tiempo real
 */
import { supabase } from './supabase'

const T = (tabla: string) => `turno_${tabla}`

export function suscribirCola(negocio_id: string, callback: (payload: any) => void) {
  return supabase
    .channel(`cola_${negocio_id}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: T('cola'),
      filter: `negocio_id=eq.${negocio_id}`,
    }, callback)
    .subscribe()
}

export function suscribirCitas(perfil_id: string, fecha: string, callback: (payload: any) => void) {
  return supabase
    .channel(`citas_${perfil_id}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: T('citas'),
      filter: `perfil_id=eq.${perfil_id}`,
    }, callback)
    .subscribe()
}

export function suscribirEstadoPerfil(negocio_id: string, callback: (payload: any) => void) {
  return supabase
    .channel(`perfiles_${negocio_id}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: T('perfiles'),
      filter: `negocio_id=eq.${negocio_id}`,
    }, callback)
    .subscribe()
}

export function desuscribir(channel: any) {
  supabase.removeChannel(channel)
}
