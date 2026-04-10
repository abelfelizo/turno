import { View, Text } from 'react-native'
import { COLORS } from '../../../constants'
export default function Screen() {
  return <View style={{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:COLORS.bg}}>
    <Text style={{fontSize:24,fontWeight:'800',color:COLORS.primary,textTransform:'capitalize'}}>home</Text>
    <Text style={{fontSize:13,color:'#999',marginTop:8}}>Próximamente</Text>
  </View>
}
