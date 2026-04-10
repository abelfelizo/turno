import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { COLORS } from '../../constants'

export default function Welcome() {
  const router = useRouter()
  return (
    <View style={s.c}>
      <View style={s.logo}><Text style={{fontSize:52}}>✂️</Text></View>
      <Text style={s.title}>Turno</Text>
      <Text style={s.sub}>Tu barberia, organizada</Text>
      <TouchableOpacity style={s.btn} onPress={() => router.push('/(auth)/negocio-tipo')}>
        <Text style={s.btnT}>Tengo una barberia</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.btn2} onPress={() => router.push('/(auth)/barbero-tipo')}>
        <Text style={s.btn2T}>Trabajo en una barberia</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.btn2} onPress={() => router.push('/(auth)/cliente-codigo')}>
        <Text style={s.btn2T}>Soy cliente</Text>
      </TouchableOpacity>
    </View>
  )
}
const s = StyleSheet.create({
  c:{flex:1,backgroundColor:COLORS.primary,alignItems:'center',justifyContent:'center',padding:32},
  logo:{width:100,height:100,borderRadius:28,backgroundColor:'rgba(255,255,255,0.08)',alignItems:'center',justifyContent:'center',marginBottom:20},
  title:{fontSize:42,fontWeight:'800',color:COLORS.gold,marginBottom:6},
  sub:{fontSize:14,color:'rgba(255,255,255,0.4)',marginBottom:48},
  btn:{width:'100%',padding:16,backgroundColor:COLORS.gold,borderRadius:14,alignItems:'center',marginBottom:10},
  btnT:{fontSize:15,fontWeight:'700',color:COLORS.primary},
  btn2:{width:'100%',padding:14,backgroundColor:'rgba(255,255,255,0.08)',borderRadius:14,alignItems:'center',borderWidth:1.5,borderColor:'rgba(255,255,255,0.15)',marginBottom:10},
  btn2T:{fontSize:15,color:'rgba(255,255,255,0.8)'},
})
