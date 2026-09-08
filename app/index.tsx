import { useEffect } from 'react'
import { useRouter } from 'expo-router'
import { View, ActivityIndicator } from 'react-native'
import { getAuthSession } from '../lib/auth'
import { getMiUsuario, getMisMembresias, getMiPerfil } from '../lib/db'
import { guardarSesion, limpiarSesion, getSesion } from '../lib/storage'
import { registrarPush } from '../lib/notificaciones'
import { COLORS } from '../constants'
import type { RolUsuario, PanelActivo } from '../types'

export default function Index() {
  const router = useRouter()

  useEffect(() => {
    (async () => {
      // 1) ¿Hay sesión de Supabase Auth?
      const session = await getAuthSession()
      if (!session) { router.replace('/(auth)/login'); return }

      // 2) ¿El usuario ya completó su registro en turno_usuarios?
      const usuario = await getMiUsuario()
      if (!usuario) { router.replace('/(auth)/welcome'); return }

      // 3) Resolver rol/negocio desde membresías
      const membresias = await getMisMembresias(usuario.id)
      if (membresias.length === 0) {
        // Registrado pero sin negocio: continuar onboarding
        await limpiarSesion()
        router.replace('/(auth)/welcome')
        return
      }
      // Se respeta el panel que el usuario eligió con <CambiarRol />; si no hay
      // ninguno guardado, se prefiere el de dueño.
      const previa = await getSesion()
      const m = membresias.find((x: any) => x.negocio_id === previa?.negocio_id)
        ?? membresias.find((x: any) => x.rol === 'dueno') ?? membresias[0]
      const rol = m.rol as RolUsuario
      let perfil_id: string | undefined
      if (rol !== 'cliente') {
        const perfil = await getMiPerfil(usuario.id, m.negocio_id).catch(() => null)
        perfil_id = perfil?.id
        // Barbero aún no aprobado por el dueño → pantalla de espera
        if ((rol === 'empleado' || rol === 'barbero_renta') && perfil && !perfil.aprobado) {
          router.replace('/(auth)/barbero-pendiente'); return
        }
      }
      // Panel: se conserva el elegido si sigue siendo posible. Un dueño que
      // atiende puede estar en "silla" aunque su rol siga siendo 'dueno'.
      let panel: PanelActivo = rol === 'cliente' ? 'cliente' : rol === 'dueno' ? 'barberia' : 'silla'
      if (previa?.panel === 'silla' && perfil_id) panel = 'silla'
      else if (previa?.panel === 'barberia' && rol === 'dueno') panel = 'barberia'

      await guardarSesion({ usuario_id: usuario.id, negocio_id: m.negocio_id, perfil_id, rol, panel })
      registrarPush() // fire-and-forget: registra/actualiza el token push del usuario

      if (panel === 'cliente') router.replace('/(app)/cliente/home')
      else if (panel === 'barberia') router.replace('/(app)/dueno/dashboard')
      else router.replace('/(app)/barbero/agenda')
    })().catch(() => router.replace('/(auth)/login'))
  }, [])

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.primary }}>
      <ActivityIndicator color={COLORS.gold} size="large" />
    </View>
  )
}
