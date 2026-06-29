import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { COLORS } from '../../../constants'

const ic = (name: keyof typeof Ionicons.glyphMap) =>
  ({ color, size }: { color: string; size: number }) => <Ionicons name={name} color={color} size={size} />

export default function ClienteLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false, tabBarActiveTintColor: COLORS.red, tabBarInactiveTintColor: COLORS.textLight,
      tabBarStyle: { height: 84, paddingBottom: 26, paddingTop: 8, borderTopColor: COLORS.border },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
    }}>
      <Tabs.Screen name="home" options={{ tabBarLabel: 'Inicio', tabBarIcon: ic('home-outline') }} />
      <Tabs.Screen name="turno" options={{ tabBarLabel: 'Mi turno', tabBarIcon: ic('time-outline') }} />
      <Tabs.Screen name="historial" options={{ tabBarLabel: 'Historial', tabBarIcon: ic('receipt-outline') }} />
      <Tabs.Screen name="perfil" options={{ tabBarLabel: 'Perfil', tabBarIcon: ic('person-outline') }} />
      <Tabs.Screen name="agendar" options={{ href: null }} />
      <Tabs.Screen name="preferencias" options={{ href: null }} />
    </Tabs>
  )
}
