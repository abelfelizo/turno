import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Switch, Modal, TextInput, Alert } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getSesion, guardarSesion, limpiarSesion } from '../../../lib/storage'
import { guardarReglasBarbero, getConfiguracion, getNegocioById, getMiUsuario, getMiPerfil, getServiciosPerfil, actualizarEstadoPerfil, actualizarPerfil, actualizarIdentidadBarbero, crearServicio, actualizarServicio, getHorariosPerfil, guardarHorario, getMisMembresias, dejarLocal, eliminarCuenta, getBarberoNegocios, unirseProfesional } from '../../../lib/db'
import { elegirYSubirImagen } from '../../../lib/imagenes'
import { cerrarSesion } from '../../../lib/auth'
import { hora12 } from '../../../lib/format'
import { planDeMiSilla } from '../../../lib/pricing'
import { COLORS, FONTS } from '../../../constants'
import { Display, Avatar } from '../../../components/ui'
import CambiarRol from '../../../components/cambiar-rol'
import PanelBadge from '../../../components/panel-badge'

// Estos tres son la ÚNICA decisión que toma el barbero sobre su estado: si
// acepta clientes. Que esté ocupado o libre lo deduce el sistema de la silla y
// los bloqueos, porque un estado que hay que acordarse de actualizar acaba
// mintiendo — el barbero está cortando pelo, no tocando la app.
// Estos textos dicen la CONSECUENCIA, no el nombre del estado. "En descanso"
// suena a pausa de diez minutos y en realidad te saca de la lista de todos los
// clientes hasta que vuelvas a mano: alguien lo tocó una vez y desapareció sin
// enterarse. Un estado que no explica lo que hace es una trampa.
const ESTADOS = [
  { k: 'disponible', l: 'Acepto clientes', c: COLORS.success,
    d: 'Sales en la app y pueden pedirte turno. Estar ocupado con un cliente NO te saca de la lista: para eso está la fila.' },
  { k: 'descanso', l: 'En descanso', c: COLORS.warning,
    d: 'Por hoy: nadie entra a tu fila ni coge hora para lo que queda del día. Tus citas de mañana en adelante siguen abiertas y quien ya está en tu fila sigue ahí. No vuelves solo — tienes que activarte tú.' },
  { k: 'inactivo', l: 'Inactivo', c: COLORS.textLight,
    d: 'Para ausencias largas: cierra también la agenda futura. Nadie puede reservar contigo para ningún día hasta que vuelvas.' },
]
const DIAS = [{ n: 1, l: 'Lunes' }, { n: 2, l: 'Martes' }, { n: 3, l: 'Miércoles' }, { n: 4, l: 'Jueves' }, { n: 5, l: 'Viernes' }, { n: 6, l: 'Sábado' }, { n: 0, l: 'Domingo' }]

