import { Tabs } from 'expo-router'
import { COLORS } from '../../../constants'
export default function DuenoLayout() {
  return (
    <Tabs screenOptions={{headerShown:false,tabBarActiveTintColor:COLORS.primary,tabBarInactiveTintColor:'#bbb',tabBarStyle:{height:64,paddingBottom:10,paddingTop:6},tabBarLabelStyle:{fontSize:10,fontWeight:'600'}}}>
      <Tabs.Screen name="dashboard" options={{tabBarLabel:'Mi local'}}/>
      <Tabs.Screen name="agenda" options={{tabBarLabel:'Mi agenda'}}/>
      <Tabs.Screen name="stats" options={{tabBarLabel:'Stats'}}/>
      <Tabs.Screen name="config" options={{tabBarLabel:'Config'}}/>
    </Tabs>
  )
}
