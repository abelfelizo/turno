import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useFocusEffect } from 'expo-router'
import { getSesion, limpiarSesion, guardarSesion } from '../../../lib/storage'
import { getMiUsuario, getPreferenciasCliente, getPuntos, getConfiguracion, getHistorialCliente, getMiPerfil, getNegocioById } from '../../../lib/db'
import { cerrarSesion } from '../../../lib/auth'
import { dinero } from '../../../lib/format'
import { COLORS, FONTS, DEV_LOGIN } from '../../../constants'
import { Avatar, KV } from '../../../components/ui'

function masFrecuente(arr: any[], key: (x: any) => string | undefined): string | null {
  const m: Record<string, number> = {}
  arr.forEach(x => { const k = key(x); if (k) m[k] = (m[k] || 0) + 1 })
  const top = Object.entries(m).sort((a, b) => b[1] - a[1])[0]
  return top ? top[0] : null
}

export default function Perfil() {
  const router = useRouter()
  const [usuario, setUsuario] = useState<any>(null)
  const [prefs, setPrefs] = useState<any>(null)
  const [puntos, setPuntos] = useState<any>(null)
  const [config, setConfig] = useState<any>(null)
  const [historial, setHistorial] = useState<any[]>([])
  const [negocio, setNegocio] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    const ss = await getSesion()
    const u = await getMiUsuario().catch(() => null)
    setUsuario(u)
    if (u && ss?.negocio_id) {
      const [pr, pt, cfg, hist, neg] = await Promise.all([
        getPreferenciasCliente(u.id, ss.negocio_id).catch(() => null),
        getPuntos(u.id, ss.negocio_id).catch(() => null),
        getConfiguracion(ss.negocio_id).catch(() => null),
        getHistorialCliente(u.id, ss.negocio_id).catch(() => []),
        getNegocioById(ss.negocio_id).catch(() => null),
      ])
      setPrefs(pr); setPuntos(pt); setConfig(cfg); setHistorial(hist as any[]); setNegocio(neg)
    }
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  async function salir() { await cerrarSesion(); await limpiarSesion(); router.replace('/(auth)/login') }

  async function entrarBarbero() {
    const ss = await getSesion(); if (!ss?.negocio_id) return
    const perfil = await getMiPerfil(ss.usuario_id, ss.negocio_id).catch(() => null)
    if (!perfil) return
    await guardarSesion({ ...ss, rol: 'empleado', perfil_id: perfil.id })
    router.replace('/(app)/barbero/agenda')
  }
  async function entrarDueno() {
    const ss = await getSesion(); if (!ss?.negocio_id) return
    const perfil = await getMiPerfil(ss.usuario_id, ss.negocio_id).catch(() => null) // dueño que también atiende
    await guardarSesion({ ...ss, rol: 'dueno', perfil_id: perfil?.id })
    router.replace('/(app)/dueno/dashboard')
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>

  const totalGastado = historial.reduce((sum, h) => sum + Number(h.precio_cobrado || 0), 0)
  const barberoFav = masFrecuente(historial, h => h.turno_perfiles?.turno_usuarios?.nombre)
  const servicioFav = masFrecuente(historial, h => h.turno_servicios?.nombre)

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: 60 }} showsVerticalScrollIndicator={false}>
      <View style={s.head}>
        <Avatar name={usuario?.nombre} size={72} />
        <Text style={s.nombre}>{usuario?.nombre ?? 'Cliente'}</Text>
        <Text style={s.tel}>{usuario?.telefono ?? ''}</Text>
      </View>

      {config?.puntos_activos && (() => {
        const porVisita = config.puntos_por_visita || 1
        const meta = porVisita * (config.visitas_para_gratis || 10)
        const total = puntos?.puntos_totales ?? 0
        const enCiclo = meta > 0 ? total % meta : 0
        const faltan = Math.max(0, Math.ceil((meta - enCiclo) / porVisita))
        const pct = meta > 0 ? Math.min(100, Math.round((enCiclo / meta) * 100)) : 0
        return (
          <View style={s.fidel}>
            <View style={s.fidelHead}><Text style={s.fidelTitle}>FIDELIDAD</Text><Text style={s.fidelNum}>{enCiclo} / {meta} pts</Text></View>
            <View style={s.barBg}><View style={[s.barFill, { width: `${pct}%` }]} /></View>
            <View style={s.fidelFoot}><Text style={s.fidelMeta}>Meta: corte gratis</Text><Text style={s.fidelFaltan}>{faltan === 0 ? '¡Disponible!' : `Faltan ${faltan} visita${faltan === 1 ? '' : 's'}`}</Text></View>
          </View>
        )
      })()}

      <Text style={s.sec}>TUS NÚMEROS</Text>
      <View style={s.metrics}>
        <View style={s.metric}><Text style={s.mNum}>{historial.length}</Text><Text style={s.mLbl}>Visitas</Text></View>
        <View style={s.metric}><Text style={s.mNum}>{dinero(totalGastado, negocio?.moneda)}</Text><Text style={s.mLbl}>Gastado</Text></View>
      </View>
      <View style={s.metrics}>
        <View style={s.metric}><Text style={s.mNumSm} numberOfLines={1}>{barberoFav ?? '—'}</Text><Text style={s.mLbl}>Barbero favorito</Text></View>
        <View style={s.metric}><Text style={s.mNumSm} numberOfLines={1}>{servicioFav ?? '—'}</Text><Text style={s.mLbl}>Servicio favorito</Text></View>
      </View>

      <View style={s.secRow}>
        <Text style={s.sec}>MIS PREFERENCIAS</Text>
        <TouchableOpacity onPress={() => router.push('/(app)/cliente/preferencias')}><Text style={s.editar}>Editar</Text></TouchableOpacity>
      </View>
      <View style={s.box}>
        <KV k="Tipo de corte" v={prefs?.tipo_corte || '—'} />
        <KV k="Barba" v={prefs?.barba || '—'} />
        <KV k="Alergias" v={prefs?.alergias || '—'} />
        <KV k="Notas" v={prefs?.notas || '—'} />
      </View>

      {DEV_LOGIN && (
        <View style={s.devRow}>
          <TouchableOpacity style={[s.dev, { flex: 1 }]} onPress={entrarBarbero}><Text style={s.devT}>Barbero (dev)</Text></TouchableOpacity>
          <TouchableOpacity style={[s.dev, { flex: 1 }]} onPress={entrarDueno}><Text style={s.devT}>Dueño (dev)</Text></TouchableOpacity>
        </View>
      )}
      <TouchableOpacity style={s.salir} onPress={salir}><Text style={s.salirT}>Cerrar sesión</Text></TouchableOpacity>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  head: { alignItems: 'center', marginBottom: 20 },
  nombre: { fontFamily: FONTS.extrabold, fontSize: 22, color: COLORS.ink, marginTop: 10 },
  tel: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, marginTop: 2 },
  fidel: { backgroundColor: COLORS.carbon, borderRadius: 16, padding: 20, marginBottom: 22 },
  fidelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fidelTitle: { fontFamily: FONTS.bold, fontSize: 12, color: 'rgba(255,255,255,0.55)', letterSpacing: 1 },
  fidelNum: { fontFamily: FONTS.display, fontSize: 22, color: '#fff' },
  barBg: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 12, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5, backgroundColor: COLORS.red },
  fidelFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  fidelMeta: { fontFamily: FONTS.medium, fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  fidelFaltan: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.red },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginBottom: 10 },
  secRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editar: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.blue, marginBottom: 10 },
  metrics: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  metric: { flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 16 },
  mNum: { fontFamily: FONTS.display, fontSize: 28, color: COLORS.ink },
  mNumSm: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.ink },
  mLbl: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 4 },
  box: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 4, marginTop: 10, marginBottom: 24 },
  devRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  dev: { padding: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, marginBottom: 8 },
  devT: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textMid },
  salir: { padding: 16, alignItems: 'center' },
  salirT: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.danger },
})
