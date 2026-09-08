import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { COLORS } from '../../../constants'

const ic = (name: keyof typeof Ionicons.glyphMap) =>
  ({ color, size }: { color: string; size: number }) => <Ionicons name={name} color={color} size={size} />

export default function DuenoLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false, tabBarActiveTintColor: COLORS.red, tabBarInactiveTintColor: COLORS.textLight,
      tabBarStyle: { height: 84, paddingBottom: 26, paddingTop: 8, borderTopColor: COLORS.border },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
    }}>
      <Tabs.Screen name="dashboard" options={{ tabBarLabel: 'Mi local', tabBarIcon: ic('storefront-outline') }} />
      {/* "Cola", no "Mi agenda": en este panel se ve el LOCAL. La agenda
          personal del dueño que atiende vive en el panel "Mi silla". */}
      <Tabs.Screen name="agenda" options={{ tabBarLabel: 'Cola', tabBarIcon: ic('people-outline') }} />
      <Tabs.Screen name="stats" options={{ tabBarLabel: 'Stats', tabBarIcon: ic('stats-chart-outline') }} />
      <Tabs.Screen name="config" options={{ tabBarLabel: 'Config', tabBarIcon: ic('settings-outline') }} />
    </Tabs>
  )
}
