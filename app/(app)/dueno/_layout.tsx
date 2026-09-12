import { Tabs } from 'expo-router'
import { iconoTab as ic, useOpcionesTabs } from '../../../components/tabs'

export default function DuenoLayout() {
  return (
    <Tabs screenOptions={useOpcionesTabs()}>
      <Tabs.Screen name="dashboard" options={{ tabBarLabel: 'Mi local', tabBarIcon: ic('storefront-outline') }} />
      {/* "Cola", no "Mi agenda": en este panel se ve el LOCAL. La agenda
          personal del dueño que atiende vive en el panel "Mi silla". */}
      <Tabs.Screen name="agenda" options={{ tabBarLabel: 'Cola', tabBarIcon: ic('people-outline') }} />
      <Tabs.Screen name="stats" options={{ tabBarLabel: 'Stats', tabBarIcon: ic('stats-chart-outline') }} />
      <Tabs.Screen name="config" options={{ tabBarLabel: 'Config', tabBarIcon: ic('settings-outline') }} />
      {/* Ficha de un barbero del equipo: se abre desde Mi local, no es pestaña. */}
      <Tabs.Screen name="barbero" options={{ href: null }} />
    </Tabs>
  )
}
