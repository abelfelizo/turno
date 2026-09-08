import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, TextInput, Switch, Modal, Alert } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getServiciosPerfil, getHorariosPerfil, crearServicio, actualizarServicio, guardarHorario } from '../../../lib/db'
import { hora12 } from '../../../lib/format'
import { COLORS, FONTS } from '../../../constants'
import { Display } from '../../../components/ui'

const DIAS = [
  { n: 1, l: 'Lunes' }, { n: 2, l: 'Martes' }, { n: 3, l: 'Miércoles' }, { n: 4, l: 'Jueves' },
  { n: 5, l: 'Viernes' }, { n: 6, l: 'Sábado' }, { n: 0, l: 'Domingo' },
]

/**
 * Panel BARBERÍA · servicios y horario de UN empleado.
 *
 * Existe por la regla de producto: el barbero es autónomo salvo que sea
 * empleado, y en ese caso manda la barbería. Sin esta pantalla la regla dejaba
 * al local sin forma de poner precios ni jornada a su propia gente.
 *
 * Escribe sobre el perfil del empleado; RLS lo permite por ser dueño del local
 * (`turno_perfil_admin`), no por ser el perfil.
 */
export default function BarberoDelLocal() {
  const router = useRouter()
  const { perfil, nombre, rol } = useLocalSearchParams<{ perfil: string; nombre?: string; rol?: string }>()
  const [servicios, setServicios] = useState<any[]>([])
  const [horarios, setHorarios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [svModal, setSvModal] = useState<null | 'nuevo' | any>(null)
  const [svNombre, setSvNombre] = useState(''); const [svDur, setSvDur] = useState('30'); const [svPrecio, setSvPrecio] = useState('')
  const [svBusy, setSvBusy] = useState(false)

  const [hrModal, setHrModal] = useState<null | { n: number; h?: any }>(null)
  const [hrIni, setHrIni] = useState(9); const [hrFin, setHrFin] = useState(19); const [hrBuf, setHrBuf] = useState(10)
  const [hrBusy, setHrBusy] = useState(false)

  const cargar = useCallback(async () => {
    if (!perfil) { setLoading(false); return }
    const [sv, hr] = await Promise.all([
      getServiciosPerfil(perfil, false).catch(() => []),
      getHorariosPerfil(perfil).catch(() => []),
    ])
    setServicios(sv as any[]); setHorarios(hr as any[]); setLoading(false)
  }, [perfil])
  useEffect(() => { cargar() }, [cargar])

  function abrirServicio(sv?: any) {
    setSvNombre(sv?.nombre ?? ''); setSvDur(String(sv?.duracion_min ?? 30)); setSvPrecio(String(sv?.precio ?? ''))
    setSvModal(sv ?? 'nuevo')
  }
  async function guardarServicio() {
    if (!svNombre.trim()) { Alert.alert('Falta el nombre', 'Ponle nombre al servicio.'); return }
    setSvBusy(true)
    try {
      const datos = { nombre: svNombre.trim(), duracion_min: Number(svDur) || 30, precio: Number(svPrecio) || 0 }
      if (svModal === 'nuevo') await crearServicio({ perfil_id: perfil, ...datos })
      else await actualizarServicio(svModal.id, datos)
      setSvModal(null); cargar()
    } catch (e: any) { Alert.alert('No se pudo guardar', e.message ?? 'Intenta de nuevo.') }
    finally { setSvBusy(false) }
  }
  async function toggleSv(sv: any) {
    try {
      await actualizarServicio(sv.id, { activo: !sv.activo })
      setServicios(prev => prev.map(x => x.id === sv.id ? { ...x, activo: !x.activo } : x))
    } catch (e: any) { Alert.alert('No se pudo cambiar', e.message ?? 'Intenta de nuevo.') }
  }

  function horarioDe(n: number) { return horarios.find(h => h.dia_semana === n) }
  function abrirHorario(n: number) {
    const h = horarioDe(n)
    setHrIni(h ? Number(String(h.hora_inicio).slice(0, 2)) : 9)
    setHrFin(h ? Number(String(h.hora_fin).slice(0, 2)) : 19)
    setHrBuf(h?.tiempo_entre_clientes ?? 10)
    setHrModal({ n, h })
  }
  async function aplicarHorario(activo: boolean) {
    if (!hrModal) return
    setHrBusy(true)
    try {
      await guardarHorario({
        id: hrModal.h?.id, perfil_id: perfil, dia_semana: hrModal.n,
        hora_inicio: `${String(hrIni).padStart(2, '0')}:00`, hora_fin: `${String(hrFin).padStart(2, '0')}:00`,
        tiempo_entre_clientes: hrBuf, activo,
      })
      setHrModal(null); cargar()
    } catch (e: any) { Alert.alert('No se pudo guardar', e.message ?? 'Intenta de nuevo.') }
    finally { setHrBusy(false) }
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>

  const autonomo = rol === 'barbero_renta'

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: 64, paddingBottom: 40 }}>
      <TouchableOpacity style={s.volver} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={20} color={COLORS.textMid} /><Text style={s.volverT}>Equipo</Text>
      </TouchableOpacity>
      <Display size={28} style={{ marginBottom: 6 }}>{nombre || 'Barbero'}</Display>

      {autonomo ? (
        <View style={s.avisoRenta}>
          <Ionicons name="information-circle-outline" size={18} color={COLORS.textMid} />
          <Text style={s.avisoRentaT}>
            Renta su espacio, así que sus servicios y su horario los decide él. Aquí solo los consultas.
          </Text>
        </View>
      ) : (
        <Text style={s.sub}>Es empleado del local: sus servicios, precios y jornada los pones tú.</Text>
      )}

      <View style={s.secRow}>
        <Text style={s.sec}>SERVICIOS</Text>
        {!autonomo && <TouchableOpacity onPress={() => abrirServicio()}><Text style={s.accion}>+ Agregar</Text></TouchableOpacity>}
      </View>
      {servicios.length === 0 && <Text style={s.empty}>Todavía no tiene servicios.</Text>}
      {servicios.map((sv: any) => (
        <View key={sv.id} style={[s.serv, !sv.activo && { opacity: 0.5 }]}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => abrirServicio(sv)} disabled={autonomo}>
            <Text style={s.servName}>{sv.nombre}</Text>
            <Text style={s.servMeta}>{sv.duracion_min} min</Text>
          </TouchableOpacity>
          <Text style={s.servPrecio}>{sv.precio}</Text>
          {autonomo
            ? <Text style={s.servEstado}>{sv.activo ? 'Activo' : 'Inactivo'}</Text>
            : <Switch value={sv.activo} onValueChange={() => toggleSv(sv)} trackColor={{ true: COLORS.red, false: '#D8D6D1' }} thumbColor="#fff" />}
        </View>
      ))}

      <Text style={[s.sec, { marginTop: 18 }]}>HORARIO</Text>
      {DIAS.map(d => {
        const h = horarioDe(d.n); const abierto = h && h.activo
        return (
          <TouchableOpacity key={d.n} style={s.dia} onPress={() => abrirHorario(d.n)} disabled={autonomo}>
            <Text style={s.diaL}>{d.l}</Text>
            <Text style={[s.diaH, !abierto && { color: COLORS.textLight }]}>
              {abierto ? `${hora12(h.hora_inicio)} – ${hora12(h.hora_fin)}` : 'Cerrado'}
            </Text>
          </TouchableOpacity>
        )
      })}

      <Modal visible={!!svModal} transparent animationType="slide" onRequestClose={() => setSvModal(null)}>
        <View style={s.modalBg}>
          <View style={s.modal}>
            <Display size={22}>{svModal === 'nuevo' ? 'Nuevo servicio' : 'Editar servicio'}</Display>
            <Text style={s.flabel}>Nombre</Text>
            <TextInput style={s.input} value={svNombre} onChangeText={setSvNombre} placeholder="Corte, barba…" placeholderTextColor={COLORS.textLight} />
            <Text style={s.flabel}>Duración (min)</Text>
            <TextInput style={s.input} value={svDur} onChangeText={setSvDur} keyboardType="number-pad" />
            <Text style={s.flabel}>Precio</Text>
            <TextInput style={s.input} value={svPrecio} onChangeText={setSvPrecio} keyboardType="number-pad" />
            <TouchableOpacity style={s.btn} onPress={guardarServicio} disabled={svBusy}>
              {svBusy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnT}>Guardar</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSvModal(null)}><Text style={s.cerrar}>Cancelar</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!hrModal} transparent animationType="slide" onRequestClose={() => setHrModal(null)}>
        <View style={s.modalBg}>
          <View style={s.modal}>
            <Display size={22}>{DIAS.find(d => d.n === hrModal?.n)?.l}</Display>
            <Text style={s.flabel}>Abre</Text>
            <Paso valor={hora12(`${String(hrIni).padStart(2, '0')}:00`)} menos={() => setHrIni(Math.max(0, hrIni - 1))} mas={() => setHrIni(Math.min(23, hrIni + 1))} />
            <Text style={s.flabel}>Cierra</Text>
            <Paso valor={hora12(`${String(hrFin).padStart(2, '0')}:00`)} menos={() => setHrFin(Math.max(hrIni + 1, hrFin - 1))} mas={() => setHrFin(Math.min(24, hrFin + 1))} />
            <Text style={s.flabel}>Minutos entre clientes</Text>
            <Paso valor={`${hrBuf} min`} menos={() => setHrBuf(Math.max(0, hrBuf - 5))} mas={() => setHrBuf(Math.min(60, hrBuf + 5))} />
            <TouchableOpacity style={s.btn} onPress={() => aplicarHorario(true)} disabled={hrBusy}>
              {hrBusy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnT}>Guardar</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => aplicarHorario(false)} disabled={hrBusy}>
              <Text style={s.cerrarRojo}>Marcar cerrado este día</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setHrModal(null)}><Text style={s.cerrar}>Cancelar</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

