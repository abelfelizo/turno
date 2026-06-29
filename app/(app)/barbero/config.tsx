import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Switch, Modal, TextInput, Alert } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { getSesion, guardarSesion, limpiarSesion } from '../../../lib/storage'
import { getMiPerfil, getServiciosPerfil, actualizarEstadoPerfil, crearServicio, actualizarServicio, getHorariosPerfil, guardarHorario } from '../../../lib/db'
import { cerrarSesion } from '../../../lib/auth'
import { hora12 } from '../../../lib/format'
import { COLORS, FONTS, DEV_LOGIN } from '../../../constants'
import { Display } from '../../../components/ui'

const ESTADOS = [
  { k: 'disponible', l: 'Disponible', c: COLORS.success },
  { k: 'descanso', l: 'En descanso', c: COLORS.warning },
  { k: 'inactivo', l: 'Inactivo', c: COLORS.textLight },
]
const DIAS = [{ n: 1, l: 'Lunes' }, { n: 2, l: 'Martes' }, { n: 3, l: 'Miércoles' }, { n: 4, l: 'Jueves' }, { n: 5, l: 'Viernes' }, { n: 6, l: 'Sábado' }, { n: 0, l: 'Domingo' }]

export default function Config() {
  const router = useRouter()
  const [sesion, setSesion] = useState<any>(null)
  const [perfil, setPerfil] = useState<any>(null)
  const [servicios, setServicios] = useState<any[]>([])
  const [horarios, setHorarios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  // modales
  const [svModal, setSvModal] = useState<any | 'nuevo' | null>(null)
  const [svN, setSvN] = useState(''); const [svD, setSvD] = useState(30); const [svP, setSvP] = useState('')
  const [hrModal, setHrModal] = useState<any | null>(null)
  const [hrIni, setHrIni] = useState(9); const [hrFin, setHrFin] = useState(18)
  const [busy, setBusy] = useState(false)

  const cargar = useCallback(async () => {
    const ss = await getSesion(); setSesion(ss)
    if (!ss?.perfil_id || !ss?.negocio_id) { setLoading(false); return }
    const [p, sv, hr] = await Promise.all([
      getMiPerfil(ss.usuario_id, ss.negocio_id).catch(() => null),
      getServiciosPerfil(ss.perfil_id, false).catch(() => []),
      getHorariosPerfil(ss.perfil_id).catch(() => []),
    ])
    setPerfil(p); setServicios(sv as any[]); setHorarios(hr as any[]); setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function setEstado(k: string) {
    if (!sesion?.perfil_id) return
    setPerfil((p: any) => ({ ...p, estado_actual: k }))
    await actualizarEstadoPerfil(sesion.perfil_id, k).catch(() => cargar())
  }
  function abrirServicio(sv?: any) {
    setSvModal(sv ?? 'nuevo'); setSvN(sv?.nombre ?? ''); setSvD(sv?.duracion_min ?? 30); setSvP(String(sv?.precio ?? ''))
  }
  async function guardarSv() {
    if (!svN.trim() || !svP.trim()) { Alert.alert('Faltan datos', 'Nombre y precio.'); return }
    setBusy(true)
    try {
      if (svModal === 'nuevo') await crearServicio({ perfil_id: sesion.perfil_id, nombre: svN.trim(), duracion_min: svD, precio: Number(svP) })
      else await actualizarServicio(svModal.id, { nombre: svN.trim(), duracion_min: svD, precio: Number(svP) })
      setSvModal(null); cargar()
    } catch (e: any) { Alert.alert('Error', e.message) } finally { setBusy(false) }
  }
  async function toggleSv(sv: any) {
    setServicios(prev => prev.map(x => x.id === sv.id ? { ...x, activo: !x.activo } : x))
    await actualizarServicio(sv.id, { activo: !sv.activo }).catch(() => cargar())
  }
  function horarioDe(n: number) { return horarios.find(h => h.dia_semana === n) }
  function abrirHorario(n: number) {
    const h = horarioDe(n)
    setHrModal({ n, h }); setHrIni(h ? parseInt(h.hora_inicio) : 9); setHrFin(h ? parseInt(h.hora_fin) : 18)
  }
  async function guardarHr(activo: boolean) {
    if (!hrModal) return
    setBusy(true)
    try {
      await guardarHorario({ id: hrModal.h?.id, perfil_id: sesion.perfil_id, dia_semana: hrModal.n, hora_inicio: `${String(hrIni).padStart(2, '0')}:00`, hora_fin: `${String(hrFin).padStart(2, '0')}:00`, activo })
      setHrModal(null); cargar()
    } catch (e: any) { Alert.alert('Error', e.message) } finally { setBusy(false) }
  }
  async function volverCliente() { const ss = await getSesion(); if (!ss) return; await guardarSesion({ ...ss, rol: 'cliente', perfil_id: undefined }); router.replace('/(app)/cliente/home') }
  async function salir() { await cerrarSesion(); await limpiarSesion(); router.replace('/(auth)/login') }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: 72, paddingBottom: 32 }}>
      <Display size={30} style={{ marginBottom: 18 }}>Configuración</Display>

      <Text style={s.sec}>MI ESTADO</Text>
      <View style={{ gap: 8, marginBottom: 14 }}>
        {ESTADOS.map(e => {
          const on = perfil?.estado_actual === e.k
          return (
            <TouchableOpacity key={e.k} style={[s.estado, on && { borderColor: e.c }]} onPress={() => setEstado(e.k)}>
              <View style={[s.dot, { backgroundColor: e.c }]} /><Text style={[s.estadoT, on && { color: COLORS.ink }]}>{e.l}</Text>
              {on && <Text style={[s.estadoActivo, { color: e.c }]}>Activo</Text>}
            </TouchableOpacity>
          )
        })}
      </View>

      <View style={s.secRow}><Text style={s.sec}>MIS SERVICIOS</Text><TouchableOpacity onPress={() => abrirServicio()}><Text style={s.accion}>+ Agregar</Text></TouchableOpacity></View>
      {servicios.map((sv: any) => (
        <View key={sv.id} style={[s.serv, !sv.activo && { opacity: 0.5 }]}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => abrirServicio(sv)}>
            <Text style={s.servName}>{sv.nombre}</Text><Text style={s.servMeta}>{sv.duracion_min} min</Text>
          </TouchableOpacity>
          <Text style={s.servPrecio}>{sv.precio}</Text>
          <Switch value={sv.activo} onValueChange={() => toggleSv(sv)} trackColor={{ true: COLORS.red, false: '#D8D6D1' }} thumbColor="#fff" />
        </View>
      ))}

      <Text style={[s.sec, { marginTop: 18 }]}>MIS HORARIOS</Text>
      {DIAS.map(d => {
        const h = horarioDe(d.n); const abierto = h && h.activo
        return (
          <TouchableOpacity key={d.n} style={s.dia} onPress={() => abrirHorario(d.n)}>
            <Text style={s.diaL}>{d.l}</Text>
            <Text style={[s.diaH, !abierto && { color: COLORS.textLight }]}>{abierto ? `${hora12(h.hora_inicio)} – ${hora12(h.hora_fin)}` : 'Cerrado'}</Text>
          </TouchableOpacity>
        )
      })}

      <Text style={[s.sec, { marginTop: 18 }]}>CUENTA</Text>
      {DEV_LOGIN && <TouchableOpacity style={s.dev} onPress={volverCliente}><Text style={s.devT}>Volver a cliente (dev)</Text></TouchableOpacity>}
      <TouchableOpacity style={s.salir} onPress={salir}><Text style={s.salirT}>Cerrar sesión</Text></TouchableOpacity>

      {/* Modal servicio */}
      <Modal visible={!!svModal} transparent animationType="slide" onRequestClose={() => setSvModal(null)}>
        <View style={s.mbg}><View style={s.modal}>
          <Display size={22}>{svModal === 'nuevo' ? 'Nuevo servicio' : 'Editar servicio'}</Display>
          <Text style={s.flabel}>Nombre</Text>
          <TextInput style={s.input} placeholder="Corte, Barba…" placeholderTextColor={COLORS.textLight} value={svN} onChangeText={setSvN} />
          <Text style={s.flabel}>Precio</Text>
          <TextInput style={s.input} placeholder="500" keyboardType="number-pad" placeholderTextColor={COLORS.textLight} value={svP} onChangeText={setSvP} />
          <Text style={s.flabel}>Duración</Text>
          <View style={s.stepRow}>
            <TouchableOpacity style={s.stepBtn} onPress={() => setSvD(Math.max(5, svD - 5))}><Text style={s.stepT}>−</Text></TouchableOpacity>
            <Text style={s.stepVal}>{svD} min</Text>
            <TouchableOpacity style={s.stepBtn} onPress={() => setSvD(Math.min(180, svD + 5))}><Text style={s.stepT}>+</Text></TouchableOpacity>
          </View>
          <TouchableOpacity style={s.mbtn} onPress={guardarSv} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={s.mbtnT}>Guardar</Text>}</TouchableOpacity>
          <TouchableOpacity onPress={() => setSvModal(null)}><Text style={s.cerrar}>Cancelar</Text></TouchableOpacity>
        </View></View>
      </Modal>

      {/* Modal horario */}
      <Modal visible={!!hrModal} transparent animationType="slide" onRequestClose={() => setHrModal(null)}>
        <View style={s.mbg}><View style={s.modal}>
          <Display size={22}>{DIAS.find(d => d.n === hrModal?.n)?.l}</Display>
          <Text style={s.flabel}>Apertura</Text>
          <View style={s.stepRow}>
            <TouchableOpacity style={s.stepBtn} onPress={() => setHrIni(Math.max(0, hrIni - 1))}><Text style={s.stepT}>−</Text></TouchableOpacity>
            <Text style={s.stepVal}>{hora12(`${String(hrIni).padStart(2, '0')}:00`)}</Text>
            <TouchableOpacity style={s.stepBtn} onPress={() => setHrIni(Math.min(23, hrIni + 1))}><Text style={s.stepT}>+</Text></TouchableOpacity>
          </View>
          <Text style={s.flabel}>Cierre</Text>
          <View style={s.stepRow}>
            <TouchableOpacity style={s.stepBtn} onPress={() => setHrFin(Math.max(hrIni + 1, hrFin - 1))}><Text style={s.stepT}>−</Text></TouchableOpacity>
            <Text style={s.stepVal}>{hora12(`${String(hrFin).padStart(2, '0')}:00`)}</Text>
            <TouchableOpacity style={s.stepBtn} onPress={() => setHrFin(Math.min(24, hrFin + 1))}><Text style={s.stepT}>+</Text></TouchableOpacity>
          </View>
          <TouchableOpacity style={s.mbtn} onPress={() => guardarHr(true)} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={s.mbtnT}>Abrir este día</Text>}</TouchableOpacity>
          <TouchableOpacity style={s.mbtnGhost} onPress={() => guardarHr(false)} disabled={busy}><Text style={s.mbtnGhostT}>Marcar cerrado</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setHrModal(null)}><Text style={s.cerrar}>Cancelar</Text></TouchableOpacity>
        </View></View>
      </Modal>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginBottom: 12 },
  secRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  accion: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.blue, marginBottom: 12 },
  estado: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 14, padding: 16 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  estadoT: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.textMid, flex: 1 },
  estadoActivo: { fontFamily: FONTS.bold, fontSize: 12 },
  serv: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, marginBottom: 8 },
  servName: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  servMeta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  servPrecio: { fontFamily: FONTS.display, fontSize: 20, color: COLORS.ink },
  dia: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 16, marginBottom: 8 },
  diaL: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  diaH: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink },
  dev: { padding: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, marginBottom: 8 },
  devT: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textMid },
  salir: { padding: 16, alignItems: 'center' },
  salirT: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.danger },
  mbg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: COLORS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  flabel: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textMid, marginBottom: 7, marginTop: 12 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, padding: 14, fontSize: 15, fontFamily: FONTS.medium, color: COLORS.ink },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 8 },
  stepBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  stepT: { fontFamily: FONTS.bold, fontSize: 22, color: COLORS.ink },
  stepVal: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.ink },
  mbtn: { backgroundColor: COLORS.red, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 18 },
  mbtnT: { fontFamily: FONTS.bold, fontSize: 16, color: '#fff' },
  mbtnGhost: { padding: 14, alignItems: 'center', marginTop: 6 },
  mbtnGhostT: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.textMid },
  cerrar: { fontFamily: FONTS.semibold, textAlign: 'center', color: COLORS.textLight, fontSize: 14, marginTop: 12 },
})
