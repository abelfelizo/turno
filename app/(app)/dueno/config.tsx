import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Switch, TextInput, Alert } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { getSesion, guardarSesion, limpiarSesion } from '../../../lib/storage'
import { getConfiguracion, updateConfiguracion, getNegocioById, actualizarNegocio } from '../../../lib/db'
import { elegirYSubirImagen } from '../../../lib/imagenes'
import { cerrarSesion } from '../../../lib/auth'
import { COLORS, FONTS, DEV_LOGIN } from '../../../constants'
import { Display, Avatar } from '../../../components/ui'

export default function Config() {
  const router = useRouter()
  const [negocioId, setNegocioId] = useState<string | null>(null)
  const [config, setConfig] = useState<any>(null)
  const [negocio, setNegocio] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  // marca / contacto del local
  const [nombre, setNombre] = useState(''); const [slogan, setSlogan] = useState('')
  const [direccion, setDireccion] = useState(''); const [telefono, setTelefono] = useState(''); const [ig, setIg] = useState('')
  const [guardandoMarca, setGuardandoMarca] = useState(false)
  const [subiendoLogo, setSubiendoLogo] = useState(false)

  const cargar = useCallback(async () => {
    const ss = await getSesion()
    if (!ss?.negocio_id) { setLoading(false); return }
    setNegocioId(ss.negocio_id)
    const [cfg, neg] = await Promise.all([
      getConfiguracion(ss.negocio_id).catch(() => null),
      getNegocioById(ss.negocio_id).catch(() => null),
    ])
    setConfig(cfg); setNegocio(neg)
    setNombre(neg?.nombre ?? ''); setSlogan(neg?.slogan ?? '')
    setDireccion(neg?.direccion ?? ''); setTelefono(neg?.telefono ?? ''); setIg(neg?.instagram ?? '')
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function cambiarLogo() {
    if (!negocioId) return
    setSubiendoLogo(true)
    try {
      const url = await elegirYSubirImagen('logos', negocioId)
      if (url) { await actualizarNegocio(negocioId, { logo_url: url }); setNegocio((n: any) => ({ ...n, logo_url: url })) }
    } catch (e: any) { Alert.alert('No se pudo subir el logo', e.message ?? 'Intenta de nuevo.') }
    finally { setSubiendoLogo(false) }
  }
  async function guardarMarca() {
    if (!negocioId) return
    if (!nombre.trim()) { Alert.alert('Falta el nombre', 'El local necesita un nombre.'); return }
    setGuardandoMarca(true)
    try {
      await actualizarNegocio(negocioId, {
        nombre: nombre.trim(), slogan: slogan.trim(), direccion: direccion.trim(),
        telefono: telefono.trim(), instagram: ig.trim().replace(/^@/, ''),
      })
      Alert.alert('Marca actualizada', 'Los cambios ya son visibles para tus clientes.')
    } catch (e: any) { Alert.alert('No se pudo guardar', e.message ?? 'Intenta de nuevo.') }
    finally { setGuardandoMarca(false) }
  }

  async function toggle(campo: string, valor: boolean) {
    if (!negocioId) return
    setConfig((c: any) => ({ ...c, [campo]: valor }))
    await updateConfiguracion(negocioId, { [campo]: valor }).catch(() => cargar())
  }
  async function ajustar(campo: string, delta: number, min: number, max: number) {
    if (!negocioId || !config) return
    const v = Math.max(min, Math.min(max, (config[campo] ?? 0) + delta))
    setConfig((c: any) => ({ ...c, [campo]: v }))
    await updateConfiguracion(negocioId, { [campo]: v }).catch(() => cargar())
  }
  async function volverCliente() {
    const ss = await getSesion(); if (!ss) return
    await guardarSesion({ ...ss, rol: 'cliente', perfil_id: undefined }); router.replace('/(app)/cliente/home')
  }
  async function salir() { await cerrarSesion(); await limpiarSesion(); router.replace('/(auth)/login') }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: 72, paddingBottom: 32 }}>
      <Display size={30} style={{ marginBottom: 18 }}>Configuración</Display>

      <Text style={s.sec}>MARCA Y CONTACTO</Text>
      <View style={s.marcaCard}>
        <View style={s.marcaTop}>
          <TouchableOpacity onPress={cambiarLogo} disabled={subiendoLogo} activeOpacity={0.85}>
            <Avatar name={negocio?.nombre} uri={negocio?.logo_url} size={72} bg={COLORS.carbon} />
            <View style={s.logoBadge}>
              {subiendoLogo ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.logoBadgeT}>✎</Text>}
            </View>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.marcaHint}>Toca el logo para cambiarlo.</Text>
            <Text style={s.flabel}>Nombre del local</Text>
            <TextInput style={s.input} placeholder="Barbería…" placeholderTextColor={COLORS.textLight} value={nombre} onChangeText={setNombre} />
          </View>
        </View>

        <Text style={s.flabel}>Eslogan</Text>
        <TextInput style={s.input} placeholder="Tu frase de marca" placeholderTextColor={COLORS.textLight} value={slogan} onChangeText={setSlogan} />

        <Text style={s.flabel}>Dirección</Text>
        <TextInput style={s.input} placeholder="Calle, sector, ciudad" placeholderTextColor={COLORS.textLight} value={direccion} onChangeText={setDireccion} />

        <View style={s.dosCol}>
          <View style={{ flex: 1 }}>
            <Text style={s.flabel}>Teléfono</Text>
            <TextInput style={s.input} placeholder="+1 809…" keyboardType="phone-pad" placeholderTextColor={COLORS.textLight} value={telefono} onChangeText={setTelefono} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.flabel}>Instagram</Text>
            <TextInput style={s.input} placeholder="usuario" autoCapitalize="none" placeholderTextColor={COLORS.textLight} value={ig} onChangeText={setIg} />
          </View>
        </View>

        <TouchableOpacity style={s.guardarBtn} onPress={guardarMarca} disabled={guardandoMarca}>
          {guardandoMarca ? <ActivityIndicator color="#fff" /> : <Text style={s.guardarT}>Guardar marca</Text>}
        </TouchableOpacity>
      </View>

      <Text style={s.sec}>FUNCIONES DEL LOCAL</Text>
      <Toggle label="Sistema de puntos" desc="Clientes acumulan y canjean puntos" value={!!config?.puntos_activos} onChange={(v) => toggle('puntos_activos', v)} />
      <Toggle label="Asignación por dueño" desc="Tú asignas el barbero; el cliente no elige" value={!!config?.asignacion_por_dueno} onChange={(v) => toggle('asignacion_por_dueno', v)} />
      <Toggle label="Doble servicio por visita" desc="Permite combinar corte + manicure" value={!!config?.doble_servicio_activo} onChange={(v) => toggle('doble_servicio_activo', v)} />

      <Text style={s.sec}>TIEMPOS</Text>
      <Stepper label="Anticipación mínima" suf="h" value={config?.anticipacion_minima_horas ?? 2} onMinus={() => ajustar('anticipacion_minima_horas', -1, 0, 48)} onPlus={() => ajustar('anticipacion_minima_horas', 1, 0, 48)} />
      <Stepper label="Ventana de llegada" suf="min" value={config?.ventana_llegada_min ?? 10} onMinus={() => ajustar('ventana_llegada_min', -5, 5, 60)} onPlus={() => ajustar('ventana_llegada_min', 5, 5, 60)} />
      <Stepper label="Gracia de cita" suf="min" value={config?.gracia_cita_min ?? 5} onMinus={() => ajustar('gracia_cita_min', -5, 0, 30)} onPlus={() => ajustar('gracia_cita_min', 5, 0, 30)} />

      <Text style={s.sec}>CUENTA</Text>
      {DEV_LOGIN && <TouchableOpacity style={s.dev} onPress={volverCliente}><Text style={s.devT}>Volver a cliente (dev)</Text></TouchableOpacity>}
      <TouchableOpacity style={s.salir} onPress={salir}><Text style={s.salirT}>Cerrar sesión</Text></TouchableOpacity>
    </ScrollView>
  )
}