function Paso({ valor, menos, mas }: { valor: string; menos: () => void; mas: () => void }) {
  return (
    <View style={s.stepRow}>
      <TouchableOpacity style={s.stepBtn} onPress={menos}><Text style={s.stepT}>−</Text></TouchableOpacity>
      <Text style={s.stepVal}>{valor}</Text>
      <TouchableOpacity style={s.stepBtn} onPress={mas}><Text style={s.stepT}>+</Text></TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  volver: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  volverT: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.textMid },
  sub: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textLight, marginBottom: 18, lineHeight: 18 },
  avisoRenta: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: COLORS.surfaceAlt, borderRadius: 12, padding: 12, marginBottom: 18 },
  avisoRentaT: { flex: 1, fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textMid, lineHeight: 17 },
  secRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginBottom: 12 },
  accion: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.red, marginBottom: 12 },
  empty: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, paddingVertical: 12 },
  serv: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, marginBottom: 8 },
  servName: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  servMeta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  servPrecio: { fontFamily: FONTS.display, fontSize: 20, color: COLORS.ink },
  servEstado: { fontFamily: FONTS.semibold, fontSize: 11, color: COLORS.textLight, width: 52, textAlign: 'right' },
  dia: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 14, marginBottom: 8 },
  diaL: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.ink },
  diaH: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textMid },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: COLORS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  flabel: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textMid, marginBottom: 7, marginTop: 12 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, padding: 14, fontSize: 15, fontFamily: FONTS.medium, color: COLORS.ink },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 8 },
  stepBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  stepT: { fontFamily: FONTS.bold, fontSize: 22, color: COLORS.ink },
  stepVal: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.ink },
  btn: { backgroundColor: COLORS.red, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 20 },
  btnT: { fontFamily: FONTS.bold, fontSize: 16, color: '#fff' },
  cerrar: { fontFamily: FONTS.semibold, textAlign: 'center', color: COLORS.textLight, fontSize: 14, marginTop: 14 },
  cerrarRojo: { fontFamily: FONTS.semibold, textAlign: 'center', color: COLORS.red, fontSize: 14, marginTop: 14 },
})
