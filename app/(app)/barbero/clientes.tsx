/**
 * CLIENTES · la cartera del barbero. Tablero: «D2 · Barbero · Clientes».
 *
 * Dos preguntas, dos pestañas: ¿quiénes son mis clientes? y ¿a quién hace
 * tiempo que no veo? La lista es del local; los números de cada uno son los
 * TUYOS («contigo»), porque en un local de sillas alquiladas cada barbero tiene
 * su clientela y mezclarlas le daría a uno los números del otro.
 *
 * Contactar va en la misma línea —WhatsApp y llamar— y solo si el cliente dejó
 * un teléfono de verdad: al que entra sin cita se le guarda «-».
 *
 * Se puede llegar con un cliente concreto (`?cliente=…`) desde Mi silla o la
 * agenda: se abre su ficha directamente.
 */
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, TextInput, Alert, Linking } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getSesion } from '../../../lib/storage'
import {
  getClientesDelLocal, getNotaBarbero, getNotasBarbero, guardarNotaBarbero, getClientesPorRecuperar, getHistorialCliente,
  getTarjetaCliente, getFidelidad, getPreferenciasCliente, getNegocioById, getMiPerfil,
} from '../../../lib/db'
import { dinero, fechaDeISO } from '../../../lib/format'
import { escribirCliente } from '../../../lib/whatsapp'
import { enviarPush } from '../../../lib/notificaciones'
import { useRecargaAlEnfocar } from '../../../lib/recarga'
import { COLORS, FONTS } from '../../../constants'
import { NoCargo } from '../../../components/ui'
import { Encabezado, Pestanas, Rotulo } from '../../../components/d2'
import PanelBadge from '../../../components/panel-badge'
import Hoja from '../../../components/hoja'

const ORDENES = [
  { k: 'recientes', l: 'Recientes' },
  { k: 'frecuentes', l: 'Frecuentes' },
  { k: 'nuevos', l: 'Sin venir' },
  { k: 'az', l: 'A–Z' },
] as const
type Orden = typeof ORDENES[number]['k']

/** Un teléfono al que se puede escribir. Al que entra sin cita se le guarda «-». */
const telDe = (t?: string | null) => (t && /\d{7,}/.test(t.replace(/\D/g, '')) ? t : null)
const fechaCorta = (iso?: string | null) =>
  iso ? fechaDeISO(iso).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' }).replace('.', '') : ''
const llamar = (t: string) => Linking.openURL(`tel:${t.replace(/[^\d+]/g, '')}`)

