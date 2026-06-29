import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, TextInputProps } from 'react-native'
import { ReactNode } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS } from '../constants'
import { Display } from './ui'

export function OnbScreen({ titulo, subtitulo, children, paso }: { titulo: string; subtitulo?: string; children: ReactNode; paso?: string }) {
  const router = useRouter()
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: COLORS.carbon }}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={s.back} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        {paso ? <Text style={s.paso}>{paso}</Text> : null}
        <Display size={30} color="#fff">{titulo}</Display>
        {subtitulo ? <Text style={s.subtitulo}>{subtitulo}</Text> : null}
        <View style={{ height: 24 }} />
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

export function Opcion({ label, desc, seleccionado, onPress }: { label: string; desc?: string; emoji?: string; seleccionado?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.opcion, seleccionado && s.opcionSel]} onPress={onPress} activeOpacity={0.8}>
      <View style={{ flex: 1 }}>
        <Text style={[s.opcionLabel, seleccionado && { color: '#fff' }]}>{label}</Text>
        {desc ? <Text style={[s.opcionDesc, seleccionado && { color: 'rgba(255,255,255,0.85)' }]}>{desc}</Text> : null}
      </View>
      {seleccionado ? <Ionicons name="checkmark-circle" size={22} color="#fff" /> : null}
    </TouchableOpacity>
  )
}

export function Campo({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.campoLabel}>{label}</Text>
      <TextInput style={s.input} placeholderTextColor="rgba(255,255,255,0.3)" {...props} />
    </View>
  )
}

export function BotonPrimario({ texto, onPress, cargando, disabled }: { texto: string; onPress: () => void; cargando?: boolean; disabled?: boolean }) {
  return (
    <TouchableOpacity style={[s.btn, (disabled || cargando) && { opacity: 0.45 }]} onPress={onPress} disabled={disabled || cargando}>
      {cargando ? <ActivityIndicator color="#fff" /> : <Text style={s.btnT}>{texto}</Text>}
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  scroll: { padding: 28, paddingTop: 64, flexGrow: 1 },
  back: { width: 38, height: 38, borderRadius: 11, backgroundColor: COLORS.carbonEl, borderWidth: 1, borderColor: COLORS.carbonBorder, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  paso: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.red, letterSpacing: 1.5, marginBottom: 10, textTransform: 'uppercase' },
  subtitulo: { fontFamily: FONTS.regular, fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 20, marginTop: 8 },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: COLORS.carbonEl, borderWidth: 1.5, borderColor: COLORS.carbonBorder, borderRadius: 16, padding: 18, marginBottom: 12 },
  opcionSel: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  opcionLabel: { fontFamily: FONTS.bold, fontSize: 16, color: '#fff' },
  opcionDesc: { fontFamily: FONTS.medium, fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 3, lineHeight: 18 },
  campoLabel: { fontFamily: FONTS.semibold, fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 7 },
  input: { backgroundColor: COLORS.carbonEl, borderWidth: 1, borderColor: COLORS.carbonBorder, borderRadius: 14, padding: 16, color: '#fff', fontSize: 16, fontFamily: FONTS.medium },
  btn: { backgroundColor: COLORS.red, borderRadius: 14, padding: 17, alignItems: 'center', marginTop: 8 },
  btnT: { fontFamily: FONTS.bold, fontSize: 16, color: '#fff' },
})
