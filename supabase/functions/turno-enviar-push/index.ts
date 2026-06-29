import { createClient } from 'jsr:@supabase/supabase-js@2'

// Envía una notificación push a todos los tokens de un usuario vía Expo Push API.
// Body: { usuario_id: string, titulo: string, cuerpo: string, data?: object }
// verify_jwt = true: el llamador (app autenticada) debe pasar un JWT válido.
Deno.serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') {
      return json({ error: 'method not allowed' }, 405)
    }
    const { usuario_id, titulo, cuerpo, data } = await req.json()
    if (!usuario_id || !titulo) return json({ error: 'usuario_id y titulo requeridos' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: tokens, error } = await supabase
      .from('turno_push_tokens')
      .select('token')
      .eq('usuario_id', usuario_id)
    if (error) return json({ error: error.message }, 400)
    if (!tokens || tokens.length === 0) return json({ sent: 0, motivo: 'sin tokens' })

    const messages = tokens.map((t: { token: string }) => ({
      to: t.token,
      sound: 'default',
      title: titulo,
      body: cuerpo ?? '',
      data: data ?? {},
      priority: 'high',
      channelId: 'default',
    }))

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(messages),
    })
    const expo = await res.json()
    return json({ sent: messages.length, expo })
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
  })
}
