import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getSesion, guardarSesion } from '../../../lib/storage'
import {
  getNegocioById, getPerfilesNegocio, getMiTurnoActivo, getMisCitas,
  getRatingsNegocio, confirmarCita, cancelarCita, getMisNegociosCliente, getConfiguracion,
  getMisTarjetas, getHistorialCliente, getMiUsuario,
} from '../../../lib/db'
import { suscribirCola, desuscribir } from '../../../lib/realtime'
import { programarRecordatoriosCitas, avisos } from '../../../lib/notificaciones'
import { COLORS, FONTS } from '../../../constants'
import { hora12, dinero, fechaLarga, fechaDeISO } from '../../../lib/format'
import { Display, Avatar, Badge, Dot } from '../../../components/ui'
import HojaFila from '../../../components/hoja-fila'

const TIPO_LABEL: Record<string, string> = { barbero: 'Barbería', manicuri_pedicuri: 'Uñas & Spa' }

function cuentaRegresiva(fecha: string, hora: string) {
  const ms = new Date(`${fecha}T${hora}`).getTime() - Date.now()
  if (ms <= 0) return 'ahora'
  const min = Math.floor(ms / 60000), h = Math.floor(min / 60), d = Math.floor(h / 24)
  if (d >= 1) return `en ${d} día${d > 1 ? 's' : ''}`
  if (h >= 1) return `en ${h}h ${min % 60}m`
  return `en ${min} min`
}

