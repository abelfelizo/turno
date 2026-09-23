import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTabOptions } from '../../../components/ui'

const ic = (name: keyof typeof Ionicons.glyphMap) =>
  ({ color }: { color: string }) => <Ionicons name={name} color={color} size={24} />

export default function ClienteLayout() {
  const opts = useTabOptions()
  return (
    <Tabs screenOptions={opts}>
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
