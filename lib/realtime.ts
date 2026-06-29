/**
 * REALTIME - Supabase subscriptions para Turno
 * Cola y estado de barberos en tiempo real
 */
import { supabase } from './supabase'

const T = (tabla: string) => `turno_${tabla}`

// Sufijo único por suscripción: evita el error "cannot add callbacks after
// subscribe()" cuando varias pantallas observan el mismo negocio/perfil.
const uniq = () => Math.random().toString(36).slice(2, 10)

export function suscribirCola(negocio_id: string, callback: (payload: any) => void) {
  return supabase
    .channel(`cola_${negocio_id}_${uniq()}`)
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
    .channel(`citas_${perfil_id}_${uniq()}`)
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
    .channel(`perfiles_${negocio_id}_${uniq()}`)
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
