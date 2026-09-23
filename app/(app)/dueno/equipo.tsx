/**
 * EQUIPO · quién trabaja aquí. Tablero: «D2 · Barbería · Equipo».
 *
 * Estaba al fondo de Mi local, debajo de la fila, y las solicitudes de gente
 * que quería entrar quedaban fuera de la vista. Ahora tiene su pestaña, en el
 * orden en que se decide: primero quien espera una respuesta, después quien ya
 * está, y al final cómo traer a alguien nuevo.
 *
 * En un local de alquiler no es «equipo» sino «quienes rentan»: cada uno es su
 * propio negocio dentro del local. El dueño decide quién entra en su casa
 * (migración 110), no cómo trabaja nadie.
 *
 * Las decisiones sobre UNA persona —servicios, horario, suspender, desvincular—
 * viven en su ficha (dueno/barbero). Aquí solo se abre.
 */
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert, Share, TextInput } from 'react-native'
import { useState, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getSesion, guardarSesion } from '../../../lib/storage'
import {
  getNegocioById, getSolicitudesPendientes, aprobarPerfil, rechazarPerfil, getPerfilesNegocio,
  invitarBarbero, getInvitacionesEnviadas, suspenderBarbero,
} from '../../../lib/db'
import { enviarPush } from '../../../lib/notificaciones'
import { useRecargaAlEnfocar } from '../../../lib/recarga'
import { COLORS, FONTS, GLASS } from '../../../constants'
import { nombreOficio } from '../../../types'
import { NoCargo } from '../../../components/ui'
import { Encabezado, Rotulo } from '../../../components/d2'
import { Titulo, Sub, BotonRojo, AhoraNo } from '../../../components/hoja-piezas'
import PanelBadge from '../../../components/panel-badge'
import Hoja from '../../../components/hoja'

/** El rol se llama ADMINISTRADOR, no dueño: puede ser quien montó el local o
 *  alguien designado. El valor `dueno` de la base se queda como está. */
const ROL: Record<string, string> = { empleado: 'EMPLEADO', barbero_renta: 'RENTA', dueno: 'ADMINISTRADOR' }

