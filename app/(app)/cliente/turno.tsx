import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, RefreshControl } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { getSesion } from '../../../lib/storage'
import {
  getMisTurnosActivos, getTurnoExpirado, confirmarCamino, salirDeCola, etaCola,
  getPerfilesNegocio, getNegocioById, getConfiguracion, puedeConfirmar, getMisCitas,
} from '../../../lib/db'
import { hora12, fechaLarga, fechaDeISO } from '../../../lib/format'
import { suscribirCola, desuscribir } from '../../../lib/realtime'
import { dinero } from '../../../lib/format'
import { COLORS, FONTS } from '../../../constants'
import { Display, Avatar } from '../../../components/ui'
import HojaFila from '../../../components/hoja-fila'

export default function MiTurno() {
  const [turnos, setTurnos] = useState<any[]>([])
  const [etas, setEtas] = useState<Record<string, number | null>>({})
  const [puede, setPuede] = useState<Record<string, boolean>>({})
  const [expirado, setExpirado] = useState<any>(null)
  const [negocio, setNegocio] = useState<any>(null)
  const [perfiles, setPerfiles] = useState<any[]>([])
  const [porDueno, setPorDueno] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [accion, setAccion] = useState<string | null>(null)
  const [hoja, setHoja] = useState<any>(null)
  const [citas, setCitas] = useState<any[]>([])

  const cargar = useCallback(async () => {
    const ss = await getSesion()
    if (!ss?.usuario_id || !ss?.negocio_id) { setLoading(false); return }
    const [ts, neg, perf, cfg, cts] = await Promise.all([
      getMisTurnosActivos(ss.usuario_id, ss.negocio_id).catch(() => []),
      getNegocioById(ss.negocio_id).catch(() => null),
      getPerfilesNegocio(ss.negocio_id).catch(() => []),
      getConfiguracion(ss.negocio_id).catch(() => null),
      // Las citas reservadas también son "mi turno": tenerlas solo en Inicio
      // obligaba a recordar en qué pantalla estaba cada cosa.
      getMisCitas(ss.usuario_id, ss.negocio_id).catch(() => []),
    ])
    setTurnos(ts as any[]); setNegocio(neg); setPerfiles(perf as any[]); setPorDueno(!!cfg?.asignacion_por_dueno)
    setCitas(cts as any[])
    setExpirado((ts as any[]).length === 0 ? await getTurnoExpirado(ss.usuario_id, ss.negocio_id).catch(() => null) : null)
    const map: Record<string, number | null> = {}
    const pmap: Record<string, boolean> = {}
    for (const t of ts as any[]) {
      if (t.estado === 'en_fila') map[t.id] = await etaCola(t.id).catch(() => null)
      pmap[t.id] = await puedeConfirmar(t.id).catch(() => false)   // gating R2
    }
    setEtas(map); setPuede(pmap)
    setLoading(false); setRefreshing(false)
  }, [])

  useEffect(() => {
    cargar()
    let sub: any
    getSesion().then(ss => { if (ss?.negocio_id) sub = suscribirCola(ss.negocio_id, () => cargar()) })
    // El ETA envejece solo: la silla ocupada se vacía con el reloj, no con un
    // cambio en la base, así que sin este refresco el cliente ve una espera
    // que ya no es cierta.
    const t = setInterval(() => cargar(), 60000)
    return () => { if (sub) desuscribir(sub); clearInterval(t) }
  }, [cargar])

  async function voy(t: any) {
    setAccion(t.id)
    try { await confirmarCamino(t.id); await cargar() }
    catch (e: any) { Alert.alert('Error', e.message ?? 'Intenta de nuevo.') } finally { setAccion(null) }
  }
  function salir(t: any) {
    Alert.alert('Salir de la fila', '¿Seguro que quieres cancelar este turno?', [
      { text: 'No' },
      { text: 'Sí, salir', style: 'destructive', onPress: async () => {
        setAccion(t.id)
        try { await salirDeCola(t.id); await cargar() }
        catch (e: any) { Alert.alert('Error', e.message ?? 'Intenta de nuevo.') } finally { setAccion(null) }
      } },
    ])
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: 60, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar() }} />}>
      <Display size={26} style={{ marginBottom: 18 }}>Mi turno</Display>

      {expirado && (
        <View style={s.expirado}>
          <Ionicons name="time-outline" size={20} color={COLORS.red} />
          <View style={{ flex: 1 }}>
            <Text style={s.expT}>Tu turno expiró</Text>
            <Text style={s.expS}>No alcanzaste a llegar en la ventana. Puedes entrar de nuevo abajo.</Text>
          </View>
        </View>
      )}

      {turnos.map((t: any) => {
        const llamado = t.estado === 'llamado'
        const enCamino = t.estado === 'en_camino'
        const atendiendo = t.estado === 'atendiendo'
        const heroBg = atendiendo ? COLORS.blue : llamado ? COLORS.success : enCamino ? COLORS.blue : COLORS.carbon
        return (
          <View key={t.id} style={s.turnoCard}>
            <View style={[s.hero, { backgroundColor: heroBg }]}>
              {t.estado === 'en_fila' && (<>
                <Text style={s.heroNum}>{t.posicion}</Text>
                <Text style={s.heroLabel}>tu posición en la fila</Text>
                {etas[t.id] != null && <View style={s.etaPill}><Text style={s.etaT}>≈ {etas[t.id]} min de espera</Text></View>}
              </>)}
              {llamado && (<><Text style={s.heroBig}>¡Es tu turno!</Text><Text style={s.heroLabel}>Ve al local ahora</Text></>)}
              {enCamino && (<><Text style={s.heroBig}>Vas en camino</Text><Text style={s.heroLabel}>El barbero te espera</Text></>)}
              {atendiendo && (<><Text style={s.heroBig}>Te están atendiendo</Text><Text style={s.heroLabel}>Disfruta tu corte ✂️</Text></>)}
            </View>
            <View style={s.detalle}>
              <Text style={s.dServ}>{t.turno_servicios?.nombre}</Text>
              <Text style={s.dMeta}>{t.turno_perfiles?.turno_usuarios?.nombre ?? 'Sin asignar'} · {t.turno_servicios?.duracion_min ?? '—'} min · {t.estado.replace('_', ' ')}</Text>
            </View>
            <View style={s.acciones}>
              {!atendiendo && (t.estado === 'en_fila' || llamado) && (
                puede[t.id]
                  ? <TouchableOpacity style={s.cta} onPress={() => voy(t)} disabled={accion === t.id}>
                      {accion === t.id ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaT}>Voy en camino</Text>}
                    </TouchableOpacity>
                  : <View style={s.ctaOff}><Ionicons name="lock-closed" size={14} color={COLORS.textLight} /><Text style={s.ctaOffT}>Se activa cuando estés cerca</Text></View>
              )}
              {!atendiendo && <TouchableOpacity style={s.salir} onPress={() => salir(t)} disabled={accion === t.id}><Text style={s.salirT}>Salir</Text></TouchableOpacity>}
            </View>
          </View>
        )
      })}

      {citas.length > 0 && (
        <>
          <Text style={s.sec}>TUS CITAS RESERVADAS</Text>
          {citas.map((c: any) => (
            <View key={c.id} style={s.cita}>
              <View style={s.citaFecha}>
                <Text style={s.citaDia}>{fechaDeISO(c.fecha).getDate()}</Text>
                <Text style={s.citaMes}>
                  {fechaDeISO(c.fecha).toLocaleDateString('es', { month: 'short' }).replace('.', '').toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.citaServ}>{c.turno_servicios?.nombre ?? 'Servicio'}</Text>
                <Text style={s.citaMeta}>
                  {hora12(c.hora_inicio)} · {c.turno_perfiles?.turno_usuarios?.nombre ?? 'Sin asignar'}
                </Text>
                <Text style={s.citaDia2}>{fechaLarga(fechaDeISO(c.fecha))}</Text>
              </View>
            </View>
          ))}
        </>
      )}

      {/* Pedir un turno desde aquí mismo (R3) */}
      <Text style={s.sec}>{turnos.length ? 'PEDIR OTRO TURNO' : 'PEDIR UN TURNO'}</Text>
      {perfiles.length === 0 && <Text style={s.empty}>No hay profesionales disponibles ahora.</Text>}
      {porDueno
        ? perfiles.flatMap((p: any) => (p.turno_servicios ?? []).filter((sv: any) => sv.activo))
            .filter((sv: any, i: number, arr: any[]) => arr.findIndex(x => x.nombre === sv.nombre) === i)
            .map((sv: any) => (
              <TouchableOpacity key={sv.id} style={s.servRow} onPress={() => setHoja({ negocio, perfil: undefined, servicio: sv })}>
                <Text style={s.servN}>{sv.nombre}</Text>
                <Text style={s.servP}>{dinero(sv.precio, negocio?.moneda)}</Text>
              </TouchableOpacity>))
        : perfiles.filter((p: any) => p.estado_actual === 'disponible').map((p: any) => (
            <View key={p.id} style={s.barbero}>
              <View style={s.barberoHead}>
                <Avatar name={p.turno_usuarios?.nombre} uri={p.turno_usuarios?.foto_url} size={38} />
                <Text style={s.barberoN}>{p.turno_usuarios?.nombre ?? 'Profesional'}</Text>
              </View>
              {(p.turno_servicios ?? []).filter((sv: any) => sv.activo).map((sv: any) => (
                <TouchableOpacity key={sv.id} style={s.servRow} onPress={() => setHoja({ negocio, perfil: p, servicio: sv })}>
                  <Text style={s.servN}>{sv.nombre} · {sv.duracion_min} min</Text>
                  <Text style={s.servP}>{dinero(sv.precio, negocio?.moneda)}</Text>
                </TouchableOpacity>))}
            </View>))}

      <HojaFila seleccion={hoja} visible={!!hoja} onClose={() => setHoja(null)} onEntrado={() => { setHoja(null); cargar() }} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  cita: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, marginBottom: 8 },
  citaFecha: { width: 52, height: 52, borderRadius: 12, backgroundColor: COLORS.carbon, alignItems: 'center', justifyContent: 'center' },
  citaDia: { fontFamily: FONTS.display, fontSize: 20, color: '#fff' },
  citaMes: { fontFamily: FONTS.bold, fontSize: 9, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.5 },
  citaServ: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  citaMeta: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.red, marginTop: 2 },
  citaDia2: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 1, textTransform: 'capitalize' },
  expirado: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.redLight, borderRadius: 14, padding: 14, marginBottom: 16 },
  expT: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.red },
  expS: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textMid, marginTop: 2 },
  turnoCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 18, padding: 12, marginBottom: 14 },
  hero: { borderRadius: 14, padding: 24, alignItems: 'center', marginBottom: 10 },
  heroNum: { fontFamily: FONTS.display, fontSize: 68, color: COLORS.red, lineHeight: 72 },
  heroLabel: { fontFamily: FONTS.medium, fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 4 },
  heroBig: { fontFamily: FONTS.display, fontSize: 32, color: '#fff' },
  etaPill: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginTop: 10 },
  etaT: { fontFamily: FONTS.bold, fontSize: 14, color: '#fff' },
  detalle: { paddingHorizontal: 6, marginBottom: 10 },
  dServ: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.ink },
  dMeta: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textLight, marginTop: 2, textTransform: 'capitalize' },
  acciones: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  cta: { flex: 1, backgroundColor: COLORS.red, borderRadius: 12, padding: 14, alignItems: 'center' },
  ctaT: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
  ctaOff: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.surfaceAlt, borderRadius: 12, padding: 14 },
  ctaOffT: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textLight },
  salir: { padding: 14, alignItems: 'center' },
  salirT: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.danger },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginTop: 8, marginBottom: 12 },
  empty: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, paddingVertical: 12 },
  barbero: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, marginBottom: 10 },
  barberoHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  barberoN: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  servRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surfaceAlt, borderRadius: 10, padding: 12, marginTop: 6 },
  servN: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink },
  servP: { fontFamily: FONTS.display, fontSize: 18, color: COLORS.red },
})
