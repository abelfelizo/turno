import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, RefreshControl } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { getSesion } from '../../../lib/storage'
import { getMiTurnoActivo, confirmarCamino, salirDeCola, etaCola } from '../../../lib/db'
import { suscribirCola, desuscribir } from '../../../lib/realtime'
import { COLORS, FONTS } from '../../../constants'
import { Display, KV } from '../../../components/ui'

export default function MiTurno() {
  const router = useRouter()
  const [turno, setTurno] = useState<any>(null)
  const [eta, setEta] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [accion, setAccion] = useState(false)

  const cargar = useCallback(async () => {
    const ss = await getSesion()
    if (!ss?.usuario_id || !ss?.negocio_id) { setLoading(false); return }
    const t = await getMiTurnoActivo(ss.usuario_id, ss.negocio_id)
    setTurno(t)
    setEta(t ? await etaCola(t.id).catch(() => null) : null)
    setLoading(false); setRefreshing(false)
  }, [])

  useEffect(() => {
    cargar()
    let sub: any
    getSesion().then(ss => { if (ss?.negocio_id) sub = suscribirCola(ss.negocio_id, () => cargar()) })
    return () => { if (sub) desuscribir(sub) }
  }, [cargar])

  async function voy() {
    if (!turno) return
    setAccion(true)
    try { await confirmarCamino(turno.id); await cargar() }
    catch (e: any) { Alert.alert('Error', e.message ?? 'Intenta de nuevo.') } finally { setAccion(false) }
  }
  function salir() {
    if (!turno) return
    Alert.alert('Salir de la cola', '¿Seguro que quieres cancelar tu turno?', [
      { text: 'No' },
      { text: 'Sí, salir', style: 'destructive', onPress: async () => {
        setAccion(true)
        try { await salirDeCola(turno.id); await cargar() }
        catch (e: any) { Alert.alert('Error', e.message ?? 'Intenta de nuevo.') } finally { setAccion(false) }
      } },
    ])
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>

  if (!turno) return (
    <View style={s.center}>
      <Text style={s.vacioT}>No tienes un turno activo</Text>
      <TouchableOpacity style={s.cta} onPress={() => router.push('/(app)/cliente/home')}><Text style={s.ctaT}>Pedir turno</Text></TouchableOpacity>
    </View>
  )

  const llamado = turno.estado === 'llamado'
  const enCamino = turno.estado === 'en_camino'
  const heroBg = llamado ? COLORS.success : enCamino ? COLORS.blue : COLORS.carbon

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: 60 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar() }} />}>
      <Display size={26} style={{ marginBottom: 18 }}>Mi turno</Display>

      <View style={[s.hero, { backgroundColor: heroBg }]}>
        {turno.estado === 'en_fila' && (
          <>
            <Text style={s.heroNum}>{turno.posicion}</Text>
            <Text style={s.heroLabel}>tu posición en la fila</Text>
            {eta != null && <View style={s.etaPill}><Text style={s.etaT}>≈ {eta} min de espera</Text></View>}
          </>
        )}
        {llamado && (<><Text style={s.heroBig}>¡Es tu turno!</Text><Text style={s.heroLabel}>Ve al local ahora</Text></>)}
        {enCamino && (<><Text style={s.heroBig}>Vas en camino</Text><Text style={s.heroLabel}>El barbero te espera</Text></>)}
      </View>

      <View style={s.detalle}>
        <KV k="Servicio" v={turno.turno_servicios?.nombre} />
        <KV k="Barbero" v={turno.turno_perfiles?.turno_usuarios?.nombre ?? '—'} />
        <KV k="Duración" v={`${turno.turno_servicios?.duracion_min ?? '—'} min`} />
        <KV k="Estado" v={turno.estado.replace('_', ' ')} />
      </View>

      {(turno.estado === 'en_fila' || llamado) && (
        <TouchableOpacity style={s.cta} onPress={voy} disabled={accion}>
          {accion ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaT}>Voy en camino</Text>}
        </TouchableOpacity>
      )}
      <TouchableOpacity style={s.salir} onPress={salir} disabled={accion}><Text style={s.salirT}>Salir de la cola</Text></TouchableOpacity>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg, padding: 24 },
  vacioT: { fontFamily: FONTS.medium, fontSize: 16, color: COLORS.textLight, marginBottom: 20 },
  hero: { borderRadius: 20, padding: 28, alignItems: 'center', marginBottom: 16 },
  heroNum: { fontFamily: FONTS.display, fontSize: 80, color: COLORS.red, lineHeight: 84 },
  heroBig: { fontFamily: FONTS.display, fontSize: 36, color: '#fff' },
  heroLabel: { fontFamily: FONTS.medium, fontSize: 14, color: 'rgba(255,255,255,0.65)', marginTop: 6 },
  etaPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginTop: 12 },
  etaT: { fontFamily: FONTS.bold, fontSize: 14, color: '#fff' },
  detalle: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 4, marginBottom: 16 },
  cta: { backgroundColor: COLORS.red, borderRadius: 14, padding: 17, alignItems: 'center', marginBottom: 8 },
  ctaT: { fontFamily: FONTS.bold, fontSize: 16, color: '#fff' },
  salir: { padding: 14, alignItems: 'center' },
  salirT: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.danger },
})
