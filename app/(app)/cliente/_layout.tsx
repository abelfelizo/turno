import { Tabs } from 'expo-router'
import { iconoTab as ic, useOpcionesTabs } from '../../../components/tabs'

export default function ClienteLayout() {
  return (
    <Tabs screenOptions={useOpcionesTabs()}>
      <Tabs.Screen name="home" options={{ tabBarLabel: 'Inicio', tabBarIcon: ic('home-outline') }} />
      <Tabs.Screen name="turno" options={{ tabBarLabel: 'Mi turno', tabBarIcon: ic('time-outline') }} />
      <Tabs.Screen name="historial" options={{ tabBarLabel: 'Historial', tabBarIcon: ic('receipt-outline') }} />
      <Tabs.Screen name="perfil" options={{ tabBarLabel: 'Perfil', tabBarIcon: ic('person-outline') }} />
      <Tabs.Screen name="agendar" options={{ href: null }} />
      <Tabs.Screen name="preferencias" options={{ href: null }} />
      <Tabs.Screen name="buscar-barbero" options={{ href: null }} />
    </Tabs>
  )
}
