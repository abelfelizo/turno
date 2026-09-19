/**
 * LAS CUATRO PESTAÑAS DEL CLIENTE.
 *
 * «Inicio» desapareció. No se renombró: dejó de existir. Era un vestíbulo que
 * resumía las otras cuatro pantallas —el estado del local, el turno, la
 * fidelidad, las últimas visitas— y obligaba a pasar por él para llegar a
 * cualquier sitio. Cinco cosas repetidas en dos lugares cada una.
 *
 * Ahora la app se llama Turno y abre en el turno. Es la propuesta de valor y
 * es lo que el cliente viene a ver:
 *
 *   MI TURNO      lo que tengo ahora y cómo está la barbería, en una tarjeta
 *   MI BARBERÍA   quién trabaja, qué cobra cada uno, mis recortes
 *   HISTORIAL     visitas, gasto y reseñas
 *   AJUSTES       mis preferencias y mi cuenta
 */
import { Tabs } from 'expo-router'
import { iconoTab as ic, useOpcionesTabs } from '../../../components/tabs'
import GuardaPanel from '../../../components/guarda-panel'

export default function ClienteLayout() {
  return (
    <GuardaPanel panel="cliente">
      <Tabs screenOptions={useOpcionesTabs()}>
        <Tabs.Screen name="turno" options={{ tabBarLabel: 'Mi turno', tabBarIcon: ic('time-outline') }} />
        <Tabs.Screen name="barberia" options={{ tabBarLabel: 'Mi barbería', tabBarIcon: ic('storefront-outline') }} />
        <Tabs.Screen name="historial" options={{ tabBarLabel: 'Historial', tabBarIcon: ic('receipt-outline') }} />
        <Tabs.Screen name="configuracion" options={{ tabBarLabel: 'Ajustes', tabBarIcon: ic('settings-outline') }} />

        {/* Fuera de la barra: se abren desde dentro. */}
        <Tabs.Screen name="agendar" options={{ href: null }} />
        <Tabs.Screen name="buscar-barbero" options={{ href: null }} />
      </Tabs>
    </GuardaPanel>
  )
}
