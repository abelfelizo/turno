import { useEffect } from 'react'
import { useRouter } from 'expo-router'
import { View, ActivityIndicator } from 'react-native'
import { getSesion } from '../lib/storage'
import { COLORS } from '../constants'

export default function Index() {
  const router = useRouter()
  useEffect(() => {
    getSesion().then(sesion => {
      if (!sesion) { router.replace('/(auth)/welcome'); return }
      if (sesion.rol === 'cliente') router.replace('/(app)/cliente/home')
      else if (sesion.rol === 'dueno') router.replace('/(app)/dueno/dashboard')
      else router.replace('/(app)/barbero/agenda')
    })
  }, [])
  return <View style={{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:COLORS.primary}}><ActivityIndicator color={COLORS.gold} size="large"/></View>
}