export default function Home() {
  const router = useRouter()
  const [sesion, setSesion] = useState<any>(null)
  const [miNombre, setMiNombre] = useState('')
  const [negocio, setNegocio] = useState<any>(null)
  const [negocios, setNegocios] = useState<any[]>([])
  const [config, setConfig] = useState<any>(null)
  const [perfiles, setPerfiles] = useState<any[]>([])
  const [turno, setTurno] = useState<any>(null)
  const [citas, setCitas] = useState<any[]>([])
  const [ratings, setRatings] = useState<Record<string, { promedio: number; total: number }>>({})
  const [tarjetas, setTarjetas] = useState<any[]>([])
  const [historial, setHistorial] = useState<any[]>([])
  const [expandido, setExpandido] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [hoja, setHoja] = useState<any>(null)   // selección para la hoja de confirmación de fila

  /** El barbero descubría los huecos al abrir la agenda; ahora se entera. */
  function avisarCancelacion(cita: any) {
    const barbero = cita?.turno_perfiles?.usuario_id
    if (barbero) {
      avisos.barberoCitaCancelada(barbero, miNombre || 'Un cliente',
        `${fechaLarga(fechaDeISO(cita.fecha))} a las ${hora12(cita.hora_inicio)}`)
    }
  }

  const cargar = useCallback(async () => {
    const ss = await getSesion(); setSesion(ss)
    if (!ss?.negocio_id || !ss?.usuario_id) { setLoading(false); return }
    const [neg, perf, t, cs, rt, negs, cfg, pts, hist, yo] = await Promise.all([
      getNegocioById(ss.negocio_id), getPerfilesNegocio(ss.negocio_id),
      getMiTurnoActivo(ss.usuario_id, ss.negocio_id),
      getMisCitas(ss.usuario_id, ss.negocio_id).catch(() => []),
      getRatingsNegocio(ss.negocio_id).catch(() => ({})),
      getMisNegociosCliente(ss.usuario_id).catch(() => []),
      getConfiguracion(ss.negocio_id).catch(() => null),
      getMisTarjetas(ss.negocio_id).catch(() => []),
      getHistorialCliente(ss.usuario_id, ss.negocio_id).catch(() => []),
      getMiUsuario().catch(() => null),
    ])
    setNegocio(neg); setPerfiles(perf as any[]); setTurno(t); setCitas(cs as any[])
    setRatings(rt as any); setNegocios(negs as any[]); setConfig(cfg); setTarjetas((pts as any[]) ?? []); setHistorial(hist as any[]); setMiNombre((yo as any)?.nombre ?? '')
    programarRecordatoriosCitas((cs as any[]).map(c => ({ fecha: c.fecha, hora_inicio: c.hora_inicio, servicio: c.turno_servicios?.nombre })))
    setLoading(false); setRefreshing(false)
  }, [])

  useEffect(() => {
    cargar()
    let sub: any
    getSesion().then(ss => { if (ss?.negocio_id) sub = suscribirCola(ss.negocio_id, () => cargar()) })
    return () => { if (sub) desuscribir(sub) }
  }, [cargar])

  async function cambiarNegocio(negocio_id: string) {
    const ss = await getSesion(); if (!ss) return
    await guardarSesion({ ...ss, negocio_id }); setExpandido(null); setLoading(true); cargar()
  }
  // Abre la hoja de confirmación (R3) en vez de entrar a la fila de un toque.
  function pedir(perfil: any | undefined, servicio: any) {
    if (!sesion?.negocio_id || !negocio) return
    setHoja({ negocio, perfil, servicio })
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>

  const porDueno = !!config?.asignacion_por_dueno

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: 72, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar() }} />}>

      <Text style={s.hola}>Hola</Text>
      <View style={s.marcaHead}>
        {negocio?.logo_url ? <Avatar name={negocio?.nombre} uri={negocio.logo_url} size={52} bg={COLORS.carbon} /> : null}
        <View style={{ flex: 1 }}>
          <Display size={28}>{negocio?.nombre ?? 'Tu barbería'}</Display>
          {negocio?.slogan ? <Text style={s.marcaSlogan}>{negocio.slogan}</Text> : null}
          {negocio?.direccion ? (
            <View style={s.marcaMetaRow}><Ionicons name="location-outline" size={13} color={COLORS.textLight} /><Text style={s.marcaMeta}>{negocio.direccion}</Text></View>
          ) : null}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }} contentContainerStyle={{ gap: 8 }}>
        {negocios.map((n: any) => {
          const activa = n.negocio_id === sesion?.negocio_id
          return (
            <TouchableOpacity key={n.negocio_id} style={[s.tab, activa && s.tabOn]} onPress={() => !activa && cambiarNegocio(n.negocio_id)}>
              <Text style={[s.tabT, activa && { color: '#fff' }]} numberOfLines={1}>{n.nombre}</Text>
            </TouchableOpacity>
          )
        })}
        <TouchableOpacity style={s.tabMas} onPress={() => router.push('/(auth)/cliente-codigo')}><Ionicons name="add" size={20} color={COLORS.red} /></TouchableOpacity>
        <TouchableOpacity style={s.tabMas} onPress={() => router.push('/(app)/cliente/buscar-barbero')}><Ionicons name="person-add-outline" size={18} color={COLORS.blue} /></TouchableOpacity>
      </ScrollView>

      {turno && (
        <TouchableOpacity style={s.fila} onPress={() => router.push('/(app)/cliente/turno')}>
          <View style={s.rowLbl}><Ionicons name="flash" size={13} color={COLORS.red} /><Text style={s.filaLbl}>EN LA FILA</Text></View>
          <Text style={s.filaTitle}>{turno.turno_servicios?.nombre}</Text>
          <Text style={s.filaSub}>{turno.estado === 'en_fila' ? `Posición ${turno.posicion}` : turno.estado === 'llamado' ? 'Te están llamando' : 'Vas en camino'}</Text>
          <View style={s.linkRow}><Text style={s.filaLink}>Ver mi turno</Text><Ionicons name="chevron-forward" size={16} color="#fff" /></View>
        </TouchableOpacity>
      )}

      {citas.length > 0 && <Text style={s.sec}>TUS CITAS</Text>}
      {citas.map((cita: any, i: number) => (
        <View key={cita.id} style={s.cita}>
          <View style={s.citaIcon}><Ionicons name="calendar" size={22} color={COLORS.red} /></View>
          <View style={{ flex: 1 }}>
            <View style={s.citaTop}>
              <Text style={s.citaKick}>{i === 0 ? 'PRÓXIMA CITA' : 'CITA'}</Text>
              <Text style={s.citaCd}>{cuentaRegresiva(cita.fecha, cita.hora_inicio)}</Text>
            </View>
            <Text style={s.citaServ}>{cita.turno_servicios?.nombre}</Text>
            <Text style={s.citaMeta}>{cita.fecha} · {hora12(cita.hora_inicio)} · {cita.turno_perfiles?.turno_usuarios?.nombre ?? ''}</Text>
            <View style={s.citaAcc}>
              {(cita.estado === 'creada' || cita.estado === 'no_confirmada')
                ? <TouchableOpacity style={s.citaBtn} onPress={async () => { await confirmarCita(cita.id); cargar() }}><Text style={s.citaBtnT}>Confirmar</Text></TouchableOpacity>
                : <Badge tone="success">Confirmada</Badge>}
              <TouchableOpacity onPress={() => router.push({ pathname: '/(app)/cliente/agendar', params: { perfil: cita.perfil_id, servicio: cita.servicio_id, reagendar: cita.id } })}>
                <Text style={s.citaReprog}>Reprogramar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => Alert.alert('Cancelar cita', '¿Cancelar esta cita?', [{ text: 'No' }, { text: 'Sí', style: 'destructive', onPress: async () => { await cancelarCita(cita.id); avisarCancelacion(cita); cargar() } }])}>
                <Text style={s.citaCancel}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ))}

      <Text style={s.sec}>RESERVAR CITA</Text>
      <TouchableOpacity style={s.reservar} onPress={() => router.push('/(app)/cliente/agendar')}>
        <View style={s.resIcon}><Ionicons name="calendar-outline" size={22} color={COLORS.red} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.resTitle}>Agendar para otro día u hora</Text>
          <Text style={s.resSub}>Eliges fecha y hora · tu lugar queda reservado</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
      </TouchableOpacity>

      <Text style={s.sec}>FILA DIGITAL · ENTRA AHORA</Text>
      {perfiles.length === 0 && <Text style={s.empty}>No hay profesionales disponibles ahora.</Text>}
      {porDueno
        ? perfiles.flatMap((p: any) => (p.turno_servicios ?? []).filter((sv: any) => sv.activo))
            .filter((sv: any, i: number, arr: any[]) => arr.findIndex(x => x.nombre === sv.nombre) === i)
            .map((sv: any) => (
              <TouchableOpacity key={sv.id} style={s.servSolo} onPress={() => pedir(undefined, sv)}>
                <Text style={s.servNombre}>{sv.nombre}</Text>
                <Text style={s.precio}>{dinero(sv.precio, negocio?.moneda)}</Text>
              </TouchableOpacity>))
        : perfiles.map((p: any) => {
            const r = ratings[p.id]; const abierto = expandido === p.id; const disp = p.estado_actual === 'disponible'
            return (
              <View key={p.id} style={s.barbero}>
                <TouchableOpacity style={s.barberoHead} onPress={() => setExpandido(abierto ? null : p.id)} activeOpacity={0.8}>
                  <Avatar name={p.turno_usuarios?.nombre} uri={p.turno_usuarios?.foto_url} size={44} />
                  <View style={{ flex: 1 }}>
                    <View style={s.nombreRow}>
                      <Text style={s.barberoNombre}>{p.turno_usuarios?.nombre ?? 'Profesional'}</Text>
                      <View style={s.tipoTag}><Text style={s.tipoTagT}>{TIPO_LABEL[p.tipo_servicio] ?? 'Barbería'}</Text></View>
                    </View>
                    {p.turno_usuarios?.especialidad ? <Text style={s.barberoEsp}>{p.turno_usuarios.especialidad}</Text> : null}
                    <View style={s.estadoRow}>
                      <Dot color={disp ? COLORS.success : COLORS.textLight} />
                      <Text style={s.barberoEstado}>{disp ? 'Disponible' : 'En descanso'}{p.domicilio_activo ? '  · Domicilio' : ''}{r ? `   ★ ${r.promedio} (${r.total})` : '   Sin reseñas'}</Text>
                    </View>
                  </View>
                  <Ionicons name={abierto ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textLight} />
                </TouchableOpacity>
                {abierto && !disp && <Text style={s.noDisp}>No recibe turnos ahora mismo. Puedes agendar una cita.</Text>}
                {abierto && disp && (p.turno_servicios ?? []).filter((sv: any) => sv.activo).map((sv: any) => (
                  <TouchableOpacity key={sv.id} style={s.servicio} onPress={() => pedir(p, sv)}>
                    <View><Text style={s.servNombre}>{sv.nombre}</Text><Text style={s.servMeta}>{sv.duracion_min} min</Text></View>
                    <Text style={s.precio}>{dinero(sv.precio, negocio?.moneda)}</Text>
                  </TouchableOpacity>))}
              </View>)
          })}

      {/* Recortes, no puntos: "cada X recortes te ganas esto". Puede haber una
          tarjeta por barbero si el local alquila asientos. */}
      {tarjetas.map((t: any) => {
        const enCiclo = t.meta > 0 ? t.visitas % t.meta : 0
        const faltan = Math.max(0, t.meta - enCiclo)
        const listo = t.visitas >= t.meta
        const pct = t.meta > 0 ? Math.min(100, Math.round((enCiclo / t.meta) * 100)) : 0
        return (
          <TouchableOpacity key={t.perfil_id ?? 'local'} style={s.pts} onPress={() => router.push('/(app)/cliente/perfil')}>
            <View style={s.ptsHead}>
              <Text style={s.ptsLbl}>{t.ambito === 'perfil' && t.barbero ? `CON ${String(t.barbero).toUpperCase()}` : 'FIDELIDAD'}</Text>
              <Text style={s.ptsNum}>{enCiclo} / {t.meta} recortes</Text>
            </View>
            <View style={s.barBg}><View style={[s.barFill, { width: `${listo ? 100 : pct}%` }]} /></View>
            <View style={s.ptsFoot}>
              <Text style={s.ptsMeta}>{t.premio}</Text>
              <Text style={s.ptsFaltan}>{listo ? '¡Disponible!' : `Faltan ${faltan} recorte${faltan === 1 ? '' : 's'}`}</Text>
            </View>
          </TouchableOpacity>
        )
      })}

      {historial.length > 0 && (
        <>
          <View style={s.histHead}><Text style={s.sec}>TUS VISITAS</Text><TouchableOpacity onPress={() => router.push('/(app)/cliente/historial')}><Text style={s.verTodo}>Ver todo</Text></TouchableOpacity></View>
          {historial.slice(0, 4).map((h: any) => (
            <View key={h.id} style={s.histItem}>
              <View style={{ flex: 1 }}><Text style={s.histServ}>{h.turno_servicios?.nombre ?? 'Servicio'}</Text><Text style={s.histMeta}>{h.fecha} · {h.turno_perfiles?.turno_usuarios?.nombre ?? ''}</Text></View>
              <Text style={s.histPrecio}>{dinero(h.precio_cobrado, negocio?.moneda)}</Text>
            </View>
          ))}
        </>
      )}

      <HojaFila
        seleccion={hoja}
        visible={!!hoja}
        onClose={() => setHoja(null)}
        onEntrado={() => { setHoja(null); cargar(); router.push('/(app)/cliente/turno') }}
      />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  hola: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.textLight, letterSpacing: 0.4, marginBottom: 4 },
  marcaHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  marcaSlogan: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textMid, marginTop: 2 },
  marcaMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  marcaMeta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight },
  barberoEsp: { fontFamily: FONTS.semibold, fontSize: 12, color: COLORS.blue, marginTop: 2 },
  noDisp: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textLight, paddingHorizontal: 4, paddingTop: 10 },
  tab: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 11, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  tabOn: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  tabT: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.textMid, maxWidth: 160 },
  tabMas: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 11, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  rowLbl: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 12 },
  fila: { backgroundColor: COLORS.carbon, borderRadius: 16, padding: 18, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: COLORS.red },
  filaLbl: { fontFamily: FONTS.bold, fontSize: 11, color: COLORS.red, letterSpacing: 1 },
  filaTitle: { fontFamily: FONTS.extrabold, fontSize: 19, color: '#fff', marginTop: 8 },
  filaSub: { fontFamily: FONTS.medium, fontSize: 14, color: '#9A9CA6', marginTop: 2 },
  filaLink: { fontFamily: FONTS.bold, fontSize: 14, color: '#fff' },
  cita: { flexDirection: 'row', gap: 12, backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 18, borderWidth: 1, borderColor: COLORS.border },
  citaIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.redLight, alignItems: 'center', justifyContent: 'center' },
  citaTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  citaKick: { fontFamily: FONTS.bold, fontSize: 11, color: COLORS.textLight, letterSpacing: 1 },
  citaCd: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.red },
  citaServ: { fontFamily: FONTS.extrabold, fontSize: 18, color: COLORS.ink, marginTop: 4 },
  citaMeta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textMid, marginTop: 2 },
  citaAcc: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12 },
  citaBtn: { backgroundColor: COLORS.red, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  citaBtnT: { fontFamily: FONTS.bold, color: '#fff', fontSize: 13 },
  citaReprog: { fontFamily: FONTS.semibold, color: COLORS.blue, fontSize: 13 },
  citaCancel: { fontFamily: FONTS.semibold, color: COLORS.textLight, fontSize: 13 },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginBottom: 12 },
  empty: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, paddingVertical: 20, textAlign: 'center' },
  reservar: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, marginBottom: 22, borderWidth: 1, borderColor: COLORS.border },
  resIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.redLight, alignItems: 'center', justifyContent: 'center' },
  resTitle: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  resSub: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  barbero: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: 14, marginBottom: 12 },
  barberoHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nombreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barberoNombre: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.ink },
  tipoTag: { backgroundColor: COLORS.surfaceAlt, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  tipoTagT: { fontFamily: FONTS.bold, fontSize: 10, color: COLORS.textMid },
  estadoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  barberoEstado: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight },
  servicio: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surfaceAlt, borderRadius: 12, padding: 14, marginTop: 8 },
  servSolo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 16, marginBottom: 8 },
  servNombre: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  servMeta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  precio: { fontFamily: FONTS.display, fontSize: 20, color: COLORS.red },
  pts: { backgroundColor: COLORS.carbon, borderRadius: 16, padding: 16, marginTop: 6, marginBottom: 22 },
  ptsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ptsLbl: { fontFamily: FONTS.bold, fontSize: 11, color: 'rgba(255,255,255,0.55)', letterSpacing: 1 },
  ptsNum: { fontFamily: FONTS.display, fontSize: 22, color: '#fff' },
  barBg: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 10, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: COLORS.red },
  ptsFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  ptsMeta: { fontFamily: FONTS.medium, fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  ptsFaltan: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.red },
  histHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  verTodo: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.blue, marginBottom: 12 },
  histItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: COLORS.borderSoft },
  histServ: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  histMeta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  histPrecio: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.ink },
})
