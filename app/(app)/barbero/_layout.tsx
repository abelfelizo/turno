/**
 * LAS CINCO PESTAÑAS DEL BARBERO (decisión del 22 sep).
 *
 *   MI SILLA       solo hoy: la tarjeta, la fila, lo que queda. Sin dinero.
 *   AGENDA         el calendario: otros días, bloqueos, jornada.
 *   CLIENTES       fichas, notas, a quién recuperar.
 *   ESTADÍSTICAS   el dinero vive aquí y solo aquí (antes «Stats»).
 *   AJUSTES        servicios, horario, suscripción, cuenta.
 *
 * Mi silla va primero porque es lo que se mira con la capa puesta. La agenda
 * de antes mezclaba las dos cosas en una pantalla; ver docs/TABLEROS-BARBERO.md.
 */
import { useEffect, useState } from 'react'
import { Tabs, usePathname } from 'expo-router'
import { iconoTab as ic, useOpcionesTabs } from '../../../components/tabs'
import { capaGlass } from '../../../components/fondo-glass'
import GuardaPanel from '../../../components/guarda-panel'
import { getSesion, alCambiarSesion } from '../../../lib/storage'

const PESTANAS = ['silla', 'agenda', 'clientes', 'stats', 'config']

export default function BarberoLayout() {
  const opciones = useOpcionesTabs()

  /**
   * UN LOCAL, UN PANEL — lo mismo que en el del cliente. Quien trabaja en
   * dos sitios cambia de local desde la cabecera de Mi silla, y las pestañas
   * de expo-router no se desmontan: sin esto la agenda o los clientes seguían
   * enseñando el local de antes hasta tocarlos. La `key` es el perfil (una
   * silla en un local), así que al cambiar se rehacen las cinco a la vez.
   */
  const [silla, setSilla] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let vivo = true
    getSesion().then(ss => { if (vivo) setSilla(ss?.perfil_id ?? ss?.negocio_id ?? null) })
    // Cerrar sesión avisa con null: no se rehace nada para irse al login.
    const soltar = alCambiarSesion(ss => { if (ss?.perfil_id) setSilla(ss.perfil_id) })
    return () => { vivo = false; soltar() }
  }, [])

  const ruta = usePathname()
  const ultima = ruta.split('/').filter(Boolean).pop() ?? ''
  const inicial = PESTANAS.includes(ultima) ? ultima : 'silla'

  if (silla === undefined) return <GuardaPanel panel="silla">{null}</GuardaPanel>

  return (
    <GuardaPanel panel="silla">
      <Tabs screenLayout={capaGlass} key={silla ?? 'sin-silla'} initialRouteName={inicial} screenOptions={opciones}>
        <Tabs.Screen name="silla" options={{ tabBarLabel: 'Mi silla', tabBarIcon: ic('cut-outline') }} />
        <Tabs.Screen name="agenda" options={{ tabBarLabel: 'Agenda', tabBarIcon: ic('calendar-outline') }} />
        <Tabs.Screen name="clientes" options={{ tabBarLabel: 'Clientes', tabBarIcon: ic('people-outline') }} />
        <Tabs.Screen name="stats" options={{ tabBarLabel: 'Estadísticas', tabBarIcon: ic('stats-chart-outline') }} />
        <Tabs.Screen name="config" options={{ tabBarLabel: 'Ajustes', tabBarIcon: ic('settings-outline') }} />
      </Tabs>
    </GuardaPanel>
  )
}
