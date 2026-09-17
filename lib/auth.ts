/**
 * AUTH - Supabase Auth para Turno.
 * Estrategia V1: magic link por código OTP de email (sin deep-link, ideal móvil).
 * Para WhatsApp/SMS OTP: configurar un proveedor de teléfono en Supabase Auth
 * y reemplazar enviarCodigo/verificarCodigo por signInWithOtp({ phone })
 * y verifyOtp({ phone, token, type: 'sms' }).
 */
import { supabase } from './supabase'
import type { Session } from '@supabase/supabase-js'

export async function getAuthSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession()
  return data.session
}

/** Envía un código de 6 dígitos al email (crea la cuenta si no existe). */
export async function enviarCodigo(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true },
  })
  if (error) throw error
}

/** Verifica el código y abre sesión. */
export async function verificarCodigo(email: string, token: string): Promise<Session> {
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: 'email',
  })
  if (error) throw error
  if (!data.session) throw new Error('No se pudo iniciar sesión')
  return data.session
}

/**
 * Entrar con contraseña. Hoy SOLO lo usa la puerta de pruebas (`lib/pruebas.ts`),
 * que existe mientras se corrige la parte interna de la app.
 *
 * No es una vía paralela ni un atajo: abre una sesión normal de Supabase, así
 * que `auth.uid()` es real y el servidor aplica exactamente las mismas reglas
 * que a cualquiera. Lo que se salta es el correo y el código, no los porteros.
 *
 * El alta de verdad sigue siendo por OTP; esto no se ofrece en ninguna pantalla
 * que pueda ver un usuario real.
 */
export async function entrarConClave(email: string, clave: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(), password: clave,
  })
  if (error) throw error
  if (!data.session) throw new Error('No se pudo iniciar sesión')
  return data.session
}

export async function cerrarSesion() {
  await supabase.auth.signOut()
}

export function onAuthChange(cb: (session: Session | null) => void) {
  return supabase.auth.onAuthStateChange((_e, session) => cb(session))
}
