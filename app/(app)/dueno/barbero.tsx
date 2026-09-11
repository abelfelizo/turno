import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, TextInput, Switch, Alert } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getServiciosPerfil, getHorariosPerfil, crearServicio, actualizarServicio, guardarHorario, cambiarModalidad, getRolDePerfil, getPerfilPorId, suspenderBarbero, desvincularBarbero, getNegocioById } from '../../../lib/db'
import { getSesion } from '../../../lib/storage'
import { enviarPush } from '../../../lib/notificaciones'
import { hora12 } from '../../../lib/format'
import { COLORS, FONTS } from '../../../constants'
import { Display } from '../../../components/ui'
import Hoja from '../../../components/hoja'
import Resenas from '../../../components/resenas'

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
  // El parámetro solo sirve para pintar algo mientras carga. La verdad se
  // pregunta a la base en `cargar()`: si esto se queda como única fuente y llega
  // vacío, la pantalla asume "empleado" y le ofrece al dueño editar los
  // servicios de alguien que le renta el asiento.
  const [modalidad, setModalidad] = useState<string>(rol || 'empleado')
  const [servicios, setServicios] = useState<any[]>([])
  const [horarios, setHorarios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [svModal, setSvModal] = useState<null | 'nuevo' | any>(null)
  const [svNombre, setSvNombre] = useState(''); const [svDur, setSvDur] = useState('30'); const [svPrecio, setSvPrecio] = useState('')
  const [svBusy, setSvBusy] = useState(false)

  const [hrModal, setHrModal] = useState<null | { n: number; h?: any }>(null)
  const [hrIni, setHrIni] = useState(9); const [hrFin, setHrFin] = useState(19); const [hrBuf, setHrBuf] = useState(10)
  const [hrBusy, setHrBusy] = useState(false)
  const [modBusy, setModBusy] = useState(false)
  // Suspensión y baja: las dos decisiones sobre ESTA persona, aquí y no en la
  // lista del panel, donde el botón rojo estaba a un toque de distancia.
  const [perfilRow, setPerfilRow] = useState<any>(null)
  const [suspBusy, setSuspBusy] = useState(false)
  const [verResenas, setVerResenas] = useState(false)
  // La modalidad del LOCAL, que desde la migración 98 decide si aquí se puede
  // nombrar empleado a alguien. Donde alquilas asientos no hay suscripción del
  // local de la que salga el aporte de un empleado, así que nombrarlo sería
  // dirigirlo gratis — y el servidor lo rechaza.
  const [tipoLocal, setTipoLocal] = useState<string | null>(null)

  async function aplicarModalidad(nuevo: 'empleado' | 'barbero_renta') {
    if (nuevo === modalidad) return
    setModBusy(true)
    try { await cambiarModalidad(perfil, nuevo); setModalidad(nuevo) }
    catch (e: any) { Alert.alert('No se pudo cambiar', e.message ?? 'Intenta de nuevo.') }
    finally { setModBusy(false) }
  }

  const cargar = useCallback(async () => {
    if (!perfil) { setLoading(false); return }
    const ss = await getSesion()
    const [sv, hr, rl, pf, neg] = await Promise.all([
      getServiciosPerfil(perfil, false).catch(() => []),
      getHorariosPerfil(perfil).catch(() => []),
      getRolDePerfil(perfil).catch(() => null),
      getPerfilPorId(perfil).catch(() => null),
      ss?.negocio_id ? getNegocioById(ss.negocio_id).catch(() => null) : Promise.resolve(null),
    ])
    if (rl) setModalidad(rl)
    setServicios(sv as any[]); setHorarios(hr as any[]); setPerfilRow(pf)
    setTipoLocal((neg as any)?.tipo ?? null); setLoading(false)
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
    setHrBuf(h?.tiempo_entre_clientes ?? 0)
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

  /**
   * SUSPENDER: parar unos días sin echar a nadie.
   *
   * Antes solo existía desvincular, que cancela sus citas futuras y lo saca del
   * local. Para el empleado que no viene esta semana la única salida era echarlo
   * y volver a aprobarlo, así que no se usaba ninguna de las dos y el barbero
   * seguía saliendo disponible en la app mientras no estaba.
   */
  function cambiarSuspension() {
    const activa = !!perfilRow?.suspendido
    if (activa) {
      Alert.alert('Reanudar', `${nombre || 'Este barbero'} vuelve a recibir turnos y citas desde ahora.`, [
        { text: 'Ahora no' },
        { text: 'Reanudar', onPress: async () => {
          setSuspBusy(true)
          try { await suspenderBarbero(perfil, false); await cargar() }
          catch (e: any) { Alert.alert('No se pudo', e.message ?? 'Intenta de nuevo.') }
          finally { setSuspBusy(false) }
        } },
      ])
      return
    }
    // LO QUE SUSPENDER HACE DE VERDAD DEPENDE DE A QUIÉN (migración 92).
    //
    // Este texto decía «él no podrá llamar ni atender» para todo el mundo, y
    // para un AUTÓNOMO es falso desde la 92: al que te paga renta le quitas la
    // fila y la fachada del local, no su negocio. Sigue atendiendo a quien tenga
    // delante, con su agenda y su dinero. Si pudieras apagarle la app no serías
    // su casero, serías su jefe — y entonces no es un alquiler.
    //
    // Prometerle al dueño un poder que el servidor le va a negar es la forma más
    // rápida de que deje de creerse los avisos que sí son ciertos.
    const esAutonomo = modalidad === 'barbero_renta'
    Alert.alert('Suspender temporalmente',
      esAutonomo
        ? `Sale de la fila y de la fachada del local: nadie podrá pedirle turno ni reservarle cita por la app. Paga su asiento, así que su agenda y sus clientes siguen siendo suyos y puede seguir atendiendo a quien tenga delante. Para sacarlo del local, desvincular.`
        : `Deja de entrarle trabajo: nadie podrá pedirle turno ni reservarle cita, y él no podrá llamar ni atender. Sus citas ya reservadas y su fila NO se tocan — para eso está desvincular.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Suspender', style: 'destructive', onPress: async () => {
          setSuspBusy(true)
          try {
            await suspenderBarbero(perfil, true, 'no está atendiendo por ahora')
            if (perfilRow?.usuario_id) {
              enviarPush(perfilRow.usuario_id, 'Te suspendieron temporalmente',
                esAutonomo
                  ? 'Saliste de la fila del local. Tu agenda y tus clientes siguen siendo tuyos.'
                  : 'No te entrarán turnos ni citas hasta que el local te reanude.', { tipo: 'agenda' })
            }
            await cargar()
          }
          catch (e: any) { Alert.alert('No se pudo', e.message ?? 'Intenta de nuevo.') }
          finally { setSuspBusy(false) }
        } },
      ])
  }

  function desvincular() {
    Alert.alert('Desvincular del local',
      `¿Sacar a ${nombre || 'este barbero'} del local? Se cancelan sus citas futuras y sale de la fila. Su historial y su clientela lo acompañan a donde vaya.`,
      [{ text: 'No' }, { text: 'Sí, desvincular', style: 'destructive', onPress: async () => {
        try {
          await desvincularBarbero(perfil)
          if (perfilRow?.usuario_id) {
            enviarPush(perfilRow.usuario_id, 'Te desvincularon', 'Ya no atiendes en este local.', { tipo: 'agenda' })
          }
          router.back()
        } catch (e: any) { Alert.alert('Error', e.message ?? 'Intenta de nuevo.') }
      } }])
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>

  const autonomo = modalidad === 'barbero_renta'
  const localDeAlquiler = tipoLocal === 'espacios_rentados'

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: 64, paddingBottom: 40 }}>
      <TouchableOpacity style={s.volver} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={20} color={COLORS.textMid} /><Text style={s.volverT}>Equipo</Text>
      </TouchableOpacity>
      <Display size={28} style={{ marginBottom: 6 }}>{nombre || 'Barbero'}</Display>

      {/* La modalidad la hereda del tipo del local, pero una barbería de
          EMPLEADOS puede alquilar un asiento suelto. Ese cambio es del dueño: el
          barbero nunca se lo concede a sí mismo.

          AL REVÉS NO (migración 98): en un local de asientos alquilados no se
          puede nombrar empleado a nadie, porque sería dirigirlo sin aportar
          nada a su app — allí cada silla paga la suya. El servidor lo rechaza;
          aquí ni se ofrece, que es distinto de ofrecerlo y dar error. Para tener
          empleados de verdad, se cambia la modalidad DEL LOCAL, y entonces la
          barbería pasa a pagar por ellos. */}
      <Text style={s.flabelTop}>CÓMO TRABAJA AQUÍ</Text>
      {localDeAlquiler ? (
        <>
          <View style={s.modRow}>
            <View style={[s.modChip, s.modChipOn]}><Text style={[s.modChipT, { color: '#fff' }]}>Renta su asiento</Text></View>
          </View>
          <Text style={s.sub}>
            Aquí alquilas asientos, así que cada barbero es su propio negocio: paga su silla y
            decide sus servicios, precios y horario. Si quieres tener empleados, cámbialo en
            Configuración → Cómo trabaja tu local; el local pasa a pagar por ellos.
          </Text>
        </>
      ) : (
        <>
          <View style={s.modRow}>
            <TouchableOpacity style={[s.modChip, !autonomo && s.modChipOn]} onPress={() => aplicarModalidad('empleado')} disabled={modBusy}>
              <Text style={[s.modChipT, !autonomo && { color: '#fff' }]}>Empleado</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.modChip, autonomo && s.modChipOn]} onPress={() => aplicarModalidad('barbero_renta')} disabled={modBusy}>
              <Text style={[s.modChipT, autonomo && { color: '#fff' }]}>Renta su asiento</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.sub}>
            {autonomo
              ? 'Paga su asiento, así que sus servicios, precios y horario los decide él. Aquí solo los consultas.'
              : 'Es empleado del local: sus servicios, precios y jornada los pones tú.'}
          </Text>
        </>
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

      {/* LO QUE DICEN SUS CLIENTES. El dueño reparte trabajo y decide a quién
          sube el precio o a quién manda a formarse: sin leer esto lo hace a
          ciegas, y las reseñas llevaban desde el principio guardándose para
          nadie. */}
      <TouchableOpacity style={[s.accionFila, { marginTop: 22 }]} onPress={() => setVerResenas(true)}>
        <Ionicons name="star-outline" size={20} color={COLORS.ink} />
        <View style={{ flex: 1 }}>
          <Text style={s.accionFilaT}>Reseñas de sus clientes</Text>
          <Text style={s.accionFilaD}>Promedio, reparto de estrellas y lo que escribieron.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
      </TouchableOpacity>

      <Resenas perfilId={perfil} nombre={nombre} visible={verResenas} onClose={() => setVerResenas(false)} />

      {/* ── LO QUE SE DECIDE SOBRE ESTA PERSONA ─────────────────────────────
          Las dos juntas y en este orden a propósito: suspender es lo que casi
          siempre se quiere —dos días, una semana— y desvincular es la que no
          tiene vuelta. Cada una dice lo que hace ANTES de tocarla. */}
      <Text style={[s.sec, { marginTop: 26 }]}>SU SITIO EN EL LOCAL</Text>

      <TouchableOpacity style={[s.accionFila, perfilRow?.suspendido && s.accionFilaOn]} onPress={cambiarSuspension} disabled={suspBusy}>
        <Ionicons name={perfilRow?.suspendido ? 'play-circle-outline' : 'pause-circle-outline'} size={20}
          color={perfilRow?.suspendido ? COLORS.success : COLORS.ink} />
        <View style={{ flex: 1 }}>
          <Text style={s.accionFilaT}>{perfilRow?.suspendido ? 'Reanudar' : 'Suspender temporalmente'}</Text>
          <Text style={s.accionFilaD}>
            {perfilRow?.suspendido
              ? 'Ahora mismo no le entra trabajo. Toca para que vuelva a recibir turnos y citas.'
              : 'Deja de entrarle trabajo sin sacarlo del local. Sus citas y su fila no se tocan.'}
          </Text>
        </View>
        {suspBusy ? <ActivityIndicator color={COLORS.textMid} /> : null}
      </TouchableOpacity>

      <TouchableOpacity style={s.accionFila} onPress={desvincular}>
        <Ionicons name="person-remove-outline" size={20} color={COLORS.danger} />
        <View style={{ flex: 1 }}>
          <Text style={[s.accionFilaT, { color: COLORS.danger }]}>Desvincular del local</Text>
          <Text style={s.accionFilaD}>Se cancelan sus citas futuras y sale de la fila. No tiene vuelta atrás.</Text>
        </View>
      </TouchableOpacity>

      <Hoja visible={!!svModal} onClose={() => setSvModal(null)}>
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
      </Hoja>

      <Hoja visible={!!hrModal} onClose={() => setHrModal(null)}>
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
      </Hoja>
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
  accionFila: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, marginBottom: 8 },
  accionFilaOn: { borderColor: COLORS.success },
  accionFilaT: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  accionFilaD: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.textMid, marginTop: 3, lineHeight: 17 },
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  volver: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  volverT: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.textMid },
  sub: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textLight, marginBottom: 18, lineHeight: 18 },
  flabelTop: { fontFamily: FONTS.bold, fontSize: 11, color: COLORS.textLight, letterSpacing: 1, marginTop: 6, marginBottom: 8 },
  modRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  modChip: { flex: 1, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, paddingVertical: 11, alignItems: 'center', backgroundColor: COLORS.surface },
  modChipOn: { backgroundColor: COLORS.carbon, borderColor: COLORS.carbon },
  modChipT: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.ink },
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