export default function Clientes() {
  const insets = useSafeAreaInsets()
  const { cliente, nombre: nombreParam, telefono: telParam } =
    useLocalSearchParams<{ cliente?: string; nombre?: string; telefono?: string }>()
  const abiertoPorParam = useRef<string | null>(null)
  const [usuarioId, setUsuarioId] = useState<string | null>(null)
  const [negocioId, setNegocioId] = useState<string | null>(null)
  const [perfilId, setPerfilId] = useState<string | null>(null)
  const [local, setLocal] = useState('')
  const [clientes, setClientes] = useState<any[]>([])
  const [recuperar, setRecuperar] = useState<any[]>([])
  const [revisita, setRevisita] = useState(30)
  const [seg, setSeg] = useState<'todos' | 'recuperar'>('todos')
  const [orden, setOrden] = useState<Orden>('recientes')
  const [buscar, setBuscar] = useState('')
  const [loading, setLoading] = useState(true)
  const [fallo, setFallo] = useState(false)
  const [activo, setActivo] = useState<any>(null)
  const [nota, setNota] = useState('')
  const [cargandoFicha, setCargandoFicha] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [notas, setNotas] = useState<Record<string, string>>({})
  const [moneda, setMoneda] = useState('')
  const [ficha, setFicha] = useState<{ historial: any[]; puntos: any; prefs: any; meta: number; premio: string } | null>(null)

  // La lista va sin `.catch`: desde la migración 117 una lista vacía es una
  // respuesta legítima —el empleado solo ve a quien ha atendido él—, así que
  // el vacío ya significa algo y no puede significar también «sin conexión».
  const cargar = useCallback(async () => {
    try {
      setFallo(false)
      const ss = await getSesion()
      if (!ss?.usuario_id) return
      setUsuarioId(ss.usuario_id); setNegocioId(ss.negocio_id ?? null); setPerfilId(ss.perfil_id ?? null)
      const [cl, rec, neg, nts, pf] = await Promise.all([
        ss.negocio_id ? getClientesDelLocal(ss.negocio_id) : Promise.resolve([]),
        ss.perfil_id ? getClientesPorRecuperar(ss.perfil_id).catch(() => []) : Promise.resolve([]),
        ss.negocio_id ? getNegocioById(ss.negocio_id).catch(() => null) : Promise.resolve(null),
        getNotasBarbero(ss.usuario_id).catch(() => ({})),
        ss.negocio_id ? getMiPerfil(ss.usuario_id, ss.negocio_id).catch(() => null) : Promise.resolve(null),
      ])
      setClientes(cl); setRecuperar(rec as any[])
      setMoneda((neg as any)?.moneda ?? ''); setLocal((neg as any)?.nombre ?? '')
      setNotas(nts as Record<string, string>)
      setRevisita((pf as any)?.revisita_dias ?? 30)
    } catch {
      setFallo(true)
    } finally {
      setLoading(false)
    }
  }, [])
  const correr = useRecargaAlEnfocar(cargar)

  // Con un cliente en la ruta se abre su ficha. Se recuerda CUÁL se abrió, no
  // solo que se abrió: la pestaña no se desmonta, y la próxima vez que se
  // llegue con otro cliente tiene que abrirse el nuevo.
  useEffect(() => {
    if (!cliente || abiertoPorParam.current === cliente || !negocioId || !usuarioId) return
    abiertoPorParam.current = cliente
    const conocido = clientes.find(c => c.cliente_id === cliente)
    abrir(conocido ?? { cliente_id: cliente, nombre: nombreParam || 'Cliente', telefono: telParam || '' })
  }, [cliente, nombreParam, telParam, negocioId, usuarioId, clientes])

  async function abrir(c: any) {
    setActivo(c); setNota(''); setFicha(null); setCargandoFicha(true)
    const [n, hist, pts, fid, prefs] = await Promise.all([
      usuarioId ? getNotaBarbero(usuarioId, c.cliente_id).catch(() => '') : Promise.resolve(''),
      negocioId ? getHistorialCliente(c.cliente_id, negocioId).catch(() => []) : Promise.resolve([]),
      negocioId ? getTarjetaCliente(c.cliente_id, negocioId, perfilId).catch(() => null) : Promise.resolve(null),
      negocioId ? getFidelidad(negocioId, perfilId).catch(() => null) : Promise.resolve(null),
      negocioId ? getPreferenciasCliente(c.cliente_id, negocioId).catch(() => null) : Promise.resolve(null),
    ])
    setNota(n || '')
    setFicha({
      historial: hist as any[],
      // La tarjeta que le toca a ESTE barbero: si alquila su asiento lleva su
      // propio programa, así que el saldo del local no es el suyo.
      puntos: (fid as any)?.activo ? pts : null,
      prefs,
      meta: (fid as any)?.meta ?? 8,
      premio: (fid as any)?.premio ?? 'Corte gratis',
    })
    setCargandoFicha(false)
  }

  /** Guardar una nota no puede fallar en silencio: si no se puede, se dice. */
  async function guardar() {
    if (!activo) return
    const uid = usuarioId ?? (await getSesion())?.usuario_id ?? null
    if (!uid) { Alert.alert('No se pudo guardar', 'No encuentro tu sesión. Vuelve a entrar e inténtalo otra vez.'); return }
    if (!activo.cliente_id) { Alert.alert('No se pudo guardar', 'A este cliente le falta la ficha; ábrelo desde la lista.'); return }
    if (!usuarioId) setUsuarioId(uid)
    setGuardando(true)
    const texto = nota.trim()
    try {
      await guardarNotaBarbero(uid, activo.cliente_id, texto)
      setNotas(prev => {
        const sig = { ...prev }
        if (texto) sig[activo.cliente_id] = texto; else delete sig[activo.cliente_id]
        return sig
      })
      setActivo(null)
    }
    catch (e: any) { Alert.alert('No se pudo guardar', e.message ?? 'Intenta de nuevo.') }
    finally { setGuardando(false) }
  }

  /**
   * UN AVISO A TODOS LOS QUE HACE TIEMPO QUE NO VIENEN. Llega a su teléfono,
   * así que antes de mandarlo se enseña el texto exacto y a cuántos: un push
   * que no se puede deshacer no sale de un toque sin querer.
   */
  function avisarATodos() {
    const destino = recuperar.filter(r => r.cliente_id)
    if (!destino.length) return
    const cuerpo = `Hace tiempo que no te vemos por ${local || 'la barbería'}. ¿Te guardamos un turno?`
    Alert.alert(`Avisar a ${destino.length}`, `Les llega esto al teléfono:\n\n«${cuerpo}»`, [
      { text: 'Ahora no', style: 'cancel' },
      { text: 'Mandar', onPress: () => {
        for (const r of destino) enviarPush(r.cliente_id, '¿Te guardamos un turno? 💈', cuerpo, { tipo: 'turno' })
        Alert.alert('Enviado', `Les llegó a quienes tienen los avisos activados.`)
      } },
    ])
  }

  const q = buscar.trim().toLowerCase()
  const ordenados = [...clientes]
    .filter(c => !q || String(c.nombre ?? '').toLowerCase().includes(q))
    .sort((a: any, b: any) => {
      if (orden === 'frecuentes') return b.visitas - a.visitas
      if (orden === 'az') return String(a.nombre).localeCompare(String(b.nombre), 'es')
      if (orden === 'nuevos') {
        if ((a.visitas === 0) !== (b.visitas === 0)) return a.visitas === 0 ? -1 : 1
        return String(a.desde ?? '').localeCompare(String(b.desde ?? ''))
      }
      return String(b.ultima ?? '').localeCompare(String(a.ultima ?? ''))
    })
  const sinVenir = clientes.filter((c: any) => c.visitas === 0).length

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>
  if (fallo) return (
    <View style={s.center}><NoCargo que="tus clientes" onReintentar={() => { setLoading(true); void correr() }} /></View>
  )

  const cabecera = (
    <View>
      <PanelBadge />
      <Encabezado titulo="Mis clientes" />
      <Pestanas
        opciones={[
          { k: 'todos', l: `Todos · ${clientes.length}` },
          { k: 'recuperar', l: `Por recuperar · ${recuperar.length}` },
        ] as const}
        valor={seg} onCambio={setSeg} />

      {seg === 'todos' ? (
        <>
          <View style={s.buscar}>
            <Ionicons name="search" size={17} color={COLORS.textLight} />
            <TextInput style={s.buscarT} value={buscar} onChangeText={setBuscar} placeholder="Buscar por nombre"
              placeholderTextColor={COLORS.textLight} autoCorrect={false} returnKeyType="search" />
            {!!buscar && (
              <TouchableOpacity onPress={() => setBuscar('')} hitSlop={10} accessibilityLabel="Borrar búsqueda">
                <Ionicons name="close" size={17} color={COLORS.textMid} />
              </TouchableOpacity>
            )}
          </View>
          <View style={s.ordenes}>
            {ORDENES.map(o => {
              const on = orden === o.k
              return (
                <TouchableOpacity key={o.k} style={[s.orden, on && s.ordenOn]} onPress={() => setOrden(o.k)}
                  accessibilityRole="button" accessibilityState={{ selected: on }}>
                  <Text style={[s.ordenT, on && { color: '#fff' }]}>{o.l}{o.k === 'nuevos' && sinVenir ? ` · ${sinVenir}` : ''}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </>
      ) : recuperar.length > 0 && (
        <View style={s.regla}>
          <Text style={s.reglaT}>
            Sin venir hace más de <Text style={s.b}>{revisita} días</Text>. Tú pones el número en Ajustes.
          </Text>
        </View>
      )}
    </View>
  )

  return (
    <View style={s.container}>
      {seg === 'todos' ? (
        <FlatList
          data={ordenados} keyExtractor={(c) => c.cliente_id} showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 18, paddingTop: insets.top + 14, paddingBottom: 28 }}
          ListHeaderComponent={cabecera}
          ListEmptyComponent={<Text style={s.vacio}>{q ? 'Nadie con ese nombre.' : 'Todavía no se ha unido nadie al local.'}</Text>}
          renderItem={({ item }) => {
            const tel = telDe(item.telefono)
            return (
              <View style={s.fila}>
                <TouchableOpacity style={{ flex: 1, minWidth: 0 }} onPress={() => abrir(item)} activeOpacity={0.7}
                  accessibilityRole="button" accessibilityLabel={`Ficha de ${item.nombre}`}>
                  <Text style={s.nombre} numberOfLines={1}>{item.nombre}</Text>
                  {/* «Contigo»: `visitas` cuenta solo las que pasaron por tus
                      perfiles. Sin decirlo, «nunca ha venido» chocaba con un
                      historial del local lleno de visitas con otro barbero. */}
                  <Text style={s.meta} numberOfLines={1}>
                    {item.visitas === 0
                      ? `Nunca ha venido contigo${item.desde ? ` · se unió el ${fechaCorta(item.desde)}` : ''}`
                      : `${item.visitas} ${item.visitas === 1 ? 'visita' : 'visitas'} contigo · última el ${fechaCorta(item.ultima)}`}
                  </Text>
                  {!!notas[item.cliente_id] && (
                    <Text style={s.notaPrev} numberOfLines={1}>Tu nota: {notas[item.cliente_id]}</Text>
                  )}
                </TouchableOpacity>
                {tel && (
                  <>
                    <Contacto icono="logo-whatsapp" etiqueta={`Escribir a ${item.nombre}`} onPress={() => escribirCliente(tel, item.nombre)} />
                    <Contacto icono="call-outline" etiqueta={`Llamar a ${item.nombre}`} onPress={() => llamar(tel)} />
                  </>
                )}
              </View>
            )
          }}
        />
      ) : (
        <FlatList
          data={recuperar} keyExtractor={(c) => c.cliente_id} showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 18, paddingTop: insets.top + 14, paddingBottom: 28 }}
          ListHeaderComponent={cabecera}
          ListEmptyComponent={<Text style={s.vacio}>Nadie por recuperar: tus clientes vuelven a tiempo.</Text>}
          renderItem={({ item }) => {
            const tel = telDe(item.telefono)
            return (
              <View style={s.recup}>
                <TouchableOpacity style={s.recupFila} onPress={() => abrir(item)} activeOpacity={0.7} accessibilityRole="button">
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.nombre, { fontSize: 16.5 }]} numberOfLines={1}>{item.nombre}</Text>
                    <Text style={s.meta}>Última visita: {fechaCorta(item.ultima)}</Text>
                  </View>
                  <Text style={s.dias}>{item.dias}<Text style={s.diasD}>d</Text></Text>
                </TouchableOpacity>
                <View style={s.recupBtns}>
                  {tel ? (
                    <TouchableOpacity style={s.btnRojo} onPress={() => escribirCliente(tel, item.nombre)} accessibilityRole="button">
                      <Text style={s.btnRojoT}>Escribirle por WhatsApp</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={[s.meta, { flex: 1 }]}>No dejó teléfono.</Text>
                  )}
                  <TouchableOpacity style={s.btnContorno} onPress={() => abrir(item)} accessibilityRole="button">
                    <Text style={s.btnContornoT}>Nota</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )
          }}
          ListFooterComponent={recuperar.length > 1 ? (
            <TouchableOpacity style={s.avisar} onPress={avisarATodos} accessibilityRole="button">
              <Ionicons name="chatbox-outline" size={18} color="#fff" />
              <Text style={s.avisarT}>Mandarles un aviso a los {recuperar.length} de una vez</Text>
              <Ionicons name="chevron-forward" size={17} color={COLORS.onCarbonMid} />
            </TouchableOpacity>
          ) : null}
        />
      )}

      {/* LA FICHA. Crece —tarjeta, preferencias, visitas y la nota— así que va
          en la hoja compartida, con el teclado resuelto. */}
      <Hoja visible={!!activo} onClose={() => setActivo(null)}>
        <Text style={s.fTitulo}>{activo?.nombre}</Text>
        <Text style={s.fSub}>
          {typeof activo?.visitas === 'number'
            ? (activo.visitas === 0 ? 'Nunca ha venido contigo' : `${activo.visitas} ${activo.visitas === 1 ? 'visita' : 'visitas'} contigo`)
            : (telDe(activo?.telefono) ?? 'Sin datos de contacto')}
        </Text>

        {cargandoFicha ? <ActivityIndicator color={COLORS.ink} style={{ marginVertical: 26 }} /> : (
          <>
            {ficha?.puntos && (() => {
              const disp = (ficha.puntos.visitas_totales ?? 0) - (ficha.puntos.visitas_canjeadas ?? 0)
              const listo = disp >= ficha.meta
              return (
                <View style={s.dato}>
                  <View style={s.datoFila}>
                    <Text style={s.datoL}>Su tarjeta contigo</Text>
                    <Text style={[s.datoN, listo && { color: COLORS.red }]}>{listo ? `Le toca: ${ficha.premio}` : `${disp} / ${ficha.meta}`}</Text>
                  </View>
                  {!listo && <View style={s.barra}><View style={[s.barraLlena, { width: `${Math.min(100, (disp / Math.max(1, ficha.meta)) * 100)}%` }]} /></View>}
                </View>
              )
            })()}
            {!!ficha?.prefs?.tipo_corte && <Dato l="Corte" v={ficha.prefs.tipo_corte} />}
            {!!ficha?.prefs?.largo && <Dato l="Largo" v={ficha.prefs.largo} />}
            {!!ficha?.prefs?.barba && <Dato l="Barba" v={ficha.prefs.barba} />}
            {/* Las alergias no son una preferencia, son un aviso: por eso se
                ven en rojo y no como un dato más. */}
            {!!ficha?.prefs?.alergias && <Dato l="Alergias" v={ficha.prefs.alergias} rojo />}

            {/* «En el local» porque el historial es del negocio entero y cada
                línea puede ser con otro barbero: se dice con quién. */}
            {!!ficha && ficha.historial.length > 0 && (
              <>
                <Rotulo>Últimas visitas en el local</Rotulo>
                {ficha.historial.slice(0, 6).map((h: any) => (
                  <View key={h.id} style={s.visita}>
                    <Text style={s.visitaF}>{fechaCorta(h.fecha)}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.visitaS} numberOfLines={1}>{h.turno_servicios?.nombre ?? 'Servicio'}</Text>
                      {!!h.turno_perfiles?.turno_usuarios?.nombre && (
                        <Text style={s.meta} numberOfLines={1}>con {h.turno_perfiles.turno_usuarios.nombre}</Text>
                      )}
                    </View>
                    <Text style={s.visitaP}>{dinero(h.precio_cobrado, moneda)}</Text>
                  </View>
                ))}
              </>
            )}

            <Rotulo>Tu nota · solo tú la ves</Rotulo>
            <TextInput style={s.input} placeholder="Cómo le gusta, qué hablaron, qué recordar…" placeholderTextColor={COLORS.textLight}
              value={nota} onChangeText={setNota} multiline />
            <TouchableOpacity style={s.guardar} onPress={guardar} disabled={guardando} accessibilityRole="button">
              {guardando ? <ActivityIndicator color="#fff" /> : <Text style={s.guardarT}>Guardar nota</Text>}
            </TouchableOpacity>
          </>
        )}

        {!!telDe(activo?.telefono) && (
          <View style={s.contactoFila}>
            <TouchableOpacity style={[s.btnContorno, { flex: 1, width: undefined }]} onPress={() => escribirCliente(telDe(activo.telefono)!, activo.nombre)}>
              <Text style={s.btnContornoT}>WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btnContorno, { flex: 1, width: undefined }]} onPress={() => llamar(telDe(activo.telefono)!)}>
              <Text style={s.btnContornoT}>Llamar</Text>
            </TouchableOpacity>
          </View>
        )}
        <TouchableOpacity onPress={() => setActivo(null)} style={{ paddingVertical: 12 }}>
          <Text style={s.cerrar}>Cerrar</Text>
        </TouchableOpacity>
      </Hoja>
    </View>
  )
}

