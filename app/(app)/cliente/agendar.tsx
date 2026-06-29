import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { useEffect, useState } from 'react'
import { useRouter, Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getSesion } from '../../../lib/storage'
import { getPerfilesNegocio, slotsDisponibles, agendarCita } from '../../../lib/db'
import { COLORS, FONTS } from '../../../constants'
import { hora12 } from '../../../lib/format'
import { Display, Chip } from '../../../components/ui'

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
function proximosDias(n: number) {
  const out: { fecha: string; dia: string; num: number }[] = []
  for (let i = 0; i < n; i++) { const d = new Date(); d.setDate(d.getDate() + i); out.push({ fecha: d.toISOString().split('T')[0], dia: DIAS[d.getDay()], num: d.getDate() }) }
  return out
}

export default function Agendar() {
  const router = useRouter()
  const [perfiles, setPerfiles] = useState<any[]>([])
  const [negocio, setNegocio] = useState<any>(null)
  const [perfil, setPerfil] = useState<any>(null)
  const [servicio, setServicio] = useState<any>(null)
  const [fecha, setFecha] = useState('')
  const [slots, setSlots] = useState<string[]>([])
  const [hora, setHora] = useState('')
  const [loading, setLoading] = useState(true)
  const [cargandoSlots, setCargandoSlots] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const dias = proximosDias(14)

  useEffect(() => {
    (async () => {
      const ss = await getSesion()
      if (ss?.negocio_id) { const ps = await getPerfilesNegocio(ss.negocio_id) as any[]; setPerfiles(ps) }
      setLoading(false)
    })()
  }, [])

  useEffect(() => {
    if (!perfil || !servicio || !fecha) { setSlots([]); return }
    setCargandoSlots(true); setHora('')
    slotsDisponibles(perfil.id, fecha, servicio.id).then(x => setSlots(x.map(t => t.slice(0, 5)))).catch(() => setSlots([])).finally(() => setCargandoSlots(false))
  }, [perfil, servicio, fecha])

  async function confirmar() {
    if (!perfil || !servicio || !fecha || !hora) return
    setEnviando(true)
    try {
      await agendarCita(perfil.id, servicio.id, fecha, hora)
      Alert.alert('Cita agendada', `${servicio.nombre} el ${fecha} a las ${hora12(hora)}.`, [{ text: 'Listo', onPress: () => router.replace('/(app)/cliente/home') }])
    } catch (e: any) { Alert.alert('No se pudo agendar', e.message ?? 'Intenta otro horario.') }
    finally { setEnviando(false) }
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>

  return (
    <View style={s.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}><Ionicons name="chevron-back" size={22} color={COLORS.ink} /></TouchableOpacity>
        <Display size={24}>Reservar</Display>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {/* resumen del servicio elegido (carbón) */}
        {servicio && (
          <View style={s.mini}>
            <View style={s.miniIcon}><Ionicons name="cut" size={20} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.miniName}>{servicio.nombre}</Text>
              <Text style={s.miniMeta}>con {perfil?.turno_usuarios?.nombre ?? '—'} · {servicio.duracion_min} min</Text>
            </View>
            <Text style={s.miniPrice}>{servicio.precio}</Text>
          </View>
        )}

        <Text style={s.sec}>1 · BARBERO</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 22 }} contentContainerStyle={{ gap: 8 }}>
          {perfiles.map((p: any) => {
            const on = perfil?.id === p.id
            return (
              <TouchableOpacity key={p.id} style={[s.bChip, on && s.bChipOn]} onPress={() => { setPerfil(p); setServicio(null); setFecha(''); setHora('') }}>
                <Text style={[s.bChipT, on && { color: '#fff' }]}>{p.turno_usuarios?.nombre ?? 'Barbero'}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {perfil && (
          <>
            <Text style={s.sec}>2 · SERVICIO</Text>
            {(perfil.turno_servicios ?? []).filter((sv: any) => sv.activo).map((sv: any) => {
              const on = servicio?.id === sv.id
              return (
                <TouchableOpacity key={sv.id} style={[s.serv, on && s.servOn]} onPress={() => { setServicio(sv); setFecha(''); setHora('') }}>
                  <View><Text style={s.servName}>{sv.nombre}</Text><Text style={s.servMeta}>{sv.duracion_min} min</Text></View>
                  <Text style={s.servPrice}>{sv.precio}</Text>
                </TouchableOpacity>
              )
            })}
          </>
        )}

        {servicio && (
          <>
            <Text style={[s.sec, { marginTop: 22 }]}>3 · DÍA</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {dias.map(d => {
                const on = fecha === d.fecha
                return (
                  <TouchableOpacity key={d.fecha} style={[s.dia, on && s.diaOn]} onPress={() => setFecha(d.fecha)}>
                    <Text style={[s.diaTxt, on && { color: 'rgba(255,255,255,0.85)' }]}>{d.dia}</Text>
                    <Text style={[s.diaNum, on && { color: '#fff' }]}>{d.num}</Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </>
        )}

        {fecha && (
          <>
            <Text style={[s.sec, { marginTop: 22 }]}>4 · HORA</Text>
            {cargandoSlots ? <ActivityIndicator color={COLORS.red} style={{ marginVertical: 16 }} /> :
              slots.length === 0 ? <Text style={s.empty}>No hay horarios disponibles ese día.</Text> :
                <View style={s.slots}>
                  {slots.map(t => (
                    <View key={t} style={{ width: '31%' }}>
                      <Chip tone="blue" selected={hora === t} onPress={() => setHora(t)}>{hora12(t)}</Chip>
                    </View>
                  ))}
                </View>}
          </>
        )}
      </ScrollView>

      {hora ? (
        <View style={s.ctaWrap}>
          <TouchableOpacity style={s.cta} onPress={confirmar} disabled={enviando}>
            {enviando ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaT}>Confirmar cita · {hora12(hora)}</Text>}
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12 },
  back: { width: 36, height: 36, borderRadius: 11, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  mini: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.carbon, borderRadius: 16, padding: 14, marginBottom: 20 },
  miniIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center' },
  miniName: { fontFamily: FONTS.bold, fontSize: 14, color: '#fff' },
  miniMeta: { fontFamily: FONTS.medium, fontSize: 12, color: '#9A9CA6', marginTop: 2 },
  miniPrice: { fontFamily: FONTS.display, fontSize: 20, color: '#fff' },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginBottom: 12 },
  bChip: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  bChipOn: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  bChipT: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.ink },
  serv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, padding: 14, marginBottom: 8 },
  servOn: { borderColor: COLORS.red, backgroundColor: COLORS.redLight },
  servName: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  servMeta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  servPrice: { fontFamily: FONTS.display, fontSize: 22, color: COLORS.ink },
  dia: { width: 58, height: 66, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  diaOn: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  diaTxt: { fontFamily: FONTS.semibold, fontSize: 12, color: COLORS.textLight },
  diaNum: { fontFamily: FONTS.extrabold, fontSize: 20, color: COLORS.ink, marginTop: 2 },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  empty: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, paddingVertical: 16 },
  ctaWrap: { padding: 16, paddingBottom: 28, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.bg },
  cta: { backgroundColor: COLORS.red, borderRadius: 14, padding: 17, alignItems: 'center' },
  ctaT: { fontFamily: FONTS.bold, fontSize: 16, color: '#fff' },
})
