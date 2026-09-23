/**
 * LAS CINCO PESTAÑAS DE LA BARBERÍA (docs/TABLEROS-BARBERIA.md, 23 sep).
 *
 *   MI LOCAL       solo hoy: las sillas, la fila y lo que pide atención. Sin dinero.
 *   EQUIPO         solicitudes, quién trabaja aquí, invitar, sus fichas.
 *   CLIENTES       la cartera del local.
 *   ESTADÍSTICAS   el dinero vive aquí y solo aquí (antes «Stats»).
 *   AJUSTES        marca, código, cómo trabaja el local, suscripción, cuenta.
 *
 * La misma forma que el panel del barbero, para que quien tiene los dos no
 * aprenda dos apps. La pestaña «Cola» se fue: enseñaba la misma fila que Mi
 * local con otra mitad de las acciones.
 */
import { useEffect, useState } from 'react'
import { Tabs, usePathname } from 'expo-router'
import { iconoTab as ic, useOpcionesTabs } from '../../../components/tabs'
import GuardaPanel from '../../../components/guarda-panel'
import { getSesion, alCambiarSesion } from '../../../lib/storage'

const PESTANAS = ['dashboard', 'equipo', 'clientes', 'stats', 'config']

export default function DuenoLayout() {
  const opciones = useOpcionesTabs()

  // UN LOCAL, UN PANEL — igual que en el del barbero. Quien administra dos
  // locales cambia desde el distintivo de arriba, y las pestañas no se
  // desmontan: la `key` es el local, así que al cambiar se rehacen las cinco.
  const [local, setLocal] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let vivo = true
    getSesion().then(ss => { if (vivo) setLocal(ss?.negocio_id ?? null) })
    const soltar = alCambiarSesion(ss => { if (ss?.negocio_id) setLocal(ss.negocio_id) })
    return () => { vivo = false; soltar() }
  }, [])

  const ruta = usePathname()
  const ultima = ruta.split('/').filter(Boolean).pop() ?? ''
  const inicial = PESTANAS.includes(ultima) ? ultima : 'dashboard'

  if (local === undefined) return <GuardaPanel panel="barberia">{null}</GuardaPanel>

  return (
    <GuardaPanel panel="barberia">
      <Tabs key={local ?? 'sin-local'} initialRouteName={inicial} screenOptions={opciones}>
        <Tabs.Screen name="dashboard" options={{ tabBarLabel: 'Mi local', tabBarIcon: ic('storefront-outline') }} />
        <Tabs.Screen name="equipo" options={{ tabBarLabel: 'Equipo', tabBarIcon: ic('people-outline') }} />
        <Tabs.Screen name="clientes" options={{ tabBarLabel: 'Clientes', tabBarIcon: ic('person-outline') }} />
        <Tabs.Screen name="stats" options={{ tabBarLabel: 'Estadísticas', tabBarIcon: ic('stats-chart-outline') }} />
        <Tabs.Screen name="config" options={{ tabBarLabel: 'Ajustes', tabBarIcon: ic('settings-outline') }} />
        {/* La ficha de una silla: se abre desde Mi local o Equipo, no es pestaña. */}
        <Tabs.Screen name="barbero" options={{ href: null }} />
      </Tabs>
    </GuardaPanel>
  )
}