function Contacto({ icono, etiqueta, onPress }: { icono: any; etiqueta: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.contacto} onPress={onPress} accessibilityRole="button" accessibilityLabel={etiqueta} hitSlop={4}>
      <Ionicons name={icono} size={19} color={COLORS.ink} />
    </TouchableOpacity>
  )
}

function Dato({ l, v, rojo }: { l: string; v: string; rojo?: boolean }) {
  return (
    <View style={s.dato}>
      <View style={s.datoFila}>
        <Text style={s.datoL}>{l}</Text>
        <Text style={[s.datoV, rojo && { color: COLORS.redDark }]}>{v}</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  vacio: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textMid, paddingVertical: 36, textAlign: 'center' },
  b: { fontFamily: FONTS.extrabold, color: COLORS.ink },
  buscar: { flexDirection: 'row', alignItems: 'center', gap: 9, height: 46, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 12, marginTop: 16, backgroundColor: COLORS.surface },
  buscarT: { flex: 1, fontFamily: FONTS.medium, fontSize: 14.5, color: COLORS.ink, paddingVertical: 0 },
  ordenes: { flexDirection: 'row', gap: 7, marginTop: 12, marginBottom: 4, flexWrap: 'wrap' },
  orden: { paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1.5, borderColor: COLORS.ink },
  ordenOn: { backgroundColor: COLORS.ink },
  ordenT: { fontFamily: FONTS.extrabold, fontSize: 12, color: COLORS.ink },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  nombre: { fontFamily: FONTS.extrabold, fontSize: 15.5, color: COLORS.ink },
  meta: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.textMid, marginTop: 3 },
  notaPrev: { fontFamily: FONTS.semibold, fontSize: 12, color: COLORS.blue, marginTop: 3 },
  contacto: { width: 42, height: 42, borderWidth: 1.5, borderColor: COLORS.ink, alignItems: 'center', justifyContent: 'center' },
  regla: { marginTop: 16, borderWidth: 2, borderColor: COLORS.red, paddingHorizontal: 13, paddingVertical: 11 },
  reglaT: { fontFamily: FONTS.medium, fontSize: 12.5, lineHeight: 18, color: COLORS.textMid },
  recup: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  recupFila: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  dias: { fontFamily: FONTS.display, fontSize: 28, lineHeight: 32, color: COLORS.red },
  diasD: { fontSize: 14 },
  recupBtns: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 12 },
  btnRojo: { flex: 1, height: 44, backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center' },
  btnRojoT: { fontFamily: FONTS.extrabold, fontSize: 13.5, color: '#fff' },
  btnContorno: { width: 96, height: 44, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  btnContornoT: { fontFamily: FONTS.extrabold, fontSize: 13.5, color: COLORS.ink },
  avisar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, borderRadius: 8, backgroundColor: COLORS.carbon, padding: 15 },
  avisarT: { flex: 1, fontFamily: FONTS.extrabold, fontSize: 14, color: '#fff' },
  fTitulo: { fontFamily: FONTS.display, letterSpacing: -0.6, fontSize: 26, lineHeight: 31, color: COLORS.ink, marginTop: 4 },
  fSub: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textMid, marginTop: 3, marginBottom: 6 },
  dato: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  datoFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  datoL: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textMid },
  datoV: { flex: 1, textAlign: 'right', fontFamily: FONTS.bold, fontSize: 14.5, color: COLORS.ink },
  datoN: { flex: 1, textAlign: 'right', fontFamily: FONTS.display, fontSize: 19, color: COLORS.ink },
  barra: { height: 8, backgroundColor: COLORS.surfaceAlt, marginTop: 10 },
  barraLlena: { height: 8, backgroundColor: COLORS.red },
  visita: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  visitaF: { width: 58, fontFamily: FONTS.display, fontSize: 17, color: COLORS.ink },
  visitaS: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.ink },
  visitaP: { fontFamily: FONTS.display, fontSize: 16, color: COLORS.ink },
  input: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, padding: 13, marginTop: 12, minHeight: 90,
    fontFamily: FONTS.medium, fontSize: 14.5, color: COLORS.ink, textAlignVertical: 'top' },
  guardar: { height: 52, backgroundColor: COLORS.ink, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  guardarT: { fontFamily: FONTS.display, fontSize: 17, color: '#fff', letterSpacing: 0 },
  contactoFila: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cerrar: { fontFamily: FONTS.semibold, textAlign: 'center', color: COLORS.textMid, fontSize: 14 },
})
