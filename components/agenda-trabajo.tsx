import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert, Modal, TextInput, Share } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { getCitasHoy, getColaActiva, llamarSiguiente, actualizarEstadoCola, actualizarEstadoCita, getServiciosPerfil, registrarFisico, crearBloqueo, getNegocioById, getPreferenciasCliente, getNotaBarbero, getMiUsuario, getCanjeActivoCliente, aplicarCanje } from '../lib/db'
import { hora12, fechaLarga, fechaISOLocal } from '../lib/format'
import { avisarTurno, recordarCita } from '../lib/whatsapp'
import { enviarPush } from '../lib/notificaciones'
import { suscribirCola, suscribirCitas, desuscribir } from '../lib/realtime'
import { getSesion } from '../lib/storage'
import { COLORS, FONTS } from '../constants'
import { Display, Avatar, Badge } from './ui'

/** Agenda de trabajo: la usa el barbero y el dueño-que-atiende. Opera sobre sesion.perfil_id. */
export default function AgendaTrabajo({ titulo = 'Mi agenda' }: { titulo?: string }) {
  const [citas, setCitas] = useState<any[]>([])
  const [cola, setCola] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sesion, setSesion] = useState<any>(null)
  const [usuario, setUsuario] = useState<any>(null)
  const [negocio, setNegocio] = useState<any>(null)
  const [vale, setVale] = useState<any>(null)
  const [servicios, setServicios] = useState<any[]>([])
  const [walkin, setWalkin] = useState(false)
  const [wNombre, setWNombre] = useState('')
  const [wTel, setWTel] = useState('')
  const [wServ, setWServ] = useState<any>(null)
  const [wEnviando, setWEnviando] = useState(false)
  const [bloq, setBloq] = useState(false)
  const [bIni, setBIni] = useState(12); const [bFin, setBFin] = useState(13); const [bMotivo, setBMotivo] = useState('')
  const [bEnviando, setBEnviando] = useState(false)
  const [ficha, setFicha] = useState<any>(null)

  const cargar = useCallback(async () => {
    const ss = await getSesion(); setSesion(ss)
    if (!ss?.perfil_id) { setLoading(false); return }
    const [c, q, sv, neg, u] = await Promise.all([getCitasHoy(ss.perfil_id), getColaActiva(ss.negocio_id!, ss.perfil_id), getServiciosPerfil(ss.perfil_id).catch(() => []), getNegocioById(ss.negocio_id!).catch(() => null), getMiUsuario().catch(() => null)])
    setCitas(c as any[]); setCola(q as any[]); setServicios(sv as any[]); setNegocio(neg); setUsuario(u); setLoading(false); setRefreshing(false)
  }, [])

  async function agregarFisico() {
    if (!wNombre.trim() || !wServ) { Alert.alert('Faltan datos', 'Nombre y servicio.'); return }
    setWEnviando(true)
    try {
      await registrarFisico({ negocio_id: sesion.negocio_id, perfil_id: sesion.perfil_id, servicio_id: wServ.id, nombre: wNombre.trim(), telefono: wTel.trim() })
      setWalkin(false); setWNombre(''); setWTel(''); setWServ(null); cargar()
    } catch (e: any) { Alert.alert('No se pudo agregar', e.message ?? 'Intenta de nuevo.') }
    finally { setWEnviando(false) }
  }

  async function guardarBloqueo() {
    setBEnviando(true)
    try {
      const hoy = fechaISOLocal()
      await crearBloqueo({ perfil_id: sesion.perfil_id, fecha: hoy, hora_inicio: `${String(bIni).padStart(2, '0')}:00`, hora_fin: `${String(bFin).padStart(2, '0')}:00`, motivo: bMotivo.trim() || undefined })
      setBloq(false); setBMotivo(''); Alert.alert('Hora bloqueada', 'Ese rango no estará disponible para citas hoy.')
    } catch (e: any) { Alert.alert('No se pudo bloquear', e.message ?? 'Intenta de nuevo.') }
    finally { setBEnviando(false) }
  }

  useEffect(() => {
    cargar()
    let subCola: any, subCitas: any
    getSesion().then(ss => {
      if (!ss?.perfil_id) return
      subCola = suscribirCola(ss.negocio_id!, () => cargar())
      subCitas = suscribirCitas(ss.perfil_id!, fechaISOLocal(), () => cargar())
    })
    return () => { if (subCola) desuscribir(subCola); if (subCitas) desuscribir(subCitas) }
  }, [cargar])

  // Ficha del cliente llamado (preferencias + nota privada del barbero).
  const llamadoClienteId = cola.find(c => c.estado === 'llamado' || c.estado === 'en_camino')?.cliente_id
  useEffect(() => {
    if (!llamadoClienteId || !sesion?.negocio_id) { setFicha(null); setVale(null); return }
    Promise.all([
      getPreferenciasCliente(llamadoClienteId, sesion.negocio_id).catch(() => null),
      sesion?.usuario_id ? getNotaBarbero(sesion.usuario_id, llamadoClienteId).catch(() => '') : Promise.resolve(''),
      getCanjeActivoCliente(llamadoClienteId, sesion.negocio_id).catch(() => null),
    ]).then(([p, nota, v]) => { setFicha({ ...(p || {}), nota }); setVale(v) })
  }, [llamadoClienteId, sesion?.negocio_id, sesion?.usuario_id])

  async function aplicarVale() {
    if (!vale) return
    try { await aplicarCanje(vale.id); setVale(null); Alert.alert('Vale aplicado', 'El premio se descontó del cobro.') }
    catch (e: any) { Alert.alert('Error', e.message ?? 'Intenta de nuevo.') }
  }

  async function llamar() {
    try {
      const r = await llamarSiguiente(sesion.negocio_id, sesion.perfil_id)
      if (!r) { Alert.alert('Sin cola', 'Nadie esperando o hay una cita confirmada en curso.') }
      else if (r.cliente_id) {
        enviarPush(r.cliente_id, 'Es tu turno', `Acércate a ${negocio?.nombre ?? 'el local'}, ya casi te toca.`, { tipo: 'turno' })
      }
      cargar()
    } catch (e: any) { Alert.alert('No se pudo llamar', e.message ?? 'Intenta de nuevo.') }
  }
  function atenderCola(item: any) {
    Alert.alert('Atender', `¿Marcar a ${item.turno_usuarios?.nombre ?? 'cliente'} como atendido?`, [
      { text: 'No' }, { text: 'Sí', onPress: async () => { try { await actualizarEstadoCola(item.id, 'atendido', { atendido_at: new Date().toISOString() }); cargar() } catch (e: any) { Alert.alert('Error', e.message) } } },
    ])
  }
  function accionCita(c: any) {
    const opts: any[] = [{ text: 'Cerrar', style: 'cancel' }]
    if (c.estado === 'confirmada' || c.estado === 'en_camino') opts.unshift({ text: 'Marcar atendida', onPress: async () => { await actualizarEstadoCita(c.id, 'atendida', { atendida_at: new Date().toISOString() }); cargar() } })
    if (c.estado === 'creada') opts.unshift({ text: 'Marcar no llegó', style: 'destructive', onPress: async () => { await actualizarEstadoCita(c.id, 'no_llego'); cargar() } })
    if (c.turno_usuarios?.telefono) opts.unshift({ text: 'Recordar por WhatsApp', onPress: () => recordarCita(c.turno_usuarios.telefono, c.turno_usuarios?.nombre ?? 'cliente', c.hora_inicio, negocio?.nombre ?? 'tu barbería') })
    Alert.alert(c.turno_usuarios?.nombre ?? 'Cita', `${c.turno_servicios?.nombre} · ${hora12(c.hora_inicio)}`, opts)
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={COLORS.red} size="large" /></View>

  const n1 = cola.filter(c => c.prioridad === 1).length
  const n2 = cola.filter(c => c.prioridad === 2).length
  const n3 = cola.filter(c => c.prioridad === 3).length
  const llamado = cola.find(c => c.estado === 'llamado' || c.estado === 'en_camino')
  const enFila = cola.filter(c => c.estado === 'en_fila')
  const badgeCita = (e: string) => e === 'confirmada' ? 'success' : e === 'no_llego' || e === 'no_confirmada' ? 'red' : e === 'en_camino' ? 'blue' : 'gray'

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: 72, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar() }} />}>
      <Text style={s.kicker}>{fechaLarga()}</Text>
      <Display size={30} style={{ marginBottom: 16 }}>{titulo}</Display>

      {usuario?.codigo_barbero ? (
        <View style={s.codigoCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.codigoLbl}>TU CÓDIGO DE BARBERO</Text>
            <Text style={s.codigoVal}>{usuario.codigo_barbero}</Text>
          </View>
          <TouchableOpacity style={s.codigoShare} onPress={() => Share.share({ message: `Reserva conmigo en Turno con mi código de barbero ${usuario.codigo_barbero}` })}>
            <Ionicons name="share-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={s.colaBox}>
        <Text style={s.colaTitle}>COLA AHORA</Text>
        <View style={s.colaStats}>
          <Grupo n={n1} l="Prioritario" />
          <Grupo n={n2} l="Digital" />
          <Grupo n={n3} l="Físico" />
          <Grupo n={cola.length} l="Total" hl />
        </View>
      </View>

      {llamado && (
        <View style={s.llamado}>
          <View style={{ flex: 1 }}>
            <Text style={s.llamadoLbl}>{llamado.estado === 'en_camino' ? 'EN CAMINO' : 'LLAMADO'}</Text>
            <Text style={s.llamadoName}>{llamado.turno_usuarios?.nombre ?? 'Cliente'}</Text>
            <Text style={s.llamadoServ}>{llamado.turno_servicios?.nombre}</Text>
          </View>
          <View style={{ gap: 6, alignItems: 'flex-end' }}>
            <TouchableOpacity style={s.atenderBtn} onPress={() => atenderCola(llamado)}><Text style={s.atenderT}>Atender</Text></TouchableOpacity>
            {llamado.turno_usuarios?.telefono ? (
              <TouchableOpacity style={s.avisarBtn} onPress={() => avisarTurno(llamado.turno_usuarios.telefono, llamado.turno_usuarios?.nombre ?? 'cliente', negocio?.nombre ?? 'el local')}>
                <Ionicons name="logo-whatsapp" size={14} color="#fff" /><Text style={s.avisarT}>Avisar</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      )}

      {llamado && vale && (
        <TouchableOpacity style={s.valeBar} onPress={aplicarVale}>
          <Ionicons name="ticket" size={18} color="#fff" />
          <Text style={s.valeBarT}>Tiene un vale de premio · toca para aplicarlo al cobro</Text>
        </TouchableOpacity>
      )}

      {llamado && ficha && (ficha.tipo_corte || ficha.largo || ficha.barba || ficha.alergias || ficha.notas || ficha.nota) && (
        <View style={s.ficha}>
          <Text style={s.fichaTitle}>FICHA DEL CLIENTE</Text>
          <View style={s.fichaChips}>
            {ficha.tipo_corte ? <FichaChip l="Corte" v={ficha.tipo_corte} /> : null}
            {ficha.largo ? <FichaChip l="Largo" v={ficha.largo} /> : null}
            {ficha.barba ? <FichaChip l="Barba" v={ficha.barba} /> : null}
          </View>
          {ficha.alergias ? <Text style={s.fichaAlerta}>⚠ Alergias: {ficha.alergias}</Text> : null}
          {ficha.notas ? <Text style={s.fichaNota}>Cliente: “{ficha.notas}”</Text> : null}
          {ficha.nota ? <Text style={s.fichaNotaPriv}>Tu nota: {ficha.nota}</Text> : null}
        </View>
      )}

      {enFila.length > 0 && !llamado && (
        <TouchableOpacity style={s.siguiente} onPress={llamar}>
          <View>
            <Text style={s.sigLbl}>SIGUIENTE</Text>
            <Text style={s.sigName}>{enFila[0].turno_usuarios?.nombre ?? 'Cliente'}</Text>
            <Text style={s.sigServ}>{enFila[0].turno_servicios?.nombre}</Text>
          </View>
          <View style={s.llamarBtn}><Text style={s.llamarT}>Llamar</Text><Ionicons name="arrow-forward" size={18} color="#fff" /></View>
        </TouchableOpacity>
      )}

      {enFila.length > 0 && (
        <>
          <Text style={s.sec}>EN FILA · {enFila.length}</Text>
          {enFila.map((q, i) => (
            <View key={q.id} style={s.row}>
              <View style={s.pos}><Text style={s.posT}>{i + 1}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowName}>{q.turno_usuarios?.nombre ?? 'Cliente'}</Text>
                <Text style={s.rowServ}>{q.turno_servicios?.nombre} · {q.prioridad === 3 ? 'Físico' : 'Digital'}</Text>
              </View>
            </View>
          ))}
        </>
      )}

      <Text style={s.sec}>CITAS DE HOY</Text>
      {citas.length === 0 && <Text style={s.empty}>Sin citas para hoy</Text>}
      {citas.map((c: any) => (
        <TouchableOpacity key={c.id} style={s.row} onPress={() => accionCita(c)}>
          <Avatar name={c.turno_usuarios?.nombre} size={42} bg={COLORS.surfaceAlt} color={COLORS.ink} />
          <View style={{ flex: 1 }}>
            <Text style={s.rowName}>{c.turno_usuarios?.nombre ?? 'Cliente'}</Text>
            <Text style={s.rowServ}>{c.turno_servicios?.nombre} · {hora12(c.hora_inicio)}</Text>
          </View>
          <Badge tone={badgeCita(c.estado) as any}>{c.estado.replace('_', ' ')}</Badge>
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={s.walkin} onPress={() => setWalkin(true)}><Ionicons name="add" size={18} color="#fff" /><Text style={s.walkinT}>Atender cliente sin cita</Text></TouchableOpacity>
      <TouchableOpacity style={s.bloquear} onPress={() => setBloq(true)}><Ionicons name="lock-closed-outline" size={16} color={COLORS.textMid} /><Text style={s.bloquearT}>Bloquear hora</Text></TouchableOpacity>

      <Modal visible={walkin} transparent animationType="slide" onRequestClose={() => setWalkin(false)}>
        <View style={s.modalBg}>
          <View style={s.modal}>
            <Display size={22}>Cliente sin cita</Display>
            <Text style={s.modalSub}>Se agrega a la fila física (orden de llegada).</Text>
            <Text style={s.flabel}>Nombre</Text>
            <TextInput style={s.input} placeholder="Nombre del cliente" placeholderTextColor={COLORS.textLight} value={wNombre} onChangeText={setWNombre} />
            <Text style={s.flabel}>Teléfono (opcional)</Text>
            <TextInput style={s.input} placeholder="+1 809 000 0000" keyboardType="phone-pad" placeholderTextColor={COLORS.textLight} value={wTel} onChangeText={setWTel} />
            <Text style={s.flabel}>Servicio</Text>
            <View style={s.servChips}>
              {servicios.map((sv: any) => (
                <TouchableOpacity key={sv.id} style={[s.servChip, wServ?.id === sv.id && s.servChipOn]} onPress={() => setWServ(sv)}>
                  <Text style={[s.servChipT, wServ?.id === sv.id && { color: '#fff' }]}>{sv.nombre}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={s.modalBtn} onPress={agregarFisico} disabled={wEnviando}>
              {wEnviando ? <ActivityIndicator color="#fff" /> : <Text style={s.modalBtnT}>Agregar a la fila</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setWalkin(false)}><Text style={s.modalCerrar}>Cancelar</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={bloq} transparent animationType="slide" onRequestClose={() => setBloq(false)}>
        <View style={s.modalBg}>
          <View style={s.modal}>
            <Display size={22}>Bloquear hora</Display>
            <Text style={s.modalSub}>Hoy. Ese rango no se ofrecerá para citas.</Text>
            <Text style={s.flabel}>Desde</Text>
            <View style={s.stepRow}>
              <TouchableOpacity style={s.stepBtn} onPress={() => setBIni(Math.max(0, bIni - 1))}><Text style={s.stepT}>−</Text></TouchableOpacity>
              <Text style={s.stepVal}>{hora12(`${String(bIni).padStart(2, '0')}:00`)}</Text>
              <TouchableOpacity style={s.stepBtn} onPress={() => setBIni(Math.min(23, bIni + 1))}><Text style={s.stepT}>+</Text></TouchableOpacity>
            </View>
            <Text style={s.flabel}>Hasta</Text>
            <View style={s.stepRow}>
              <TouchableOpacity style={s.stepBtn} onPress={() => setBFin(Math.max(bIni + 1, bFin - 1))}><Text style={s.stepT}>−</Text></TouchableOpacity>
              <Text style={s.stepVal}>{hora12(`${String(bFin).padStart(2, '0')}:00`)}</Text>
              <TouchableOpacity style={s.stepBtn} onPress={() => setBFin(Math.min(24, bFin + 1))}><Text style={s.stepT}>+</Text></TouchableOpacity>
            </View>
            <Text style={s.flabel}>Motivo (opcional)</Text>
            <TextInput style={s.input} placeholder="Almuerzo, descanso…" placeholderTextColor={COLORS.textLight} value={bMotivo} onChangeText={setBMotivo} />
            <TouchableOpacity style={s.modalBtn} onPress={guardarBloqueo} disabled={bEnviando}>{bEnviando ? <ActivityIndicator color="#fff" /> : <Text style={s.modalBtnT}>Bloquear</Text>}</TouchableOpacity>
            <TouchableOpacity onPress={() => setBloq(false)}><Text style={s.modalCerrar}>Cancelar</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

function FichaChip({ l, v }: { l: string; v: string }) {
  return (
    <View style={fc.chip}>
      <Text style={fc.l}>{l}</Text>
      <Text style={fc.v}>{v}</Text>
    </View>
  )
}
const fc = StyleSheet.create({
  chip: { backgroundColor: COLORS.surfaceAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  l: { fontFamily: FONTS.semibold, fontSize: 10, color: COLORS.textLight, textTransform: 'uppercase' },
  v: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.ink, marginTop: 1 },
})

function Grupo({ n, l, hl }: { n: number; l: string; hl?: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={[gs.num, hl && { color: COLORS.red }]}>{n}</Text>
      <Text style={gs.lbl}>{l}</Text>
    </View>
  )
}
const gs = StyleSheet.create({
  num: { fontFamily: FONTS.display, fontSize: 30, color: '#fff' },
  lbl: { fontFamily: FONTS.medium, fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
})

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  kicker: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textLight, textTransform: 'capitalize', marginBottom: 4 },
  codigoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.carbon, borderRadius: 14, padding: 14, marginBottom: 14 },
  codigoLbl: { fontFamily: FONTS.bold, fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 },
  codigoVal: { fontFamily: FONTS.display, fontSize: 26, color: '#fff', letterSpacing: 3, marginTop: 2 },
  codigoShare: { width: 40, height: 40, borderRadius: 11, backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center' },
  valeBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.red, borderRadius: 12, padding: 13, marginTop: -6, marginBottom: 14 },
  valeBarT: { flex: 1, fontFamily: FONTS.bold, fontSize: 13, color: '#fff' },
  colaBox: { backgroundColor: COLORS.carbon, borderRadius: 16, padding: 18, marginBottom: 14 },
  colaTitle: { fontFamily: FONTS.bold, fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, marginBottom: 14 },
  colaStats: { flexDirection: 'row', justifyContent: 'space-between' },
  llamado: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.success, borderRadius: 14, padding: 16, marginBottom: 14 },
  llamadoLbl: { fontFamily: FONTS.bold, fontSize: 11, color: 'rgba(255,255,255,0.85)', letterSpacing: 1 },
  llamadoName: { fontFamily: FONTS.extrabold, fontSize: 18, color: '#fff', marginTop: 4 },
  llamadoServ: { fontFamily: FONTS.medium, fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  atenderBtn: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  atenderT: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.success },
  avisarBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7 },
  avisarT: { fontFamily: FONTS.bold, fontSize: 12, color: '#fff' },
  ficha: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, marginTop: -6, marginBottom: 14 },
  fichaTitle: { fontFamily: FONTS.bold, fontSize: 10, color: COLORS.textLight, letterSpacing: 1, marginBottom: 10 },
  fichaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fichaAlerta: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.red, marginTop: 10 },
  fichaNota: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textMid, marginTop: 8, fontStyle: 'italic' },
  fichaNotaPriv: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textMid, marginTop: 6 },
  siguiente: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.red, borderRadius: 14, padding: 16, marginBottom: 16 },
  sigLbl: { fontFamily: FONTS.bold, fontSize: 11, color: 'rgba(255,255,255,0.85)', letterSpacing: 1 },
  sigName: { fontFamily: FONTS.extrabold, fontSize: 18, color: '#fff', marginTop: 4 },
  sigServ: { fontFamily: FONTS.medium, fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  llamarBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.18)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  llamarT: { fontFamily: FONTS.bold, fontSize: 14, color: '#fff' },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginTop: 8, marginBottom: 12 },
  empty: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, textAlign: 'center', paddingVertical: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, marginBottom: 8 },
  pos: { width: 42, height: 42, borderRadius: 12, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  posT: { fontFamily: FONTS.display, fontSize: 18, color: COLORS.ink },
  rowName: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  rowServ: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  walkin: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: COLORS.carbon, borderRadius: 14, padding: 15, marginTop: 10 },
  walkinT: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
  bloquear: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 14, padding: 13, marginTop: 8 },
  bloquearT: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.textMid },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 8 },
  stepBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  stepT: { fontFamily: FONTS.bold, fontSize: 22, color: COLORS.ink },
  stepVal: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.ink },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: COLORS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalSub: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textLight, marginTop: 6, marginBottom: 16 },
  flabel: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textMid, marginBottom: 7, marginTop: 4 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, padding: 14, fontSize: 15, fontFamily: FONTS.medium, color: COLORS.ink, marginBottom: 10 },
  servChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  servChip: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 11, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: COLORS.surface },
  servChipOn: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  servChipT: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.ink },
  modalBtn: { backgroundColor: COLORS.red, borderRadius: 14, padding: 16, alignItems: 'center' },
  modalBtnT: { fontFamily: FONTS.bold, fontSize: 16, color: '#fff' },
  modalCerrar: { fontFamily: FONTS.semibold, textAlign: 'center', color: COLORS.textLight, fontSize: 14, marginTop: 14 },
})