export default function Config() {
  const router = useRouter()
  const [sesion, setSesion] = useState<any>(null)
  const [perfil, setPerfil] = useState<any>(null)
  const [usuario, setUsuario] = useState<any>(null)
  const [servicios, setServicios] = useState<any[]>([])
  const [horarios, setHorarios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  // modales
  const [svModal, setSvModal] = useState<any | 'nuevo' | null>(null)
  const [svN, setSvN] = useState(''); const [svD, setSvD] = useState(30); const [svP, setSvP] = useState('')
  const [hrModal, setHrModal] = useState<any | null>(null)
  const [hrIni, setHrIni] = useState(9); const [hrFin, setHrFin] = useState(18); const [hrBuf, setHrBuf] = useState(10)
  const [busy, setBusy] = useState(false)
  // perfil público (personalización del barbero)
  const [esp, setEsp] = useState(''); const [bio, setBio] = useState(''); const [msg, setMsg] = useState('')
  const [ig, setIg] = useState(''); const [wa, setWa] = useState('')
  const [guardandoPerfil, setGuardandoPerfil] = useState(false)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [rolMembresia, setRolMembresia] = useState<string | null>(null)
  const [negocioNombre, setNegocioNombre] = useState<string | null>(null)
  const [cfgLocal, setCfgLocal] = useState<any>(null)
  const [cfgLocalTipo, setCfgLocalTipo] = useState<string | null>(null)
  const [reglasBusy, setReglasBusy] = useState(false)
  const [premio, setPremio] = useState('')

  async function guardarPremio() {
    if (!sesion?.perfil_id) return
    const v = premio.trim() || 'Corte gratis'
    setPremio(v)
    setPerfil((p: any) => ({ ...p, premio: v }))
    try { await actualizarPerfil(sesion.perfil_id, { premio: v }) }
    catch (e: any) { Alert.alert('No se pudo guardar', e.message ?? 'Intenta de nuevo.') }
  }
  const [locales, setLocales] = useState<any[]>([])
  const [localModal, setLocalModal] = useState(false)
  const [lcCodigo, setLcCodigo] = useState(''); const [lcBusy, setLcBusy] = useState(false)

  const cargar = useCallback(async () => {
    const ss = await getSesion(); setSesion(ss)
    if (!ss?.perfil_id || !ss?.negocio_id) { setLoading(false); return }
    const [u, p, sv, hr, mems, cfg] = await Promise.all([
      getMiUsuario().catch(() => null),
      getMiPerfil(ss.usuario_id, ss.negocio_id).catch(() => null),
      getServiciosPerfil(ss.perfil_id, false).catch(() => []),
      getHorariosPerfil(ss.perfil_id).catch(() => []),
      getMisMembresias(ss.usuario_id).catch(() => []),
      getConfiguracion(ss.negocio_id).catch(() => null),
    ])
    setUsuario(u); setPerfil(p); setServicios(sv as any[]); setHorarios(hr as any[]); setCfgLocal(cfg)
    setPremio((p as any)?.premio ?? 'Corte gratis')
    setRolMembresia((mems as any[]).find(m => m.negocio_id === ss.negocio_id)?.rol ?? null)
    if (ss.usuario_id) {
      const [locs, neg] = await Promise.all([
        getBarberoNegocios(ss.usuario_id).catch(() => []),
        getNegocioById(ss.negocio_id!).catch(() => null),
      ])
      setCfgLocalTipo((neg as any)?.tipo ?? null)
      setLocales(locs as any[])
      setNegocioNombre((locs as any[]).find((l: any) => l.negocio_id === ss.negocio_id)?.nombre ?? null)
    }
    // Identidad (persona, sigue al barbero): foto/bio/especialidad/contactos.
    setEsp(u?.especialidad ?? ''); setBio(u?.bio ?? ''); setIg(u?.instagram ?? ''); setWa(u?.whatsapp ?? '')
    // Mensaje de bienvenida: por local (se queda en el perfil).
    setMsg(p?.mensaje_bienvenida ?? '')
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function cambiarFoto() {
    if (!sesion?.perfil_id) return
    setSubiendoFoto(true)
    try {
      const url = await elegirYSubirImagen('barberos', sesion.perfil_id)
      if (url) { await actualizarIdentidadBarbero({ foto_url: url }); setUsuario((u: any) => ({ ...u, foto_url: url })) }
    } catch (e: any) { Alert.alert('No se pudo subir la foto', e.message ?? 'Intenta de nuevo.') }
    finally { setSubiendoFoto(false) }
  }
  async function guardarPerfil() {
    if (!sesion?.perfil_id) return
    setGuardandoPerfil(true)
    try {
      // Identidad → persona (sigue al barbero). Mensaje de bienvenida → local.
      await actualizarIdentidadBarbero({
        especialidad: esp.trim(), bio: bio.trim(),
        instagram: ig.trim().replace(/^@/, ''), whatsapp: wa.trim(),
      })
      await actualizarPerfil(sesion.perfil_id, { mensaje_bienvenida: msg.trim() })
      Alert.alert('Perfil actualizado', 'Tus clientes verán estos cambios en cualquier local.')
    } catch (e: any) { Alert.alert('No se pudo guardar', e.message ?? 'Intenta de nuevo.') }
    finally { setGuardandoPerfil(false) }
  }
  async function toggleDomicilio(v: boolean) {
    if (!sesion?.perfil_id) return
    setPerfil((p: any) => ({ ...p, domicilio_activo: v }))
    await actualizarPerfil(sesion.perfil_id, { domicilio_activo: v }).catch(() => cargar())
  }
  async function ajustarLimite(delta: number) {
    if (!sesion?.perfil_id) return
    const actual = perfil?.limite_cola ?? 0
    const v = Math.max(0, Math.min(50, actual + delta))
    setPerfil((p: any) => ({ ...p, limite_cola: v }))
    await actualizarPerfil(sesion.perfil_id, { limite_cola: v === 0 ? null : v }).catch(() => cargar())
  }
  async function togglePuntos(v: boolean) {
    if (!sesion?.perfil_id) return
    setPerfil((p: any) => ({ ...p, puntos_activos: v }))
    await actualizarPerfil(sesion.perfil_id, { puntos_activos: v }).catch(() => cargar())
  }
  async function ajustarPuntos(campo: 'puntos_por_visita' | 'puntos_meta' | 'revisita_dias', delta: number, min: number, max: number, def: number) {
    if (!sesion?.perfil_id) return
    const v = Math.max(min, Math.min(max, (perfil?.[campo] ?? def) + delta))
    setPerfil((p: any) => ({ ...p, [campo]: v }))
    await actualizarPerfil(sesion.perfil_id, { [campo]: v }).catch(() => cargar())
  }

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
  /** Guarda las cuatro reglas de golpe. null en un campo = "la del local".
   *  Se mandan todas juntas porque el RPC escribe el bloque entero: mandar una
   *  sola borraría las otras tres. */
  async function guardarReglas(patch: Record<string, number | null>) {
    if (!sesion?.perfil_id) return
    const actual = {
      anticipacion: perfil?.anticipacion_minima_horas ?? null,
      ventana: perfil?.ventana_llegada_min ?? null,
      gracia: perfil?.gracia_cita_min ?? null,
      umbral: perfil?.umbral_confirmacion ?? null,
    }
    const nuevo = { ...actual, ...patch }
    setPerfil((p: any) => ({
      ...p,
      anticipacion_minima_horas: nuevo.anticipacion,
      ventana_llegada_min: nuevo.ventana,
      gracia_cita_min: nuevo.gracia,
      umbral_confirmacion: nuevo.umbral,
    }))
    setReglasBusy(true)
    try { await guardarReglasBarbero(sesion.perfil_id, nuevo) }
    catch (e: any) { Alert.alert('No se pudo guardar', e.message ?? 'Intenta de nuevo.'); cargar() }
    finally { setReglasBusy(false) }
  }

  // Regla de producto: el barbero decide lo suyo salvo que sea empleado.
  const empleado = rolMembresia === 'empleado'

  function horarioDe(n: number) { return horarios.find(h => h.dia_semana === n) }
  function abrirHorario(n: number) {
    const h = horarioDe(n)
    setHrModal({ n, h }); setHrIni(h ? parseInt(h.hora_inicio) : 9); setHrFin(h ? parseInt(h.hora_fin) : 18); setHrBuf(h?.tiempo_entre_clientes ?? 0)
  }
  async function guardarHr(activo: boolean) {
    if (!hrModal) return
    setBusy(true)
    try {
      await guardarHorario({ id: hrModal.h?.id, perfil_id: sesion.perfil_id, dia_semana: hrModal.n, hora_inicio: `${String(hrIni).padStart(2, '0')}:00`, hora_fin: `${String(hrFin).padStart(2, '0')}:00`, tiempo_entre_clientes: hrBuf, activo })
      setHrModal(null); cargar()
    } catch (e: any) { Alert.alert('Error', e.message) } finally { setBusy(false) }
  }
  function salir() {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir? Necesitarás un código nuevo para volver a entrar.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: async () => {
        await cerrarSesion(); await limpiarSesion(); router.replace('/(auth)/login')
      } },
    ])
  }

  async function cambiarLocal(l: any) {
    const ss = await getSesion(); if (!ss || l.negocio_id === ss.negocio_id) return
    await guardarSesion({ ...ss, negocio_id: l.negocio_id, perfil_id: l.perfil_id })
    setLoading(true); cargar()
  }
  async function unirseAOtroLocal() {
    if (!lcCodigo.trim()) { Alert.alert('Falta el código', 'Escribe el código del local.'); return }
    if (!usuario || !perfil) return
    setLcBusy(true)
    try {
      await unirseProfesional({ codigo: lcCodigo.trim(), tipo_servicio: perfil.tipo_servicio, rol: 'empleado', nombre: usuario.nombre, telefono: usuario.telefono })
      setLocalModal(false); setLcCodigo('')
      Alert.alert('Solicitud enviada', 'El dueño del local debe aprobarte. Aparecerá en "Mis locales" cuando te acepte.')
      cargar()
    } catch (e: any) { Alert.alert('No se pudo enviar', e.message ?? 'Revisa el código.') }
    finally { setLcBusy(false) }
  }

  function dejarEsteLocal() {
    if (!sesion?.perfil_id) return
    Alert.alert('Dejar este local',
      'Se cancelarán tus citas futuras y saldrás de la fila. Tu identidad, historial y clientela te siguen (tu código de barbero no cambia).',
      [{ text: 'No' }, { text: 'Sí, dejar el local', style: 'destructive', onPress: async () => {
        try { await dejarLocal(sesion.perfil_id); const ss = await getSesion(); if (ss) await guardarSesion({ ...ss, rol: 'cliente', perfil_id: undefined }); router.replace('/') }
        catch (e: any) { Alert.alert('Error', e.message ?? 'Intenta de nuevo.') }
      } }])
  }
  function eliminarMiCuenta() {
    Alert.alert('Eliminar cuenta',
      'Esto borra tus datos personales, cancela tus citas y turnos futuros y desvincula tus perfiles. No se puede deshacer.',
      [{ text: 'Cancelar' }, { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try { await eliminarCuenta(); await cerrarSesion(); await limpiarSesion(); router.replace('/(auth)/login') }
        catch (e: any) { Alert.alert('Error', e.message ?? 'Intenta de nuevo.') }
      } }])
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: 72, paddingBottom: 32 }}>
      <PanelBadge />
      <Display size={30} style={{ marginBottom: 18 }}>Configuración</Display>

      <Text style={s.sec}>MI PERFIL PÚBLICO</Text>
      <View style={s.perfilCard}>
        <View style={s.perfilTop}>
          <TouchableOpacity onPress={cambiarFoto} disabled={subiendoFoto} activeOpacity={0.85}>
            <Avatar name={usuario?.nombre} uri={usuario?.foto_url} size={72} bg={COLORS.blue} />
            <View style={s.fotoBadge}>
              {subiendoFoto ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.fotoBadgeT}>✎</Text>}
            </View>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            {usuario?.codigo_barbero ? (
              <View style={s.codigoBox}>
                <Text style={s.codigoLbl}>TU CÓDIGO DE BARBERO</Text>
                <Text style={s.codigoVal}>{usuario.codigo_barbero}</Text>
                <Text style={s.codigoHint}>Compártelo: tus clientes te siguen a donde trabajes.</Text>
              </View>
            ) : null}
            <Text style={s.flabel}>Especialidad</Text>
            <TextInput style={s.input} placeholder="Fade, barba, diseño…" placeholderTextColor={COLORS.textLight} value={esp} onChangeText={setEsp} />
          </View>
        </View>

        <Text style={s.flabel}>Sobre mí</Text>
        <TextInput style={[s.input, s.multiline]} placeholder="Cuéntale a tus clientes tu estilo y experiencia." placeholderTextColor={COLORS.textLight} value={bio} onChangeText={setBio} multiline />

        <Text style={s.flabel}>Mensaje de bienvenida</Text>
        <TextInput style={[s.input, s.multiline]} placeholder="Lo verá el cliente al pedir turno contigo." placeholderTextColor={COLORS.textLight} value={msg} onChangeText={setMsg} multiline />

        <View style={s.dosCol}>
          <View style={{ flex: 1 }}>
            <Text style={s.flabel}>Instagram</Text>
            <TextInput style={s.input} placeholder="usuario" autoCapitalize="none" placeholderTextColor={COLORS.textLight} value={ig} onChangeText={setIg} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.flabel}>WhatsApp</Text>
            <TextInput style={s.input} placeholder="+1 809…" keyboardType="phone-pad" placeholderTextColor={COLORS.textLight} value={wa} onChangeText={setWa} />
          </View>
        </View>

        <View style={s.domicilioRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={s.domicilioL}>Servicio a domicilio</Text>
            <Text style={s.domicilioD}>Indica que también atiendes a domicilio.</Text>
          </View>
          <Switch value={!!perfil?.domicilio_activo} onValueChange={toggleDomicilio} trackColor={{ true: COLORS.red, false: '#D8D6D1' }} thumbColor="#fff" />
        </View>

        <TouchableOpacity style={s.guardarBtn} onPress={guardarPerfil} disabled={guardandoPerfil}>
          {guardandoPerfil ? <ActivityIndicator color="#fff" /> : <Text style={s.guardarT}>Guardar perfil</Text>}
        </TouchableOpacity>
      </View>

      <Text style={s.sec}>¿ACEPTAS CLIENTES?</Text>
      <Text style={s.nota}>Si estás ocupado no hace falta tocar nada: la app lo sabe por tu silla. Esto es solo para dejar de aparecer.</Text>
      <View style={{ gap: 8, marginBottom: 14 }}>
        {ESTADOS.map(e => {
          const on = perfil?.estado_actual === e.k
          return (
            <TouchableOpacity key={e.k} style={[s.estado, on && { borderColor: e.c }]} onPress={() => setEstado(e.k)}>
              <View style={[s.dot, { backgroundColor: e.c }]} />
              <View style={{ flex: 1 }}>
                <Text style={[s.estadoT, on && { color: COLORS.ink }]}>{e.l}</Text>
                <Text style={s.estadoD2}>{e.d}</Text>
              </View>
              {on && <Text style={[s.estadoActivo, { color: e.c }]}>Activo</Text>}
            </TouchableOpacity>
          )
        })}
      </View>

      {/* El barbero es autónomo salvo que sea EMPLEADO: ahí los servicios y el
          horario los pone la barbería, y aquí solo se consultan. */}
      <View style={s.secRow}>
        <Text style={s.sec}>{empleado ? 'SERVICIOS DEL LOCAL' : 'MIS SERVICIOS'}</Text>
        {!empleado && <TouchableOpacity onPress={() => abrirServicio()}><Text style={s.accion}>+ Agregar</Text></TouchableOpacity>}
      </View>
      {empleado && <Text style={s.deLocal}>Los define {negocioNombre ?? 'tu barbería'}. Si algo no cuadra, háblalo con el dueño.</Text>}
      {servicios.map((sv: any) => (
        <View key={sv.id} style={[s.serv, !sv.activo && { opacity: 0.5 }]}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => abrirServicio(sv)} disabled={empleado}>
            <Text style={s.servName}>{sv.nombre}</Text><Text style={s.servMeta}>{sv.duracion_min} min</Text>
          </TouchableOpacity>
          <Text style={s.servPrecio}>{sv.precio}</Text>
          {empleado
            ? <Text style={s.servEstado}>{sv.activo ? 'Activo' : 'Inactivo'}</Text>
            : <Switch value={sv.activo} onValueChange={() => toggleSv(sv)} trackColor={{ true: COLORS.red, false: '#D8D6D1' }} thumbColor="#fff" />}
        </View>
      ))}

      <Text style={[s.sec, { marginTop: 18 }]}>{empleado ? 'HORARIO DEL LOCAL' : 'MIS HORARIOS'}</Text>
      {empleado && <Text style={s.deLocal}>Tu jornada la fija la barbería. Para un rato fuera, usa “Bloquear hora” en tu agenda.</Text>}
      {DIAS.map(d => {
        const h = horarioDe(d.n); const abierto = h && h.activo
        return (
          <TouchableOpacity key={d.n} style={s.dia} onPress={() => abrirHorario(d.n)} disabled={empleado}>
            <Text style={s.diaL}>{d.l}</Text>
            <Text style={[s.diaH, !abierto && { color: COLORS.textLight }]}>{abierto ? `${hora12(h.hora_inicio)} – ${hora12(h.hora_fin)}` : 'Cerrado'}</Text>
          </TouchableOpacity>
        )
      })}

      <Text style={[s.sec, { marginTop: 18 }]}>SUSCRIPCIÓN</Text>
      {(() => {
        const plan = planDeMiSilla(rolMembresia, cfgLocalTipo)
        return (
          <View style={s.susCard}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={s.susTitulo}>{plan.titulo}</Text>
              <Text style={s.susDetalle}>{plan.detalle}</Text>
            </View>
            <Text style={s.susMonto}>{plan.montoTexto}</Text>
          </View>
        )
      })()}

      <Text style={[s.sec, { marginTop: 18 }]}>MIS REGLAS</Text>
      <View style={s.regla}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={s.reglaL}>Límite de fila</Text>
          <Text style={s.reglaD}>{(perfil?.limite_cola ?? 0) === 0 ? 'Sin límite' : `Máx. ${perfil.limite_cola} clientes esperando`}</Text>
        </View>
        <View style={s.stepCtrl}>
          <TouchableOpacity style={s.stepBtn} onPress={() => ajustarLimite(-1)}><Text style={s.stepT}>−</Text></TouchableOpacity>
          <Text style={s.stepVal}>{(perfil?.limite_cola ?? 0) === 0 ? '∞' : perfil.limite_cola}</Text>
          <TouchableOpacity style={s.stepBtn} onPress={() => ajustarLimite(1)}><Text style={s.stepT}>+</Text></TouchableOpacity>
        </View>
      </View>

      {/* Las reglas de tiempo eran del local y solo del local, así que el
          dueño se las imponía a alguien que le paga un asiento. Ahora el
          autónomo las suyas; NULL sigue significando "la del local". */}
      {!empleado && (() => {
        const propias = perfil?.anticipacion_minima_horas != null || perfil?.ventana_llegada_min != null
          || perfil?.gracia_cita_min != null || perfil?.umbral_confirmacion != null
        const ant = perfil?.anticipacion_minima_horas ?? cfgLocal?.anticipacion_minima_horas ?? 2
        const ven = perfil?.ventana_llegada_min ?? cfgLocal?.ventana_llegada_min ?? 10
        const gra = perfil?.gracia_cita_min ?? cfgLocal?.gracia_cita_min ?? 5
        const umb = perfil?.umbral_confirmacion ?? cfgLocal?.umbral_confirmacion ?? 2
        return (
          <>
            <Text style={[s.sec, { marginTop: 18 }]}>MIS TIEMPOS</Text>
            <View style={s.regla}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={s.reglaL}>Usar mis propios tiempos</Text>
                <Text style={s.reglaD}>{propias ? 'Mandan los tuyos, no los del local.' : `Ahora sigues los de ${negocioNombre ?? 'la barbería'}.`}</Text>
              </View>
              <Switch value={propias} disabled={reglasBusy}
                onValueChange={(v) => guardarReglas(v
                  ? { anticipacion: ant, ventana: ven, gracia: gra, umbral: umb }
                  : { anticipacion: null, ventana: null, gracia: null, umbral: null })}
                trackColor={{ true: COLORS.red, false: '#D8D6D1' }} thumbColor="#fff" />
            </View>
            {propias && (
              <>
                <ReglaNum l="Reservar con antelación" d={`Nadie te pide cita para dentro de menos de ${ant} h.`}
                  v={ant} suf="h" onSet={(x) => guardarReglas({ anticipacion: Math.max(0, Math.min(48, x)) })} />
                <ReglaNum l="Espera tras llamar" d={`El turno expira si no llega en ${ven} min.`}
                  v={ven} suf="min" paso={5} onSet={(x) => guardarReglas({ ventana: Math.max(5, Math.min(60, x)) })} />
                <ReglaNum l="Tolerancia de cita" d={`Aguantas ${gra} min a quien llega tarde.`}
                  v={gra} suf="min" paso={5} onSet={(x) => guardarReglas({ gracia: Math.max(0, Math.min(60, x)) })} />
                <ReglaNum l="Avisar «voy en camino»" d={`Se activa cuando le quedan ${umb} delante.`}
                  v={umb} suf="" onSet={(x) => guardarReglas({ umbral: Math.max(0, Math.min(10, x)) })} />
              </>
            )}
          </>
        )
      })()}

      {rolMembresia === 'barbero_renta' && (
        <>
          <Text style={[s.sec, { marginTop: 18 }]}>MI PROGRAMA DE FIDELIDAD</Text>
          <View style={s.regla}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={s.reglaL}>Premiar a mis clientes</Text>
              <Text style={s.reglaD}>Tu propia tarjeta, aparte de la del local.</Text>
            </View>
            <Switch value={!!perfil?.puntos_activos} onValueChange={togglePuntos} trackColor={{ true: COLORS.red, false: '#D8D6D1' }} thumbColor="#fff" />
          </View>
          {perfil?.puntos_activos && (
            <>
              {/* Se cuentan recortes, no puntos abstractos, y el premio lo
                  escribes tú: no tiene por qué ser un corte gratis. */}
              <View style={s.regla}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={s.reglaL}>Recortes para el premio</Text>
                  <Text style={s.reglaD}>Cada {perfil?.puntos_meta ?? 8} visitas contigo.</Text>
                </View>
                <View style={s.stepCtrl}>
                  <TouchableOpacity style={s.stepBtn} onPress={() => ajustarPuntos('puntos_meta', -1, 2, 30, 8)}><Text style={s.stepT}>−</Text></TouchableOpacity>
                  <Text style={s.stepVal}>{perfil?.puntos_meta ?? 8}</Text>
                  <TouchableOpacity style={s.stepBtn} onPress={() => ajustarPuntos('puntos_meta', 1, 2, 30, 8)}><Text style={s.stepT}>+</Text></TouchableOpacity>
                </View>
              </View>
              <Text style={s.flabel}>¿Qué se gana?</Text>
              <TextInput style={s.input} value={premio} onChangeText={setPremio}
                onEndEditing={guardarPremio} placeholder="Corte gratis, barba gratis, un refresco…"
                placeholderTextColor={COLORS.textLight} maxLength={60} />
            </>
          )}
        </>
      )}

      <Text style={[s.sec, { marginTop: 18 }]}>RECORDATORIO DE RE-VISITA</Text>
      <View style={s.regla}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={s.reglaL}>Marcar "por recuperar"</Text>
          <Text style={s.reglaD}>Clientes sin venir hace {perfil?.revisita_dias ?? 30} días aparecen para darles seguimiento.</Text>
        </View>
        <View style={s.stepCtrl}>
          <TouchableOpacity style={s.stepBtn} onPress={() => ajustarPuntos('revisita_dias', -5, 5, 180, 30)}><Text style={s.stepT}>−</Text></TouchableOpacity>
          <Text style={s.stepVal}>{perfil?.revisita_dias ?? 30}d</Text>
          <TouchableOpacity style={s.stepBtn} onPress={() => ajustarPuntos('revisita_dias', 5, 5, 180, 30)}><Text style={s.stepT}>+</Text></TouchableOpacity>
        </View>
      </View>

      <Text style={[s.sec, { marginTop: 18 }]}>MIS LOCALES</Text>
      {locales.map((l: any) => {
        const activo = l.negocio_id === sesion?.negocio_id
        return (
          <TouchableOpacity key={l.negocio_id} style={[s.local, activo && s.localOn]} onPress={() => cambiarLocal(l)} disabled={activo}>
            <View style={{ flex: 1 }}>
              <Text style={s.localN}>{l.nombre}</Text>
              <Text style={s.localE}>{activo ? 'Local activo' : 'Toca para cambiar'}</Text>
            </View>
            {activo ? <Ionicons name="checkmark-circle" size={22} color={COLORS.success} /> : <Ionicons name="swap-horizontal" size={20} color={COLORS.textLight} />}
          </TouchableOpacity>
        )
      })}
      <TouchableOpacity style={s.otroLocal} onPress={() => setLocalModal(true)}>
        <Ionicons name="add" size={18} color={COLORS.red} /><Text style={s.otroLocalT}>Trabajar en otro local</Text>
      </TouchableOpacity>

      <CambiarRol />

      <Text style={[s.sec, { marginTop: 18 }]}>CUENTA</Text>
      
      <TouchableOpacity style={s.dejar} onPress={dejarEsteLocal}><Text style={s.dejarT}>Dejar este local</Text></TouchableOpacity>
      <TouchableOpacity style={s.salir} onPress={salir}><Text style={s.salirT}>Cerrar sesión</Text></TouchableOpacity>
      <TouchableOpacity style={s.eliminar} onPress={eliminarMiCuenta}><Text style={s.eliminarT}>Eliminar mi cuenta</Text></TouchableOpacity>

      {/* Modal: trabajar en otro local */}
      <Modal visible={localModal} transparent animationType="slide" onRequestClose={() => setLocalModal(false)}>
        <View style={s.mbg}><View style={s.modal}>
          <Display size={22}>Trabajar en otro local</Display>
          <Text style={s.flabel}>Código del local</Text>
          <TextInput style={s.input} placeholder="Ej. DEM-A2B1" autoCapitalize="characters" placeholderTextColor={COLORS.textLight} value={lcCodigo} onChangeText={setLcCodigo} />
          {/* Ya no se pregunta "¿empleado o rento silla?": la modalidad la pone
              el local y el servidor la deriva de su tipo. */}
          <Text style={s.nota}>Si el local alquila asientos entrarás como independiente; si trabaja con empleados, como empleado. Lo define la barbería.</Text>
          <TouchableOpacity style={s.mbtn} onPress={unirseAOtroLocal} disabled={lcBusy}>{lcBusy ? <ActivityIndicator color="#fff" /> : <Text style={s.mbtnT}>Enviar solicitud</Text>}</TouchableOpacity>
          <TouchableOpacity onPress={() => setLocalModal(false)}><Text style={s.cerrar}>Cancelar</Text></TouchableOpacity>
        </View></View>
      </Modal>

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
          <Text style={s.flabel}>Minutos entre clientes</Text>
          <View style={s.stepRow}>
            <TouchableOpacity style={s.stepBtn} onPress={() => setHrBuf(Math.max(0, hrBuf - 5))}><Text style={s.stepT}>−</Text></TouchableOpacity>
            <Text style={s.stepVal}>{hrBuf} min</Text>
            <TouchableOpacity style={s.stepBtn} onPress={() => setHrBuf(Math.min(60, hrBuf + 5))}><Text style={s.stepT}>+</Text></TouchableOpacity>
          </View>
          <TouchableOpacity style={s.mbtn} onPress={() => guardarHr(true)} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={s.mbtnT}>Abrir este día</Text>}</TouchableOpacity>
          <TouchableOpacity style={s.mbtnGhost} onPress={() => guardarHr(false)} disabled={busy}><Text style={s.mbtnGhostT}>Marcar cerrado</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setHrModal(null)}><Text style={s.cerrar}>Cancelar</Text></TouchableOpacity>
        </View></View>
      </Modal>
    </ScrollView>
  )
}

