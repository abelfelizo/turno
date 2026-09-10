import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Alert } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getSesion, limpiarSesion } from '../../../lib/storage'
import { getMiUsuario, getPreferenciasCliente, getMisTarjetas, getConfiguracion, getHistorialCliente, getNegocioById, getMisNegociosCliente, salirLocal, eliminarCuenta, emitirCanje, getMisCanjesActivos } from '../../../lib/db'
import { cerrarSesion } from '../../../lib/auth'
import { dinero } from '../../../lib/format'
import { COLORS, FONTS } from '../../../constants'
import { Avatar, KV } from '../../../components/ui'
import CambiarRol from '../../../components/cambiar-rol'

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
  const [tarjetas, setTarjetas] = useState<any[]>([])
  const [config, setConfig] = useState<any>(null)
  const [historial, setHistorial] = useState<any[]>([])
  const [negocio, setNegocio] = useState<any>(null)
  const [locales, setLocales] = useState<any[]>([])
  const [canjes, setCanjes] = useState<any[]>([])
  const [canjeando, setCanjeando] = useState(false)
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    const ss = await getSesion()
    const u = await getMiUsuario().catch(() => null)
    setUsuario(u)
    if (u && ss?.negocio_id) {
      const [pr, pt, cfg, hist, neg] = await Promise.all([
        getPreferenciasCliente(u.id, ss.negocio_id).catch(() => null),
        getMisTarjetas(ss.negocio_id).catch(() => []),
        getConfiguracion(ss.negocio_id).catch(() => null),
        getHistorialCliente(u.id, ss.negocio_id).catch(() => []),
        getNegocioById(ss.negocio_id).catch(() => null),
      ])
      setPrefs(pr); setTarjetas((pt as any[]) ?? []); setConfig(cfg); setHistorial(hist as any[]); setNegocio(neg)
      setLocales(await getMisNegociosCliente(u.id).catch(() => []))
      setCanjes(await getMisCanjesActivos(u.id, ss.negocio_id).catch(() => []))
    }
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])
  useFocusEffect(useCallback(() => { cargar() }, [cargar]))

  function salir() {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir? Necesitarás un código nuevo para volver a entrar.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: async () => {
        await cerrarSesion(); await limpiarSesion(); router.replace('/(auth)/login')
      } },
    ])
  }

  function salirDeLocal(l: any) {
    Alert.alert('Salir del local', `¿Salir de ${l.nombre}? Podrás volver con el código. Tu historial se conserva.`, [
      { text: 'No' },
      { text: 'Sí, salir', style: 'destructive', onPress: async () => {
        try { await salirLocal(l.negocio_id); router.replace('/') }
        catch (e: any) { Alert.alert('Error', e.message ?? 'Intenta de nuevo.') }
      } },
    ])
  }

  async function canjear(perfil_id?: string | null) {
    const ss = await getSesion(); if (!ss?.negocio_id) return
    setCanjeando(true)
    try {
      await emitirCanje(ss.negocio_id, perfil_id)
      Alert.alert('¡Premio canjeado!', 'Generamos tu vale. Muéstralo al barbero cuando te cobre.')
      cargar()
    } catch (e: any) { Alert.alert('No se pudo canjear', e.message ?? 'Intenta de nuevo.') }
    finally { setCanjeando(false) }
  }

  function eliminarMiCuenta() {
    Alert.alert('Eliminar cuenta',
      'Esto borra tus datos personales y cancela tus turnos y citas futuras. No se puede deshacer.',
      [{ text: 'Cancelar' }, { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try { await eliminarCuenta(); await cerrarSesion(); await limpiarSesion(); router.replace('/(auth)/login') }
        catch (e: any) { Alert.alert('Error', e.message ?? 'Intenta de nuevo.') }
      } }])
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

      {tarjetas.map((t: any) => {
        const enCiclo = t.meta > 0 ? t.visitas % t.meta : 0
        const listo = t.visitas >= t.meta
        const faltan = Math.max(0, t.meta - enCiclo)
        const pct = t.meta > 0 ? Math.min(100, Math.round((enCiclo / t.meta) * 100)) : 0
        return (
          <View key={t.perfil_id ?? 'local'} style={s.fidel}>
            <View style={s.fidelHead}>
              <Text style={s.fidelTitle}>{t.ambito === 'perfil' && t.barbero ? `CON ${String(t.barbero).toUpperCase()}` : 'FIDELIDAD'}</Text>
              <Text style={s.fidelNum}>{enCiclo} / {t.meta} recortes</Text>
            </View>
            <View style={s.barBg}><View style={[s.barFill, { width: `${listo ? 100 : pct}%` }]} /></View>
            <View style={s.fidelFoot}>
              <Text style={s.fidelMeta}>{t.premio}</Text>
              <Text style={s.fidelFaltan}>{listo ? '¡Disponible!' : `Faltan ${faltan} recorte${faltan === 1 ? '' : 's'}`}</Text>
            </View>
            {listo && (
              <TouchableOpacity style={s.canjearBtn} onPress={() => canjear(t.perfil_id)} disabled={canjeando}>
                {canjeando ? <ActivityIndicator color={COLORS.carbon} /> : <Text style={s.canjearT}>Canjear: {t.premio}</Text>}
              </TouchableOpacity>
            )}
          </View>
        )
      })}

      {canjes.length > 0 && (
        <View style={s.vales}>
          <Text style={s.valesT}>VALES DISPONIBLES</Text>
          {canjes.map((c: any) => (
            <View key={c.id} style={s.vale}>
              <Ionicons name="ticket" size={18} color={COLORS.red} />
              <Text style={s.valeT}>{c.premio ?? 'Premio'} · muéstralo al cobrar</Text>
            </View>
          ))}
        </View>
      )}

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

      {locales.length > 0 && (
        <>
          <Text style={s.sec}>MIS LOCALES</Text>
          {locales.map((l: any) => (
            <View key={l.negocio_id} style={s.localRow}>
              <Text style={s.localN}>{l.nombre}</Text>
              <TouchableOpacity onPress={() => salirDeLocal(l)}><Text style={s.localSalir}>Salir</Text></TouchableOpacity>
            </View>
          ))}
        </>
      )}

      <CambiarRol />

      {/* CUENTA, con la misma composición que en los paneles de barbero y
          dueño: icono, nombre y UNA LÍNEA QUE DICE QUÉ PASA. Eran dos textos
          sueltos, uno gris y otro rojo, sin decir consecuencias — y una de las
          dos borra la cuenta. */}
      <Text style={[s.sec, { marginTop: 18 }]}>CUENTA</Text>

      <TouchableOpacity style={s.cuentaFila} onPress={salir}>
        <View style={s.cuentaIcono}><Ionicons name="log-out-outline" size={18} color={COLORS.textMid} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.cuentaT}>Cerrar sesión</Text>
          <Text style={s.cuentaD}>Tus turnos, tus citas y tus recortes acumulados siguen ahí cuando vuelvas a entrar.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
      </TouchableOpacity>

      <Text style={[s.sec, { marginTop: 22 }]}>SIN VUELTA ATRÁS</Text>
      <TouchableOpacity style={s.cuentaBorrar} onPress={eliminarMiCuenta}>
        <Ionicons name="trash-outline" size={18} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={s.cuentaBorrarT}>Eliminar mi cuenta</Text>
          <Text style={s.cuentaBorrarD}>Borra tus datos, cancela tus turnos y citas, y pierdes los recortes acumulados en cada local. No se puede deshacer.</Text>
        </View>
      </TouchableOpacity>
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
  canjearBtn: { backgroundColor: '#fff', borderRadius: 12, padding: 13, alignItems: 'center', marginTop: 14 },
  canjearT: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.carbon },
  cuentaFila: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, marginBottom: 8 },
  cuentaIcono: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  cuentaT: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  cuentaD: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.textMid, marginTop: 3, lineHeight: 17 },
  cuentaBorrar: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.red,
    borderRadius: 14, padding: 14, marginBottom: 24 },
  cuentaBorrarT: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
  cuentaBorrarD: { fontFamily: FONTS.medium, fontSize: 12.5, color: 'rgba(255,255,255,0.85)', marginTop: 3, lineHeight: 17 },
  vales: { backgroundColor: COLORS.redLight, borderRadius: 14, padding: 14, marginBottom: 22 },
  valesT: { fontFamily: FONTS.bold, fontSize: 11, color: COLORS.red, letterSpacing: 1, marginBottom: 10 },
  vale: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  valeT: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginBottom: 10 },
  secRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editar: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.blue, marginBottom: 10 },
  metrics: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  metric: { flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 16 },
  mNum: { fontFamily: FONTS.display, fontSize: 28, color: COLORS.ink },
  mNumSm: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.ink },
  mLbl: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 4 },
  box: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 4, marginTop: 10, marginBottom: 24 },
  localRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 14, marginBottom: 8 },
  localN: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  localSalir: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.danger },
  salir: { padding: 16, alignItems: 'center', marginTop: 8 },
  salirT: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.danger },
  eliminar: { padding: 12, alignItems: 'center', marginBottom: 12 },
  eliminarT: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textLight, textDecorationLine: 'underline' },
})
