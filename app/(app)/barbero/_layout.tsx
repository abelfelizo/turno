import { Tabs } from 'expo-router'
import { iconoTab as ic, useOpcionesTabs } from '../../../components/tabs'

export default function BarberoLayout() {
  return (
    <Tabs screenOptions={useOpcionesTabs()}>
      <Tabs.Screen name="agenda" options={{ tabBarLabel: 'Agenda', tabBarIcon: ic('calendar-outline') }} />
      <Tabs.Screen name="stats" options={{ tabBarLabel: 'Stats', tabBarIcon: ic('stats-chart-outline') }} />
      <Tabs.Screen name="clientes" options={{ tabBarLabel: 'Clientes', tabBarIcon: ic('people-outline') }} />
      <Tabs.Screen name="config" options={{ tabBarLabel: 'Config', tabBarIcon: ic('settings-outline') }} />
    </Tabs>
  )
}