function Toggle({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.toggle}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={s.toggleL}>{label}</Text>
        <Text style={s.toggleD}>{desc}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: COLORS.red, false: '#D8D6D1' }} thumbColor="#fff" />
    </View>
  )
}
function Stepper({ label, value, suf, onMinus, onPlus }: { label: string; value: number; suf: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={s.stepper}>
      <Text style={s.toggleL}>{label}</Text>
      <View style={s.stepCtrl}>
        <TouchableOpacity style={s.stepBtn} onPress={onMinus}><Text style={s.stepBtnT}>−</Text></TouchableOpacity>
        <Text style={s.stepVal}>{value} {suf}</Text>
        <TouchableOpacity style={s.stepBtn} onPress={onPlus}><Text style={s.stepBtnT}>+</Text></TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginBottom: 12, marginTop: 14 },
  marcaCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: 16, marginBottom: 4 },
  marcaTop: { flexDirection: 'row', gap: 14, marginBottom: 4 },
  marcaHint: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginBottom: 8 },
  logoBadge: { position: 'absolute', right: -4, bottom: -4, width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.surface },
  logoBadgeT: { color: '#fff', fontSize: 13, fontFamily: FONTS.bold },
  flabel: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textMid, marginBottom: 7, marginTop: 10 },
  input: { backgroundColor: COLORS.bg, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, padding: 13, fontSize: 15, fontFamily: FONTS.medium, color: COLORS.ink },
  dosCol: { flexDirection: 'row', gap: 10 },
  guardarBtn: { backgroundColor: COLORS.carbon, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 16 },
  guardarT: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
  toggle: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 16, marginBottom: 8 },
  toggleL: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  toggleD: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, marginBottom: 8 },
  stepCtrl: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  stepBtnT: { fontFamily: FONTS.bold, fontSize: 20, color: COLORS.ink },
  stepVal: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink, minWidth: 56, textAlign: 'center' },
  dev: { padding: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, marginBottom: 8 },
  devT: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textMid },
  salir: { padding: 16, alignItems: 'center' },
  salirT: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.danger },
})
