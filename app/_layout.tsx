import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { View, ActivityIndicator } from 'react-native'
import { useFonts, Anton_400Regular } from '@expo-google-fonts/anton'
import {
  PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans'
import { COLORS } from '../constants'

export default function RootLayout() {
  const [loaded] = useFonts({
    Anton_400Regular,
    PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
  })
  if (!loaded) return <View style={{ flex: 1, backgroundColor: COLORS.carbon, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={COLORS.red} size="large" /></View>
  return (<><StatusBar style="light" /><Stack screenOptions={{ headerShown: false }} /></>)
}