function ReglaNum({ l, d, v, suf, paso = 1, onSet }: { l: string; d?: string; v: number; suf: string; paso?: number; onSet: (v: number) => void }) {
  return (
    <View style={s.regla}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={s.reglaL}>{l}</Text>
        {d ? <Text style={s.reglaD}>{d}</Text> : null}
      </View>
      <View style={s.stepCtrl}>
        <TouchableOpacity style={s.stepBtn} onPress={() => onSet(v - paso)}><Text style={s.stepT}>−</Text></TouchableOpacity>
        <Text style={s.stepVal}>{v}{suf}</Text>
        <TouchableOpacity style={s.stepBtn} onPress={() => onSet(v + paso)}><Text style={s.stepT}>+</Text></TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginBottom: 12 },
  secRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  perfilCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: 16, marginBottom: 18 },
  perfilTop: { flexDirection: 'row', gap: 14, marginBottom: 4 },
  perfilHint: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginBottom: 8 },
  codigoBox: { backgroundColor: COLORS.carbon, borderRadius: 12, padding: 12, marginBottom: 10 },
  codigoLbl: { fontFamily: FONTS.bold, fontSize: 9, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 },
  codigoVal: { fontFamily: FONTS.display, fontSize: 22, color: '#fff', letterSpacing: 3, marginTop: 2 },
  codigoHint: { fontFamily: FONTS.medium, fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 3 },
  fotoBadge: { position: 'absolute', right: -4, bottom: -4, width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.surface },
  fotoBadgeT: { color: '#fff', fontSize: 13, fontFamily: FONTS.bold },
  multiline: { minHeight: 64, textAlignVertical: 'top' },
  dosCol: { flexDirection: 'row', gap: 10 },
  domicilioRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.borderSoft },
  domicilioL: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.ink },
  domicilioD: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  guardarBtn: { backgroundColor: COLORS.carbon, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 14 },
  guardarT: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
  susCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.carbon, borderRadius: 14, padding: 16, marginBottom: 8 },
  susTitulo: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
  susDetalle: { fontFamily: FONTS.medium, fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 3 },
  susMonto: { fontFamily: FONTS.display, fontSize: 20, color: '#fff' },
  regla: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 16, marginBottom: 8 },
  reglaL: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  reglaD: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  stepCtrl: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  accion: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.blue, marginBottom: 12 },
  estado: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 14, padding: 16 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  estadoD2: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  estadoT: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.textMid, flex: 1 },
  estadoActivo: { fontFamily: FONTS.bold, fontSize: 12 },
  serv: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, marginBottom: 8 },
  servName: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  servMeta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  servPrecio: { fontFamily: FONTS.display, fontSize: 20, color: COLORS.ink },
  servEstado: { fontFamily: FONTS.semibold, fontSize: 11, color: COLORS.textLight, width: 52, textAlign: 'right' },
  nota: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, lineHeight: 17, marginBottom: 6 },
  deLocal: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: -6, marginBottom: 10, lineHeight: 17 },
  dia: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 16, marginBottom: 8 },
  diaL: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  diaH: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink },
  local: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, marginBottom: 8 },
  localOn: { borderColor: COLORS.success },
  localN: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  localE: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  otroLocal: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 14, padding: 13, marginBottom: 8 },
  otroLocalT: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.red },
  rolRow: { flexDirection: 'row', gap: 10 },
  rolChip: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: 'center' },
  rolChipOn: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  rolChipT: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.ink },
  dejar: { padding: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.dangerLight, borderRadius: 12, marginBottom: 8 },
  dejarT: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.danger },
  salir: { padding: 16, alignItems: 'center' },
  salirT: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.danger },
  eliminar: { padding: 12, alignItems: 'center', marginBottom: 12 },
  eliminarT: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textLight, textDecorationLine: 'underline' },
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
