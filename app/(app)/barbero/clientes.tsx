import { View, Text, FlatList, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Modal, TextInput, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useLocalSearchParams } from 'expo-router'
import { getSesion } from '../../../lib/storage'
import { getClientesDelLocal, getNotaBarbero, guardarNotaBarbero, getClientesPorRecuperar, getHistorialCliente, getTarjetaCliente, getFidelidad, getPreferenciasCliente, getNegocioById } from '../../../lib/db'
import { dinero, fechaLarga, fechaDeISO } from '../../../lib/format'
import { escribirCliente } from '../../../lib/whatsapp'
import { COLORS, FONTS } from '../../../constants'
import { Display, Avatar } from '../../../components/ui'
import PanelBadge from '../../../components/panel-badge'

export default function Clientes() {
  // Se puede llegar aquí con un cliente concreto desde la fila del barbero: es
  // donde de verdad hace falta —lo tienes delante— y hasta ahora la única forma
  // de ver su historial era buscarlo en la lista, que además solo trae a quien
  // ya te ha visitado. Un cliente nuevo en la silla no aparecía en ningún sitio.
  const { cliente, nombre: nombreParam, telefono: telParam } =
    useLocalSearchParams<{ cliente?: string; nombre?: string; telefono?: string }>()
  const abiertoPorParam = useRef(false)
  const [usuarioId, setUsuarioId] = useState<string | null>(null)
  const [clientes, setClientes] = useState<any[]>([])
  const [recuperar, setRecuperar] = useState<any[]>([])
  const [seg, setSeg] = useState<'todos' | 'recuperar'>('todos')
  const [orden, setOrden] = useState<'recientes' | 'frecuentes' | 'nuevos' | 'az'>('recientes')
  const [loading, setLoading] = useState(true)
  const [activo, setActivo] = useState<any>(null)
  const [nota, setNota] = useState('')
  const [cargandoNota, setCargandoNota] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [negocioId, setNegocioId] = useState<string | null>(null)
  const [moneda, setMoneda] = useState('')
  const [perfilId, setPerfilId] = useState<string | null>(null)
  const [ficha, setFicha] = useState<{ historial: any[]; puntos: any; prefs: any; meta: number; premio: string } | null>(null)

  const cargar = useCallback(async () => {
    const ss = await getSesion()
    if (!ss?.usuario_id) { setLoading(false); return }
    setUsuarioId(ss.usuario_id); setNegocioId(ss.negocio_id ?? null); setPerfilId(ss.perfil_id ?? null)
    const [cl, rec, neg] = await Promise.all([
      ss.negocio_id ? getClientesDelLocal(ss.negocio_id).catch(() => []) : Promise.resolve([]),
      ss.perfil_id ? getClientesPorRecuperar(ss.perfil_id).catch(() => []) : Promise.resolve([]),
      ss.negocio_id ? getNegocioById(ss.negocio_id).catch(() => null) : Promise.resolve(null),
    ])
    setClientes(cl); setRecuperar(rec as any[]); setMoneda((neg as any)?.moneda ?? '')
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  // Se espera a tener negocioId/usuarioId: `abrir` los necesita para pedir el
  // historial y la tarjeta, y sin ellos la ficha saldría vacía.
  useEffect(() => {
    if (!cliente || abiertoPorParam.current || !negocioId || !usuarioId) return
    abiertoPorParam.current = true
    abrir({ cliente_id: cliente, id: cliente, nombre: nombreParam || 'Cliente', telefono: telParam || '' })
  }, [cliente, nombreParam, telParam, negocioId, usuarioId])

  // La ficha completa: nota privada, puntos, preferencias e historial. Antes
  // el barbero solo podía escribir una nota y no veía nada del cliente.
  async function abrir(c: any) {
    setActivo(c); setNota(''); setFicha(null); setCargandoNota(true)
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
    setCargandoNota(false)
  }
  async function guardar() {
    if (!usuarioId || !activo) return
    setGuardando(true)
    try { await guardarNotaBarbero(usuarioId, activo.cliente_id, nota.trim()); setActivo(null) }
    catch (e: any) { Alert.alert('No se pudo guardar', e.message ?? 'Intenta de nuevo.') }
    finally { setGuardando(false) }
  }

  // Cuatro formas de mirar la misma lista, que son las cuatro preguntas que se
  // hace un barbero: ¿quién vino hace poco?, ¿quiénes son mis fijos?, ¿quién se
  // apuntó y no ha venido nunca?, y buscar a alguien por el nombre.
  const ORDENES = [
    { k: 'recientes', l: 'Recientes' },
    { k: 'frecuentes', l: 'Frecuentes' },
    { k: 'nuevos', l: 'Sin venir' },
    { k: 'az', l: 'A–Z' },
  ] as const

  const ordenados = [...clientes].sort((a: any, b: any) => {
    if (orden === 'frecuentes') return b.visitas - a.visitas
    if (orden === 'az') return String(a.nombre).localeCompare(String(b.nombre), 'es')
    if (orden === 'nuevos') {
      // Primero quien nunca ha venido; entre ellos, el que se unió hace más.
      if ((a.visitas === 0) !== (b.visitas === 0)) return a.visitas === 0 ? -1 : 1
      return String(a.desde ?? '').localeCompare(String(b.desde ?? ''))
    }
    return String(b.ultima ?? '').localeCompare(String(a.ultima ?? ''))
  })
  const sinVenir = clientes.filter((c: any) => c.visitas === 0).length

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>

  return (
    <View style={s.container}>
      <PanelBadge />
      <Display size={30} style={{ marginBottom: 14 }}>Clientes</Display>

      <View style={s.segs}>
        <TouchableOpacity style={[s.seg, seg === 'todos' && s.segOn]} onPress={() => setSeg('todos')}><Text style={[s.segT, seg === 'todos' && s.segTOn]}>Todos</Text></TouchableOpacity>
        <TouchableOpacity style={[s.seg, seg === 'recuperar' && s.segOn]} onPress={() => setSeg('recuperar')}><Text style={[s.segT, seg === 'recuperar' && s.segTOn]}>Por recuperar{recuperar.length ? ` · ${recuperar.length}` : ''}</Text></TouchableOpacity>
      </View>

      {seg === 'todos' ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={s.ordenWrap} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
            {ORDENES.map(o => (
              <TouchableOpacity key={o.k} style={[s.ordChip, orden === o.k && s.ordChipOn]} onPress={() => setOrden(o.k)}>
                <Text style={[s.ordChipT, orden === o.k && s.ordChipTOn]}>
                  {o.l}{o.k === 'nuevos' && sinVenir ? ` · ${sinVenir}` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <FlatList
            data={ordenados} keyExtractor={(c) => c.cliente_id} showsVerticalScrollIndicator={false}
            ListEmptyComponent={<Text style={s.empty}>Todavía no se ha unido nadie al local.</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.row} onPress={() => abrir(item)}>
                <Avatar name={item.nombre} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{item.nombre}</Text>
                  {/* "CONTIGO" no es un adorno. `visitas` cuenta solo las que
                      pasaron por tus perfiles, así que ponía "Nunca ha venido" a
                      gente que sí había venido —con otro barbero del local— y
                      justo debajo, en su ficha, salía ese historial con el
                      nombre del compañero. El dato estaba bien; el texto no
                      decía de qué era. */}
                  <Text style={s.meta}>
                    {item.visitas === 0
                      ? `Nunca ha venido contigo${item.desde ? ` · se unió el ${fechaLarga(fechaDeISO(item.desde))}` : ''}`
                      : `${item.visitas} visita${item.visitas === 1 ? '' : 's'} contigo · última ${item.ultima}`}
                  </Text>
                </View>
                {item.visitas > 0 ? <Text style={s.total}>{item.total}</Text> : null}
              </TouchableOpacity>
            )}
          />
        </>
      ) : (
        <FlatList
          data={recuperar} keyExtractor={(c) => c.cliente_id} showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={s.empty}>Nadie por recuperar. Tus clientes vienen seguido 💈</Text>}
          renderItem={({ item }) => (
            <View style={s.row}>
              <Avatar name={item.nombre} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.nombre}</Text>
                <Text style={s.meta}>Hace {item.dias} días · última {item.ultima}</Text>
              </View>
              {item.telefono && item.telefono !== '-' ? (
                <TouchableOpacity style={s.wa} onPress={() => escribirCliente(item.telefono, item.nombre)}><Ionicons name="logo-whatsapp" size={20} color={COLORS.success} /></TouchableOpacity>
              ) : null}
            </View>
          )}
        />
      )}

      <Modal visible={!!activo} transparent animationType="slide" onRequestClose={() => setActivo(null)}>
        <View style={s.modalBg}>
          {/* La ficha crece: puntos, preferencias, seis visitas y la nota. Sin
              scroll, en un teléfono normal el botón de guardar quedaba fuera de
              la pantalla y no había forma de llegar a él. */}
          <View style={s.modal}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Abrir desde la fila del barbero trae solo nombre y teléfono: no
                hay conteo de visitas todavía. La cabecera lo daba por hecho y
                escribía "· undefined visitas" a quien tenías delante. Aquí solo
                se dice lo que se sabe. */}
            <View style={s.modalHead}>
              <Avatar name={activo?.nombre} size={48} />
              <View style={{ flex: 1 }}>
                <Display size={22}>{activo?.nombre}</Display>
                <Text style={s.modalSub}>
                  {[
                    activo?.telefono && activo.telefono !== '-' ? activo.telefono : null,
                    typeof activo?.visitas === 'number'
                      ? (activo.visitas === 0 ? 'nunca ha venido contigo'
                        : `${activo.visitas} visita${activo.visitas === 1 ? '' : 's'} contigo`)
                      : null,
                  ].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                </Text>
              </View>
              {activo?.telefono && activo.telefono !== '-' ? (
                <TouchableOpacity style={s.wa} onPress={() => escribirCliente(activo.telefono, activo.nombre)}><Ionicons name="logo-whatsapp" size={22} color={COLORS.success} /></TouchableOpacity>
              ) : null}
            </View>
            {ficha?.puntos && (() => {
              const disp = (ficha.puntos.visitas_totales ?? 0) - (ficha.puntos.visitas_canjeadas ?? 0)
              const enCiclo = ficha.meta > 0 ? disp % ficha.meta : 0
              const listo = disp >= ficha.meta
              return (
                <View style={s.puntos}>
                  <Ionicons name={listo ? 'gift' : 'cut'} size={18} color="#fff" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.puntosT}>{listo ? `Le toca: ${ficha.premio}` : `${enCiclo} de ${ficha.meta} recortes`}</Text>
                    <Text style={s.puntosD}>{listo ? 'Ya lo ganó' : `Faltan ${ficha.meta - enCiclo} para ${ficha.premio.toLowerCase()}`}</Text>
                  </View>
                </View>
              )
            })()}

            {ficha?.prefs && (ficha.prefs.tipo_corte || ficha.prefs.largo || ficha.prefs.barba || ficha.prefs.alergias) && (
              <>
                <Text style={s.notaLbl}>CÓMO LE GUSTA</Text>
                <Text style={s.prefs}>
                  {[ficha.prefs.tipo_corte, ficha.prefs.largo, ficha.prefs.barba].filter(Boolean).join(' · ')}
                </Text>
                {ficha.prefs.alergias ? <Text style={s.alerta}>⚠ Alergias: {ficha.prefs.alergias}</Text> : null}
              </>
            )}

            {/* "EN EL LOCAL" porque eso es lo que es: el historial viene del
                negocio entero y cada línea puede llevar el nombre de otro
                barbero. Sin decirlo, chocaba de frente con el "nunca ha venido"
                de la lista y parecía que uno de los dos mentía. */}
            {ficha && ficha.historial.length > 0 && (
              <>
                <Text style={s.notaLbl}>ÚLTIMAS VISITAS EN EL LOCAL</Text>
                {ficha.historial.slice(0, 6).map((h: any) => (
                  <View key={h.id} style={s.visita}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.visitaS}>{h.turno_servicios?.nombre ?? 'Servicio'}</Text>
                      <Text style={s.visitaF}>
                        {fechaLarga(fechaDeISO(h.fecha))}
                        {h.turno_perfiles?.turno_usuarios?.nombre ? ` · ${h.turno_perfiles.turno_usuarios.nombre}` : ''}
                      </Text>
                    </View>
                    <Text style={s.visitaP}>{dinero(h.precio_cobrado, moneda)}</Text>
                  </View>
                ))}
              </>
            )}

            <Text style={s.notaLbl}>NOTA PRIVADA</Text>
            {cargandoNota ? <ActivityIndicator color={COLORS.red} style={{ marginVertical: 20 }} /> : (
              <TextInput style={s.input} placeholder="Preferencias, alergias, recordatorios…" placeholderTextColor={COLORS.textLight}
                value={nota} onChangeText={setNota} multiline />
            )}
            <TouchableOpacity style={s.btn} onPress={guardar} disabled={guardando}>
              {guardando ? <ActivityIndicator color="#fff" /> : <Text style={s.btnT}>Guardar nota</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setActivo(null)}><Text style={s.cerrar}>Cerrar</Text></TouchableOpacity>
          </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  ordenWrap: { flexGrow: 0, marginBottom: 10 },
  ordChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  ordChipOn: { backgroundColor: COLORS.carbon, borderColor: COLORS.carbon },
  ordChipT: { color: COLORS.textMid, fontSize: 13, fontWeight: '700' },
  ordChipTOn: { color: '#fff' },
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 16, paddingTop: 72 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  empty: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, textAlign: 'center', paddingVertical: 40 },
  segs: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  seg: { flex: 1, paddingVertical: 10, borderRadius: 11, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  segOn: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  segT: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.textMid },
  segTOn: { color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, marginBottom: 8 },
  name: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  meta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  total: { fontFamily: FONTS.display, fontSize: 20, color: COLORS.ink },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: COLORS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '88%' },
  modalSub: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, marginTop: 4 },
  modalHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  wa: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.successLight, alignItems: 'center', justifyContent: 'center' },
  puntos: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.red, borderRadius: 12, padding: 13, marginBottom: 4 },
  puntosT: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
  puntosD: { fontFamily: FONTS.medium, fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 1 },
  prefs: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.ink, marginBottom: 4 },
  alerta: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.red, marginBottom: 4 },
  visita: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  visitaS: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.ink },
  visitaF: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 1, textTransform: 'capitalize' },
  visitaP: { fontFamily: FONTS.display, fontSize: 16, color: COLORS.ink },
  notaLbl: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginBottom: 8 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 14, fontSize: 15, fontFamily: FONTS.medium, minHeight: 90, textAlignVertical: 'top', marginBottom: 16, color: COLORS.ink },
  // Azul: guardar una nota no es una acción de marca ni destructiva, es
  // trabajo de ficha. El rojo queda para lo que mueve la fila.
  btn: { backgroundColor: COLORS.blue, borderRadius: 14, padding: 16, alignItems: 'center' },
  btnT: { fontFamily: FONTS.bold, fontSize: 16, color: '#fff' },
  cerrar: { fontFamily: FONTS.semibold, textAlign: 'center', color: COLORS.textLight, fontSize: 14, marginTop: 14 },
})
