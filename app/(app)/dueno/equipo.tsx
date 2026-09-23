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
import { COLORS, FONTS } from '../../../constants'
import { nombreOficio } from '../../../types'
import { NoCargo } from '../../../components/ui'
import { Encabezado, Rotulo } from '../../../components/d2'
import { Titulo, Sub, BotonRojo, AhoraNo } from '../../../components/hoja-piezas'
import { Fila, Iniciales, Punto, Estado, Flecha, Tarjeta, Boton, BotonIcono, Nota } from '../../../components/turno-ui'
import PanelBadge from '../../../components/panel-badge'
import Hoja from '../../../components/hoja'

/** El rol se llama ADMINISTRADOR, no dueño: puede ser quien montó el local o
 *  alguien designado. El valor `dueno` de la base se queda como está. */
const ROL: Record<string, string> = { empleado: 'Empleado', barbero_renta: 'Renta', dueno: 'Administrador' }

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

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>
  if (fallo) return <View style={s.center}><NoCargo que="tu equipo" onReintentar={() => { setLoading(true); void correr() }} /></View>

  // Los suspendidos al final: siguen siendo del local, pero no trabajan hoy.
  const activos = equipo.filter(p => !p.suspendido)
  const suspendidos = equipo.filter(p => p.suspendido)
  const lista = [...activos, ...suspendidos]

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
          <Tarjeta style={s.solicitudes}>
            <View style={s.solCab}>
              <Punto color={COLORS.red} />
              <Text style={s.overline}>
                {solicitudes.length === 1 ? 'Una solicitud' : `${solicitudes.length} solicitudes`}
              </Text>
            </View>
            {solicitudes.map((p: any, i: number) => (
              <Fila key={p.id} ultima={i === solicitudes.length - 1}
                inicio={<Iniciales nombre={p.turno_usuarios?.nombre} size={38} />}
                titulo={p.turno_usuarios?.nombre ?? 'Profesional'}
                meta={`${nombreOficio(p.tipo_servicio)} · quiere ${esRentado ? 'rentar una silla' : 'unirse'}`}
                fin={
                  <View style={s.solAcc}>
                    <BotonIcono icono="close" etiqueta={`Rechazar a ${p.turno_usuarios?.nombre ?? ''}`}
                      onPress={() => { if (ocupado !== p.id) rechazar(p) }} color={COLORS.redText} />
                    <Boton texto="Aprobar" onPress={() => aprobar(p)} ocupado={ocupado === p.id} style={s.solSi} />
                  </View>
                } />
            ))}
          </Tarjeta>
        )}

        <Rotulo>{esRentado ? 'Sillas rentadas' : 'Sillas'}{equipo.length ? ` · ${equipo.length}` : ''}</Rotulo>
        {equipo.length === 0 && (
          <Nota style={{ marginTop: 0 }}>Todavía no trabaja nadie aquí. Comparte el código del local o invita a alguien con el suyo.</Nota>
        )}
        {lista.map((p: any, i: number) => {
          const tu = p.id === perfilPropio
          const cod = p.turno_usuarios?.codigo_barbero
          const meta = [ROL[p.rol], nombreOficio(p.tipo_servicio)].filter(Boolean).join(' · ')
          return (
            <Fila key={p.id} ultima={i === lista.length - 1} onPress={() => abrir(p)} apagada={p.suspendido}
              inicio={<Iniciales nombre={p.turno_usuarios?.nombre} oscuro={tu} />}
              titulo={p.turno_usuarios?.nombre ?? 'Profesional'}
              tituloExtra={tu ? <Text style={s.tu}>  Tú</Text> : null}
              meta={meta}
              fin={
                <View style={s.finFila}>
                  {p.suspendido ? (
                    <>
                      <Estado texto="Suspendido" color={COLORS.redText} />
                      <TouchableOpacity style={s.reactivar} onPress={() => reactivar(p)} disabled={ocupado === p.id} accessibilityRole="button">
                        {ocupado === p.id ? <ActivityIndicator size="small" color={COLORS.ink} /> : <Text style={s.reactivarT}>Reactivar</Text>}
                      </TouchableOpacity>
                    </>
                  ) : cod ? (
                    // El código del barbero es como sus clientes lo encuentran; el
                    // dueño es quien lo tiene a mano cuando alguien pregunta por él.
                    <BotonIcono icono="share-outline" etiqueta={`Compartir el código de ${p.turno_usuarios?.nombre ?? ''}`}
                      onPress={() => Share.share({
                        message: `Reserva con ${p.turno_usuarios?.nombre ?? 'nuestro barbero'} en ${negocio?.nombre ?? 'la barbería'}.\n\nDescarga Turno y búscalo con su código de barbero:\n\n${cod}`,
                      })} />
                  ) : null}
                  <Flecha />
                </View>
              } />
          )
        })}

        {invitados.length > 0 && (
          <>
            <Rotulo>Invitados · esperando su respuesta</Rotulo>
            {invitados.map((p: any, i: number) => (
              <Fila key={p.id} ultima={i === invitados.length - 1} apagada
                inicio={<Iniciales nombre={p.turno_usuarios?.nombre} />}
                titulo={p.turno_usuarios?.nombre ?? 'Profesional'}
                meta={`${nombreOficio(p.tipo_servicio)} · le llegó la invitación`}
                fin={<Estado texto="Pendiente" />} />
            ))}
          </>
        )}

        {/* TRAER A ALGUIEN: dos caminos. Compartir el código es esperar a que
            el otro dé el paso; invitar con el suyo es darlo tú. */}
        <Rotulo>{esRentado ? 'Rentar una silla' : 'Agregar barbero'}</Rotulo>
        <Fila onPress={compartirCodigoLocal}
          inicio={<View style={s.cuadro}><Ionicons name="share-social-outline" size={18} color={COLORS.ink} /></View>}
          titulo="Compartir el código del local"
          meta="Pide entrar y lo apruebas aquí"
          fin={<View style={s.finFila}><Text style={s.codigo}>{negocio?.codigo_acceso ?? '—'}</Text><Flecha /></View>} />
        <Fila ultima onPress={() => { setCodigoInv(''); setInvitando(true) }}
          inicio={<View style={s.cuadro}><Ionicons name="person-add-outline" size={18} color={COLORS.ink} /></View>}
          titulo="Invitar con su código"
          meta="Si ya usa Turno, le llega la invitación y decide él"
          fin={<Flecha />} />
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
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  solicitudes: { marginTop: 20, paddingVertical: 6 },
  solCab: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, paddingBottom: 2 },
  overline: { fontFamily: FONTS.bold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: COLORS.textMid },
  solAcc: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  solSi: { height: 40, minWidth: 96 },
  finFila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tu: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.red },
  reactivar: { height: 36, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  reactivarT: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.ink },
  cuadro: { width: 42, height: 42, borderRadius: 8, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  codigo: { fontFamily: FONTS.mono, fontSize: 14, color: COLORS.ink, letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, backgroundColor: COLORS.bg, paddingHorizontal: 14, height: 52, marginTop: 14,
    fontSize: 17, fontFamily: FONTS.mono, color: COLORS.ink, letterSpacing: 1.5 },
})
