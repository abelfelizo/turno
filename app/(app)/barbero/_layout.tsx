import { Tabs } from 'expo-router'
import { COLORS } from '../../../constants'
export default function BarberoLayout() {
  return (
    <Tabs screenOptions={{headerShown:false,tabBarActiveTintColor:COLORS.primary,tabBarInactiveTintColor:'#bbb',tabBarStyle:{height:64,paddingBottom:10,paddingTop:6},tabBarLabelStyle:{fontSize:10,fontWeight:'600'}}}>
      <Tabs.Screen name="agenda" options={{tabBarLabel:'Agenda'}}/>
      <Tabs.Screen name="stats" options={{tabBarLabel:'Stats'}}/>
      <Tabs.Screen name="clientes" options={{tabBarLabel:'Clientes'}}/>
      <Tabs.Screen name="config" options={{tabBarLabel:'Config'}}/>
    </Tabs>
  )
}
