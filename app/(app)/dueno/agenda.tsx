import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, Modal } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getSesion, guardarSesion } from '../../../lib/storage'
import { getColaActiva, sacarDeCola, moverEnCola } from '../../../lib/db'
import { suscribirCola, desuscribir } from '../../../lib/realtime'
import { COLORS, FONTS } from '../../../constants'
import { fechaLarga } from '../../../lib/format'
import { Display, Avatar } from '../../../components/ui'
import PanelBadge from '../../../components/panel-badge'

const ESTADO: Record<string, { l: string; c: string }> = {
  en_fila: { l: 'En fila', c: COLORS.textLight },
  llamado: { l: 'Llamado', c: COLORS.success },
  en_camino: { l: 'En camino', c: COLORS.blue },
  atendiendo: { l: 'En la silla', c: COLORS.red },
}

/**
 * Panel BARBERÍA · la cola del local entera.
 *
 * Antes esta pantalla se transformaba en la agenda personal si el dueño
 * atendía, y de ahí venía la confusión del piloto: el distintivo decía
 * "BARBERÍA" y lo que se veía era la silla. Ahora cada panel enseña una sola
 * cosa: aquí el local, y la agenda personal vive en "Mi silla".
 */
export default function ColaLocal() {
  const router = useRouter()
  const [cola, setCola] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [atiende, setAtiende] = useState(false)
  const [sel, setSel] = useState<any>(null)

  const cargar = useCallback(async () => {
    const ss = await getSesion()
    setAtiende(!!ss?.perfil_id)
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

  async function irAMiSilla() {
    const ss = await getSesion(); if (!ss) return
    await guardarSesion({ ...ss, panel: 'silla' })
    router.replace('/(app)/barbero/agenda')
  }

  async function op(fn: () => Promise<any>, err = 'No se pudo') {
    setSel(null)
    try { await fn(); cargar() } catch (e: any) { Alert.alert(err, e.message ?? 'Intenta de nuevo.') }
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: 72, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar() }} />}>
      <PanelBadge />
      <Text style={s.kicker}>{fechaLarga()}</Text>
      <Display size={30} style={{ marginBottom: 16 }}>Cola del local</Display>

      {atiende && (
        <TouchableOpacity style={s.silla} onPress={irAMiSilla}>
          <Ionicons name="cut" size={18} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={s.sillaT}>Ir a mi silla</Text>
            <Text style={s.sillaD}>Tu agenda, tus clientes y tu cola</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      )}

      {cola.length === 0 && <Text style={s.empty}>No hay nadie en la cola ahora mismo.</Text>}
      {cola.length > 0 && <Text style={s.hint}>Toca a alguien para moverlo o sacarlo de la fila.</Text>}
      {cola.map((q: any, i: number) => {
        const e = ESTADO[q.estado] ?? ESTADO.en_fila
        return (
          <TouchableOpacity key={q.id} style={s.row} onPress={() => setSel(q)}>
            <View style={s.pos}><Text style={s.posT}>{i + 1}</Text></View>
            <Avatar name={q.turno_usuarios?.nombre} size={42} bg={COLORS.surfaceAlt} color={COLORS.ink} />
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{q.turno_usuarios?.nombre ?? 'Cliente'}</Text>
              <Text style={s.meta}>{q.turno_servicios?.nombre} · {q.turno_perfiles?.turno_usuarios?.nombre ?? 'Sin asignar'}</Text>
            </View>
            <Text style={[s.estado, { color: e.c }]}>{e.l}</Text>
          </TouchableOpacity>
        )
      })}

      <Modal visible={!!sel} transparent animationType="slide" onRequestClose={() => setSel(null)}>
        <View style={s.modalBg}>
          <View style={s.modal}>
            <Display size={22}>{sel?.turno_usuarios?.nombre ?? 'Turno'}</Display>
            <Text style={s.modalSub}>{sel?.turno_servicios?.nombre} · {(ESTADO[sel?.estado] ?? ESTADO.en_fila).l}</Text>
            {sel?.estado === 'en_fila' && (
              <>
                <Opcion icon="arrow-up" t="Subir un puesto" onPress={() => op(() => moverEnCola(sel.id, -1), 'No se pudo mover')} />
                <Opcion icon="arrow-down" t="Bajar un puesto" onPress={() => op(() => moverEnCola(sel.id, 1), 'No se pudo mover')} />
              </>
            )}
            {/* EN LA SILLA NO SE TOCA. El dueño podía sacar de la fila a un
                cliente que un barbero estaba atendiendo: se lo levantaba a
                mitad de corte y, de paso, el turno quedaba 'abandonado', que no
                registra visita — o sea que el corte que se estaba dando
                desaparecía de las cuentas del barbero. Desde la migración 76 el
                servidor lo niega; aquí ni se ofrece, y se dice por qué, que es
                distinto de esconder el botón sin explicación. */}
            {sel?.estado === 'atendiendo' ? (
              <Text style={s.enSilla}>
                Lo está atendiendo {sel?.turno_perfiles?.turno_usuarios?.nombre ?? 'un barbero'}. Lo que pase en esa
                silla lo cierra quien está cortando.
              </Text>
            ) : (
              <Opcion icon="exit-outline" t="Sacar de la fila" d="Se fue del local o no apareció" rojo
                onPress={() => op(() => sacarDeCola(sel.id), 'No se pudo sacar')} />
            )}
            <TouchableOpacity onPress={() => setSel(null)}><Text style={s.modalCerrar}>Cerrar</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

function Opcion({ icon, t, d, rojo, onPress }: { icon: any; t: string; d?: string; rojo?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={o.row} onPress={onPress}>
      <Ionicons name={icon} size={20} color={rojo ? COLORS.red : COLORS.ink} />
      <View style={{ flex: 1 }}>
        <Text style={[o.t, rojo && { color: COLORS.red }]}>{t}</Text>
        {d ? <Text style={o.d}>{d}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
    </TouchableOpacity>
  )
}
const o = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 15, marginBottom: 8 },
  t: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  d: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
})

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  kicker: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textLight, textTransform: 'capitalize', marginBottom: 4 },
  silla: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.red, borderRadius: 14, padding: 15, marginBottom: 16 },
  sillaT: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
  sillaD: { fontFamily: FONTS.medium, fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  hint: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginBottom: 10 },
  empty: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, textAlign: 'center', paddingVertical: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, marginBottom: 8 },
  pos: { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  posT: { fontFamily: FONTS.display, fontSize: 16, color: COLORS.ink },
  name: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  meta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  estado: { fontFamily: FONTS.bold, fontSize: 12 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: COLORS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalSub: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textLight, marginTop: 6, marginBottom: 16 },
  enSilla: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textMid, backgroundColor: COLORS.surfaceAlt,
    borderRadius: 12, padding: 13, lineHeight: 19 },
  modalCerrar: { fontFamily: FONTS.semibold, textAlign: 'center', color: COLORS.textLight, fontSize: 14, marginTop: 14 },
})
