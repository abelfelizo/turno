import { Tabs } from 'expo-router'
import { COLORS } from '../../../constants'
export default function ClienteLayout() {
  return (
    <Tabs screenOptions={{headerShown:false,tabBarActiveTintColor:COLORS.primary,tabBarInactiveTintColor:'#bbb',tabBarStyle:{height:64,paddingBottom:10,paddingTop:6},tabBarLabelStyle:{fontSize:10,fontWeight:'600'}}}>
      <Tabs.Screen name="home" options={{tabBarLabel:'Inicio'}}/>
      <Tabs.Screen name="turno" options={{tabBarLabel:'Mi turno'}}/>
      <Tabs.Screen name="historial" options={{tabBarLabel:'Historial'}}/>
      <Tabs.Screen name="perfil" options={{tabBarLabel:'Perfil'}}/>
    </Tabs>
  )
}
