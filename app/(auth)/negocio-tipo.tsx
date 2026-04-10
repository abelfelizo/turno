import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { COLORS } from '../../constants'

/**
 * TODO: Implementar pantalla de onboarding: negocio-tipo
 * Ver documento Turno_Documento_Producto_v1.1 para flujo completo
 */
export default function Screen() {
  const router = useRouter()
  return (
    <View style={s.c}>
      <Text style={s.t}>negocio-tipo</Text>
      <Text style={s.s}>Pantalla pendiente de implementación</Text>
      <TouchableOpacity style={s.btn} onPress={() => router.back()}>
        <Text style={s.btnT}>← Volver</Text>
      </TouchableOpacity>
    </View>
  )
}
const s = StyleSheet.create({
  c:{flex:1,backgroundColor:COLORS.primary,alignItems:'center',justifyContent:'center',padding:32},
  t:{fontSize:22,fontWeight:'800',color:COLORS.gold,marginBottom:8,textAlign:'center'},
  s:{fontSize:14,color:'rgba(255,255,255,0.4)',textAlign:'center',marginBottom:32},
  btn:{padding:14,backgroundColor:'rgba(255,255,255,0.1)',borderRadius:12},
  btnT:{color:'#fff',fontWeight:'600'},
})