export default function Equipo() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [negocio, setNegocio] = useState<any>(null)
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [invitados, setInvitados] = useState<any[]>([])
  const [equipo, setEquipo] = useState<any[]>([])
  const [perfilPropio, setPerfilPropio] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [fallo, setFallo] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  // Invitar por código de barbero (migración 110).
  const [invitando, setInvitando] = useState(false)
  const [codigoInv, setCodigoInv] = useState('')
  const [invEnviando, setInvEnviando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setFallo(false)
      const ss = await getSesion()
      if (!ss?.negocio_id) return
      setPerfilPropio(ss.perfil_id ?? null)
      // El equipo va sin `.catch`: una lista vacía por un fallo de red diría
      // «aún no trabaja nadie aquí» de un local lleno.
      const [neg, sol, inv, eq] = await Promise.all([
        getNegocioById(ss.negocio_id),
        getSolicitudesPendientes(ss.negocio_id).catch(() => []),
        getInvitacionesEnviadas(ss.negocio_id).catch(() => []),
        getPerfilesNegocio(ss.negocio_id),
      ])
      setNegocio(neg); setSolicitudes(sol as any[]); setInvitados(inv as any[]); setEquipo(eq as any[])
    } catch {
      setFallo(true)
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [])
  const correr = useRecargaAlEnfocar(cargar)

  const esRentado = negocio?.tipo === 'espacios_rentados'

  async function aprobar(p: any) {
    setOcupado(p.id)
    try {
      await aprobarPerfil(p.id)
      if (p.usuario_id) enviarPush(p.usuario_id, 'Te aprobaron', `Ya puedes atender en ${negocio?.nombre ?? 'el local'}.`, { tipo: 'agenda' })
      await correr()
    } catch (e: any) { Alert.alert('No se pudo aprobar', e.message ?? 'Intenta de nuevo.') }
    finally { setOcupado(null) }
  }
  function rechazar(p: any) {
    Alert.alert('Rechazar', `${p.turno_usuarios?.nombre ?? 'Este profesional'} no entra al local. Puede volver a pedirlo más adelante.`, [
      { text: 'Ahora no', style: 'cancel' },
      { text: 'Rechazar', style: 'destructive', onPress: async () => {
        setOcupado(p.id)
        try { await rechazarPerfil(p.id); await correr() }
        catch (e: any) { Alert.alert('No se pudo', e.message ?? 'Intenta de nuevo.') }
        finally { setOcupado(null) }
      } },
    ])
  }
  function reactivar(p: any) {
    const nombre = p.turno_usuarios?.nombre ?? 'Este barbero'
    Alert.alert('Reactivar', `${nombre} vuelve a recibir turnos y citas desde ahora.`, [
      { text: 'Ahora no', style: 'cancel' },
      { text: 'Reactivar', onPress: async () => {
        setOcupado(p.id)
        try { await suspenderBarbero(p.id, false); await correr() }
        catch (e: any) { Alert.alert('No se pudo', e.message ?? 'Intenta de nuevo.') }
        finally { setOcupado(null) }
      } },
    ])
  }

  /**
   * INVITAR ES LLAMAR, NO METER (migración 110). El servidor contesta tres
   * cosas distintas —el código no es de nadie, ya le invitaste, ya trabaja
   * aquí— y se enseñan tal cual. El caso feliz tiene dos finales: si él ya
   * había pedido entrar, tu invitación es el segundo sí y queda dentro.
   */
  async function invitar() {
    const cod = codigoInv.trim()
    if (!cod || !negocio?.id) return
    setInvEnviando(true)
    try {
      const p: any = await invitarBarbero(negocio.id, cod)
      setInvitando(false); setCodigoInv('')
      if (p?.usuario_id) {
        enviarPush(p.usuario_id, `${negocio?.nombre ?? 'Una barbería'} te invitó`,
          p?.aprobado ? 'Ya estás dentro: abre Turno y empieza.' : 'Abre Turno para aceptar o rechazar.',
          { tipo: 'agenda' })
      }
      Alert.alert(p?.aprobado ? 'Ya está dentro' : 'Invitación enviada',
        p?.aprobado
          ? 'Ya había pedido entrar, así que con tu sí queda dentro.'
          : 'Le llegó el aviso. Aparece en tu equipo cuando la acepte; mientras, la ves en «Invitados».')
      await correr()
    } catch (e: any) {
      Alert.alert('No se pudo invitar', e.message ?? 'Intenta de nuevo.')
    } finally { setInvEnviando(false) }
  }

  function compartirCodigoLocal() {
    Share.share({
      message: `Únete a ${negocio?.nombre ?? 'mi barbería'} en Turno.\n\nDescarga la app, elige "Soy barbero" y entra con este código:\n\n${negocio?.codigo_acceso}\n\n${esRentado ? 'Rentarías tu asiento: mandas tú en tus precios y tus horarios. Cuando envíes la solicitud te acepto desde mi panel.' : 'Cuando envíes la solicitud te apruebo desde mi panel.'}`,
    })
  }

  async function irAMiSilla() {
    const ss = await getSesion(); if (!ss) return
    await guardarSesion({ ...ss, panel: 'silla' })
    router.replace('/(app)/barbero/silla')
  }
  function abrir(p: any) {
    if (p.id === perfilPropio) { void irAMiSilla(); return }
    router.push({
      pathname: '/(app)/dueno/barbero',
      params: { perfil: p.id, nombre: p.turno_usuarios?.nombre ?? 'Barbero', rol: p.rol ?? '' },
    } as any)
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.ink} /></View>
  if (fallo) return <View style={s.center}><NoCargo que="tu equipo" onReintentar={() => { setLoading(true); void correr() }} /></View>

  // Los suspendidos al final: siguen siendo del local, pero no trabajan hoy.
  const activos = equipo.filter(p => !p.suspendido)
  const suspendidos = equipo.filter(p => p.suspendido)

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 14, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void correr() }} />}>
        <PanelBadge />
        <Encabezado
          titulo={esRentado ? 'Quienes rentan' : 'Equipo'}
          sub={esRentado
            ? 'Cada uno lleva su negocio: tú decides quién entra, no cómo trabaja.'
            : 'Tus barberos: sus servicios, su horario y su permiso los pones tú.'} />

        {/* SOLICITUDES: quien espera una respuesta va primero. */}
        {solicitudes.length > 0 && (
          <View style={s.solicitudes}>
            <Text style={s.solT}>
              {solicitudes.length === 1 ? 'UNA SOLICITUD' : `${solicitudes.length} SOLICITUDES`}
            </Text>
            {solicitudes.map((p: any) => (
              <View key={p.id} style={s.sol}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.solNombre} numberOfLines={1}>{p.turno_usuarios?.nombre ?? 'Profesional'}</Text>
                  <Text style={s.solMeta}>{nombreOficio(p.tipo_servicio)} · quiere {esRentado ? 'rentar una silla' : 'unirse'}</Text>
                </View>
                <TouchableOpacity style={s.solNo} onPress={() => rechazar(p)} disabled={ocupado === p.id}
                  accessibilityRole="button" accessibilityLabel={`Rechazar a ${p.turno_usuarios?.nombre ?? ''}`}>
                  <Ionicons name="close" size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={s.solSi} onPress={() => aprobar(p)} disabled={ocupado === p.id} accessibilityRole="button">
                  {ocupado === p.id ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.solSiT}>APROBAR</Text>}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <Rotulo>{esRentado ? 'Sillas rentadas' : 'Sillas'}{equipo.length ? ` · ${equipo.length}` : ''}</Rotulo>
        {equipo.length === 0 && (
          <Text style={s.vacio}>Todavía no trabaja nadie aquí. Comparte el código del local o invita a alguien con el suyo.</Text>
        )}
        {[...activos, ...suspendidos].map((p: any) => {
          const tu = p.id === perfilPropio
          const cod = p.turno_usuarios?.codigo_barbero
          return (
            <View key={p.id} style={[s.fila, p.suspendido && { opacity: 0.75 }]}>
              <TouchableOpacity style={{ flex: 1, minWidth: 0 }} onPress={() => abrir(p)} activeOpacity={0.7} accessibilityRole="button">
                <View style={s.nombreFila}>
                  <Text style={s.nombre} numberOfLines={1}>{p.turno_usuarios?.nombre ?? 'Profesional'}</Text>
                  {tu && <Text style={s.tu}>TÚ</Text>}
                </View>
                <View style={s.chips}>
                  {!!ROL[p.rol] && <Text style={[s.chip, p.rol === 'barbero_renta' && s.chipAzul]}>{ROL[p.rol]}</Text>}
                  {p.suspendido && <Text style={[s.chip, s.chipRojo]}>SUSPENDIDO</Text>}
                  <Text style={s.meta} numberOfLines={1}>{nombreOficio(p.tipo_servicio)}</Text>
                </View>
              </TouchableOpacity>
              {p.suspendido ? (
                <TouchableOpacity style={s.reactivar} onPress={() => reactivar(p)} disabled={ocupado === p.id} accessibilityRole="button">
                  <Text style={s.reactivarT}>Reactivar</Text>
                </TouchableOpacity>
              ) : cod ? (
                // El código del barbero es como sus clientes lo encuentran; el
                // dueño es quien lo tiene a mano cuando alguien pregunta por él.
                <TouchableOpacity style={s.icono} accessibilityRole="button" accessibilityLabel={`Compartir el código de ${p.turno_usuarios?.nombre ?? ''}`}
                  onPress={() => Share.share({
                    message: `Reserva con ${p.turno_usuarios?.nombre ?? 'nuestro barbero'} en ${negocio?.nombre ?? 'la barbería'}.\n\nDescarga Turno y búscalo con su código de barbero:\n\n${cod}`,
                  })}>
                  <Ionicons name="share-outline" size={18} color={COLORS.ink} />
                </TouchableOpacity>
              ) : null}
              <Ionicons name="chevron-forward" size={17} color={COLORS.textLight} />
            </View>
          )
        })}

        {invitados.length > 0 && (
          <>
            <Rotulo>Invitados · esperando su respuesta</Rotulo>
            {invitados.map((p: any) => (
              <View key={p.id} style={s.fila}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.nombre, { color: COLORS.textMid }]} numberOfLines={1}>{p.turno_usuarios?.nombre ?? 'Profesional'}</Text>
                  <Text style={s.meta}>{nombreOficio(p.tipo_servicio)} · le llegó la invitación</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* TRAER A ALGUIEN: dos caminos. Compartir el código es esperar a que
            el otro dé el paso; invitar con el suyo es darlo tú. */}
        <Rotulo>{esRentado ? 'Rentar una silla' : 'Agregar barbero'}</Rotulo>
        <TouchableOpacity style={s.fila} onPress={compartirCodigoLocal} accessibilityRole="button">
          <View style={s.cuadro}><Ionicons name="share-social-outline" size={18} color={COLORS.ink} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.nombre}>Compartir el código del local</Text>
            <Text style={s.meta}>{negocio?.codigo_acceso ?? '—'} · pide entrar y lo apruebas aquí</Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={COLORS.textLight} />
        </TouchableOpacity>
        <TouchableOpacity style={s.fila} onPress={() => { setCodigoInv(''); setInvitando(true) }} accessibilityRole="button">
          <View style={s.cuadro}><Ionicons name="person-add-outline" size={18} color={COLORS.ink} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.nombre}>Invitar con su código</Text>
            <Text style={s.meta}>Si ya usa Turno, le llega la invitación y decide él</Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={COLORS.textLight} />
        </TouchableOpacity>
      </ScrollView>

      <Hoja visible={invitando} onClose={() => setInvitando(false)}>
        <Titulo>Invitar con su código</Titulo>
        <Sub>
          Cada profesional de Turno tiene un código propio que le sale en su pantalla. Pídeselo y
          escríbelo aquí. Le llega la invitación y decide él: invitar no le mete en el local.
        </Sub>
        <TextInput style={s.input} value={codigoInv} onChangeText={t => setCodigoInv(t.toUpperCase())}
          placeholder="JUAN-4821" placeholderTextColor={COLORS.textLight}
          autoCapitalize="characters" autoCorrect={false} />
        <View style={{ marginTop: 14 }}>
          <BotonRojo texto="Invitar" onPress={invitar} ocupado={invEnviando} disabled={!codigoInv.trim()} />
        </View>
        <AhoraNo onPress={() => setInvitando(false)} />
      </Hoja>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  vacio: { fontFamily: FONTS.regular, fontSize: 13.5, lineHeight: 19, color: COLORS.textMid, paddingVertical: 18 },
  solicitudes: { marginTop: 18, backgroundColor: GLASS.ink, padding: 14, borderRadius: 26 },
  solT: { fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 1.2, color: COLORS.onCarbonMid, marginBottom: 4 },
  sol: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  solNombre: { fontFamily: FONTS.semibold, fontSize: 15.5, color: '#fff' },
  solMeta: { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.onCarbonMid, marginTop: 2 },
  solNo: { width: 42, height: 42, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center', borderRadius: 21 },
  solSi: { height: 42, paddingHorizontal: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', minWidth: 92, borderRadius: 21, borderWidth: 0 },
  solSiT: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, backgroundColor: GLASS.fill, borderWidth: 1, borderColor: GLASS.border, borderRadius: GLASS.radioFila, paddingHorizontal: 14, marginBottom: 8 },
  nombreFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nombre: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 15.5, color: COLORS.ink },
  tu: { fontFamily: FONTS.bold, fontSize: 10.5, color: COLORS.red, letterSpacing: 1 },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  chip: { fontFamily: FONTS.bold, fontSize: 10, letterSpacing: 1, color: COLORS.ink, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  chipAzul: { color: COLORS.blue, borderColor: COLORS.border },
  chipRojo: { color: COLORS.redText, borderColor: COLORS.border },
  meta: { flexShrink: 1, fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textMid, marginTop: 2 },
  icono: { width: 40, height: 40, borderWidth: 1, borderColor: GLASS.border, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: GLASS.fill },
  reactivar: { height: 38, paddingHorizontal: 12, borderWidth: 1, borderColor: GLASS.border, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: GLASS.fill },
  reactivarT: { fontFamily: FONTS.semibold, fontSize: 12.5, color: COLORS.ink },
  cuadro: { width: 36, height: 36, backgroundColor: GLASS.fillStrong, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  input: { borderWidth: 1, borderColor: GLASS.border, backgroundColor: GLASS.fillStrong, padding: 14, marginTop: 14, fontSize: 17, fontFamily: FONTS.bold, color: COLORS.ink, letterSpacing: 1.2, borderRadius: 16, overflow: 'hidden' },
})
