import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { getSesion } from '../../../lib/storage'
import { getColaActiva } from '../../../lib/db'
import { suscribirCola, desuscribir } from '../../../lib/realtime'
import { COLORS, FONTS } from '../../../constants'
import { Display, Avatar } from '../../../components/ui'
import AgendaTrabajo from '../../../components/agenda-trabajo'

const ESTADO: Record<string, { l: string; c: string }> = {
  en_fila: { l: 'En fila', c: COLORS.textLight },
  llamado: { l: 'Llamado', c: COLORS.success },
  en_camino: { l: 'En camino', c: COLORS.blue },
}

export default function AgendaDueno() {
  const [resuelto, setResuelto] = useState(false)
  const [atiende, setAtiende] = useState(false)

  useEffect(() => { getSesion().then(ss => { setAtiende(!!ss?.perfil_id); setResuelto(true) }) }, [])

  if (!resuelto) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>
  // Dueño que atiende → su agenda de trabajo personal. Si no atiende → cola del local.
  if (atiende) return <AgendaTrabajo titulo="Mi agenda" />
  return <ColaLocal />
}

function ColaLocal() {
  const [cola, setCola] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const cargar = useCallback(async () => {
    const ss = await getSesion()
    if (!ss?.negocio_id) { setLoading(false); return }
    setCola(await getColaActiva(ss.negocio_id).catch(() => []) as any[])
    setLoading(false); setRefreshing(false)
  }, [])

  useEffect(() => {
    cargar()
    let sub: any
    getSesion().then(ss => { if (ss?.negocio_id) sub = suscribirCola(ss.negocio_id, () => cargar()) })
    return () => { if (sub) desuscribir(sub) }
  }, [cargar])

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: 72, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar() }} />}>
      <Text style={s.kicker}>{new Date().toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
      <Display size={30} style={{ marginBottom: 16 }}>Cola del local</Display>

      {cola.length === 0 && <Text style={s.empty}>No hay nadie en la cola ahora mismo.</Text>}
      {cola.map((q: any, i: number) => {
        const e = ESTADO[q.estado] ?? ESTADO.en_fila
        return (
          <View key={q.id} style={s.row}>
            <View style={s.pos}><Text style={s.posT}>{i + 1}</Text></View>
            <Avatar name={q.turno_usuarios?.nombre} size={42} bg={COLORS.surfaceAlt} color={COLORS.ink} />
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{q.turno_usuarios?.nombre ?? 'Cliente'}</Text>
              <Text style={s.meta}>{q.turno_servicios?.nombre} · {q.turno_perfiles?.turno_usuarios?.nombre ?? 'Sin asignar'}</Text>
            </View>
            <Text style={[s.estado, { color: e.c }]}>{e.l}</Text>
          </View>
        )
      })}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  kicker: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textLight, textTransform: 'capitalize', marginBottom: 4 },
  empty: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, textAlign: 'center', paddingVertical: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, marginBottom: 8 },
  pos: { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  posT: { fontFamily: FONTS.display, fontSize: 16, color: COLORS.ink },
  name: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  meta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  estado: { fontFamily: FONTS.bold, fontSize: 12 },
})
