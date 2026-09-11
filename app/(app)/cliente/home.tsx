import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert } from 'react-native'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getSesion, guardarSesion } from '../../../lib/storage'
import {
  getNegocioById, getEstadoLocal, getResumenFila, getMiTurnoActivo, getMisCitas, getPuesto,
  confirmarCita, cancelarCita, getMisNegociosCliente,
  getMisTarjetas, getHistorialCliente, getMiUsuario,
} from '../../../lib/db'
import { suscribirCola, desuscribir } from '../../../lib/realtime'
import { programarRecordatoriosCitas, avisos } from '../../../lib/notificaciones'
import { COLORS, FONTS } from '../../../constants'
import { hora12, dinero, fechaLarga, fechaDeISO } from '../../../lib/format'
import { direccionCompleta } from '../../../lib/paises'
import { Display, Avatar, Badge } from '../../../components/ui'
import EstadoLocal from '../../../components/estado-local'

function cuentaRegresiva(fecha: string, hora: string) {
  const ms = new Date(`${fecha}T${hora}`).getTime() - Date.now()
  if (ms <= 0) return 'ahora'
  const min = Math.floor(ms / 60000), h = Math.floor(min / 60), d = Math.floor(h / 24)
  if (d >= 1) return `en ${d} día${d > 1 ? 's' : ''}`
  if (h >= 1) return `en ${h}h ${min % 60}m`
  return `en ${min} min`
}

/**
 * QUÉ LE PASA A MI CITA, DICHO PARA EL CLIENTE.
 *
 * El barbero tiene FRASE_CITA en components/agenda-trabajo.tsx desde que se
 * revisó su lado; el cliente no tenía nada. Una cita a la que se le pasó la
 * hora de confirmar se veía EXACTAMENTE igual que una recién hecha: mismo
 * título, mismo "Confirmar", mismo "Reprogramar", mismo "Cancelar". La pantalla
 * daba por activa una cita que el barbero ya está mirando como dudosa.
 *
 * Son las mismas frases que ve el barbero, contadas desde el otro lado de la
 * silla: lo que uno lee y lo que lee el otro tienen que ser la misma historia.
 */
const FRASE_CITA: Record<string, string> = {
  creada: 'Reservada. Confirma que vas para que te guarden el lugar.',
  confirmada: 'Confirmada. Te esperan a esa hora.',
  no_confirmada: 'Se pasó la hora de confirmar. Puedes confirmar todavía, pero tu lugar ya no está garantizado.',
  en_camino: 'Dijiste que vas en camino.',
}

/**
 * Si ya pasó la hora de la cita.
 *
 * `getMisCitas` filtra por FECHA (`fecha >= hoy`), no por hora, así que una cita
 * de las 10:00 seguía saliendo a las seis de la tarde como "PRÓXIMA CITA" — y
 * cuentaRegresiva, al ser el resto negativo, decía "ahora" durante ocho horas
 * seguidas. El cron la cierra de madrugada; hasta entonces la pantalla mentía.
 */
function yaPaso(cita: any) {
  const fin = cita?.hora_fin ?? cita?.hora_inicio
  if (!cita?.fecha || !fin) return false
  return new Date(`${cita.fecha}T${fin}`).getTime() < Date.now()
}

export default function Home() {
  const router = useRouter()
  const [sesion, setSesion] = useState<any>(null)
  const [miNombre, setMiNombre] = useState('')
  const [negocio, setNegocio] = useState<any>(null)
  const [negocios, setNegocios] = useState<any[]>([])
  // El local silla por silla y la espera de ahora: lo que alimenta el cuadro
  // de estado. Ver components/estado-local.tsx.
  const [sillas, setSillas] = useState<any[]>([])
  const [resumen, setResumen] = useState<{ delante: number; espera_min: number }>({ delante: 0, espera_min: 0 })
  const [turno, setTurno] = useState<any>(null)
  const [puesto, setPuesto] = useState<number | null>(null)
  const [citas, setCitas] = useState<any[]>([])
  const [tarjetas, setTarjetas] = useState<any[]>([])
  const [historial, setHistorial] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  /** El barbero descubría los huecos al abrir la agenda; ahora se entera. */
  function avisarCancelacion(cita: any) {
    const barbero = cita?.turno_perfiles?.usuario_id
    if (barbero) {
      avisos.barberoCitaCancelada(barbero, miNombre || 'Un cliente',
        `${fechaLarga(fechaDeISO(cita.fecha))} a las ${hora12(cita.hora_inicio)}`)
    }
  }

  const cargar = useCallback(async () => {
    const ss = await getSesion(); setSesion(ss)
    if (!ss?.negocio_id || !ss?.usuario_id) { setLoading(false); return }
    const [neg, est, res, t, cs, negs, pts, hist, yo] = await Promise.all([
      getNegocioById(ss.negocio_id),
      getEstadoLocal(ss.negocio_id).catch(() => []),
      getResumenFila(ss.negocio_id).catch(() => ({ delante: 0, espera_min: 0 })),
      getMiTurnoActivo(ss.usuario_id, ss.negocio_id),
      getMisCitas(ss.usuario_id, ss.negocio_id).catch(() => []),
      getMisNegociosCliente(ss.usuario_id).catch(() => []),
      getMisTarjetas(ss.negocio_id).catch(() => []),
      getHistorialCliente(ss.usuario_id, ss.negocio_id).catch(() => []),
      getMiUsuario().catch(() => null),
    ])
    setNegocio(neg); setSillas(est as any[]); setResumen(res); setTurno(t); setCitas(cs as any[])
    setPuesto(t?.id ? await getPuesto(t.id).catch(() => null) : null)
    setNegocios(negs as any[]); setTarjetas((pts as any[]) ?? []); setHistorial(hist as any[]); setMiNombre((yo as any)?.nombre ?? '')
    programarRecordatoriosCitas((cs as any[]).map(c => ({ fecha: c.fecha, hora_inicio: c.hora_inicio, servicio: c.turno_servicios?.nombre })))
    setLoading(false); setRefreshing(false)
  }, [])

  useEffect(() => {
    cargar()
    let sub: any
    getSesion().then(ss => { if (ss?.negocio_id) sub = suscribirCola(ss.negocio_id, () => cargar()) })
    return () => { if (sub) desuscribir(sub) }
  }, [cargar])

  /**
   * VOLVER A ESTA PANTALLA ES UN MOTIVO PARA RECARGAR.
   *
   * Reportado desde el teléfono: "hice dos citas y no aparecen; hay que esperar
   * un rato para que se vean". La suscripción en vivo es de la COLA, no de las
   * citas, así que reservar no disparaba nada aquí; y `cargar()` solo corría al
   * montar. Se reservaba, se volvía, y la pantalla seguía enseñando lo que
   * había antes de salir — hasta que algo tocaba la cola por otro motivo.
   *
   * El primer foco se salta porque el montaje ya cargó: si no, cada entrada a
   * Inicio pide todo dos veces.
   */
  const yaEnfocado = useRef(false)
  useFocusEffect(useCallback(() => {
    if (!yaEnfocado.current) { yaEnfocado.current = true; return }
    cargar()
  }, [cargar]))

  async function cambiarNegocio(negocio_id: string) {
    const ss = await getSesion(); if (!ss) return
    await guardarSesion({ ...ss, negocio_id }); setLoading(true); cargar()
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>

  // Lo que hay detrás de cada puerta, para escribirlo EN la puerta. Sale del
  // servidor (migración 77): la misma respuesta que daría al rechazar el turno.
  const hayFilaAbierta = sillas.some((x: any) => x.fila_abierta)
  const hayCitas = sillas.some((x: any) => x.acepta_citas)
  const motivos = Array.from(new Set(sillas.map((x: any) => x.fila_motivo).filter(Boolean))) as string[]
  const motivoFilaLocal = !hayFilaAbierta && motivos.length === 1
    ? motivos[0].charAt(0).toUpperCase() + motivos[0].slice(1)
    : null

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: 72, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar() }} />}>

      <Text style={s.hola}>Hola</Text>
      <View style={s.marcaHead}>
        {negocio?.logo_url ? <Avatar name={negocio?.nombre} uri={negocio.logo_url} size={52} bg={COLORS.carbon} /> : null}
        <View style={{ flex: 1 }}>
          <Display size={28}>{negocio?.nombre ?? 'Tu barbería'}</Display>
          {negocio?.slogan ? <Text style={s.marcaSlogan}>{negocio.slogan}</Text> : null}
          {/* La dirección entera, con sector, ciudad y el punto de referencia:
              es como se explica aquí dónde queda un sitio. Ver lib/paises.ts. */}
          {direccionCompleta(negocio ?? {}) ? (
            <View style={s.marcaMetaRow}>
              <Ionicons name="location-outline" size={13} color={COLORS.textLight} />
              <Text style={s.marcaMeta} numberOfLines={2}>{direccionCompleta(negocio ?? {})}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }} contentContainerStyle={{ gap: 8 }}>
        {negocios.map((n: any) => {
          const activa = n.negocio_id === sesion?.negocio_id
          return (
            <TouchableOpacity key={n.negocio_id} style={[s.tab, activa && s.tabOn]} onPress={() => !activa && cambiarNegocio(n.negocio_id)}>
              <Text style={[s.tabT, activa && { color: '#fff' }]} numberOfLines={1}>{n.nombre}</Text>
            </TouchableOpacity>
          )
        })}
        <TouchableOpacity style={s.tabMas} onPress={() => router.push('/(auth)/cliente-codigo')}><Ionicons name="add" size={20} color={COLORS.red} /></TouchableOpacity>
        <TouchableOpacity style={s.tabMas} onPress={() => router.push('/(app)/cliente/buscar-barbero')}><Ionicons name="person-add-outline" size={18} color={COLORS.blue} /></TouchableOpacity>
      </ScrollView>

      {/* CÓMO ESTÁ LA BARBERÍA AHORA. Lo primero, porque es lo primero que se
          pregunta quien abre la app: el barbero tiene su panel y el dueño su
          cola del local, y el cliente no tenía nada — abría Inicio y veía un
          catálogo. */}
      <EstadoLocal sillas={sillas as any} delante={resumen.delante} esperaMin={resumen.espera_min} />

      {turno && (
        <TouchableOpacity style={s.fila} onPress={() => router.push('/(app)/cliente/turno')}>
          <View style={s.rowLbl}><Ionicons name="flash" size={13} color={COLORS.red} /><Text style={s.filaLbl}>EN LA FILA</Text></View>
          <Text style={s.filaTitle}>{turno.turno_servicios?.nombre}</Text>
          {/* El puesto sale de turno_puesto, no de la columna `posicion`: esa
              cuenta también al que ya está en la silla. Ver getPuesto. */}
          <Text style={s.filaSub}>
            {turno.estado === 'en_fila'
              ? (puesto === 1 ? 'Eres el siguiente' : puesto ? `Puesto ${puesto} en la fila digital` : 'En la fila digital')
              : turno.estado === 'llamado' ? 'Te están llamando' : 'Vas en camino'}
          </Text>
          <View style={s.linkRow}><Text style={s.filaLink}>Ver mi turno</Text><Ionicons name="chevron-forward" size={16} color="#fff" /></View>
        </TouchableOpacity>
      )}

      {citas.length > 0 && <Text style={s.sec}>TUS CITAS</Text>}
      {citas.map((cita: any, i: number) => {
        // Una cita cuya hora ya pasó no es una cita próxima, y sobre todo no es
        // una cita sobre la que el cliente pueda hacer nada útil: quien decide
        // ahora es el barbero, que la marcará atendida o no llegó. Ofrecerle
        // "Confirmar" es pedirle que confirme el pasado, y "Cancelar" le avisa
        // al barbero de la cancelación de algo que ya no va a ocurrir.
        // Reprogramar sí sigue teniendo sentido: es lo único que arregla algo.
        const pasada = yaPaso(cita)
        const porConfirmar = !pasada && (cita.estado === 'creada' || cita.estado === 'no_confirmada')
        return (
        <View key={cita.id} style={[s.cita, pasada && s.citaPasada]}>
          <View style={[s.citaIcon, pasada && s.citaIconPasada]}>
            <Ionicons name={pasada ? 'time-outline' : 'calendar'} size={22}
              color={pasada ? COLORS.textLight : COLORS.red} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={s.citaTop}>
              <Text style={s.citaKick}>{pasada ? 'SE PASÓ LA HORA' : i === 0 ? 'PRÓXIMA CITA' : 'CITA'}</Text>
              {!pasada && <Text style={s.citaCd}>{cuentaRegresiva(cita.fecha, cita.hora_inicio)}</Text>}
            </View>
            <Text style={s.citaServ}>{cita.turno_servicios?.nombre}</Text>
            <Text style={s.citaMeta}>{cita.fecha} · {hora12(cita.hora_inicio)} · {cita.turno_perfiles?.turno_usuarios?.nombre ?? ''}</Text>

            {/* En qué estado está, con palabras. Antes no se decía en ningún
                sitio: una cita a la que se le pasó el plazo de confirmar se
                veía idéntica a una recién hecha. */}
            <Text style={s.citaEstado}>
              {pasada
                ? 'El barbero dirá si te atendió o si no llegaste. Si quieres otra hora, reprográmala.'
                : FRASE_CITA[cita.estado] ?? cita.estado}
            </Text>

            <View style={s.citaAcc}>
              {porConfirmar
                ? <TouchableOpacity style={s.citaBtn} onPress={async () => { await confirmarCita(cita.id); cargar() }}><Text style={s.citaBtnT}>Confirmar</Text></TouchableOpacity>
                : !pasada && cita.estado === 'en_camino' ? <Badge tone="blue">Vas en camino</Badge>
                : !pasada ? <Badge tone="success">Confirmada</Badge>
                : null}
              <TouchableOpacity onPress={() => router.push({ pathname: '/(app)/cliente/agendar', params: { perfil: cita.perfil_id, servicio: cita.servicio_id, reagendar: cita.id } })}>
                <Text style={s.citaReprog}>Reprogramar</Text>
              </TouchableOpacity>
              {!pasada && (
                <TouchableOpacity onPress={() => Alert.alert('Cancelar cita', '¿Cancelar esta cita?', [{ text: 'No' }, { text: 'Sí', style: 'destructive', onPress: async () => { await cancelarCita(cita.id); avisarCancelacion(cita); cargar() } }])}>
                  <Text style={s.citaCancel}>Cancelar</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
        )
      })}

      {/* ── QUÉ PUEDES HACER ────────────────────────────────────────────────
          Aquí había DOS cosas: un botón de reservar cita y, debajo, la lista
          entera de barberos con sus servicios y precios para entrar a la fila
          —la misma lista, con los mismos botones, que ya existe en "Mi turno"—.
          Dos sitios para hacer lo mismo obligan a recordar en cuál estabas, y
          además Inicio acababa siendo un catálogo de cuatro pantallas de largo.

          Ahora Inicio contesta "¿cómo está esto y qué tengo yo?" y ofrece las
          dos puertas, con lo que hay detrás de cada una escrito en la puerta:
          la espera real de la fila, o el día y la hora si prefieres reservar.
          Elegir barbero y servicio pasa en la pantalla donde se elige. */}
      <Text style={s.sec}>¿QUÉ QUIERES HACER?</Text>

      <TouchableOpacity style={s.accion} onPress={() => router.push('/(app)/cliente/turno')}>
        <View style={s.accIcon}><Ionicons name="flash-outline" size={22} color={COLORS.red} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.accTitle}>Entrar a la fila digital</Text>
          <Text style={s.accSub}>
            {!hayFilaAbierta
              ? (motivoFilaLocal ?? 'Ahora mismo no hay nadie abierto')
              : resumen.delante === 0 ? 'Nadie esperando · entras directo'
              : `${resumen.delante} esperando${resumen.espera_min > 0 ? ` · unos ${resumen.espera_min} min` : ''}`}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
      </TouchableOpacity>

      <TouchableOpacity style={s.accion} onPress={() => router.push('/(app)/cliente/agendar')}>
        <View style={s.accIcon}><Ionicons name="calendar-outline" size={22} color={COLORS.red} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.accTitle}>Reservar una cita</Text>
          <Text style={s.accSub}>
            {hayCitas ? 'Eliges día y hora · tu lugar queda reservado' : 'Aquí nadie está tomando citas ahora mismo'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
      </TouchableOpacity>

      {/* Recortes, no puntos: "cada X recortes te ganas esto". Puede haber una
          tarjeta por barbero si el local alquila asientos. */}
      {tarjetas.map((t: any) => {
        const enCiclo = t.meta > 0 ? t.visitas % t.meta : 0
        const faltan = Math.max(0, t.meta - enCiclo)
        const listo = t.visitas >= t.meta
        const pct = t.meta > 0 ? Math.min(100, Math.round((enCiclo / t.meta) * 100)) : 0
        return (
          <TouchableOpacity key={t.perfil_id ?? 'local'} style={s.pts} onPress={() => router.push('/(app)/cliente/perfil')}>
            <View style={s.ptsHead}>
              <Text style={s.ptsLbl}>{t.ambito === 'perfil' && t.barbero ? `CON ${String(t.barbero).toUpperCase()}` : 'FIDELIDAD'}</Text>
              <Text style={s.ptsNum}>{enCiclo} / {t.meta} recortes</Text>
            </View>
            <View style={s.barBg}><View style={[s.barFill, { width: `${listo ? 100 : pct}%` }]} /></View>
            <View style={s.ptsFoot}>
              <Text style={s.ptsMeta}>{t.premio}</Text>
              <Text style={s.ptsFaltan}>{listo ? '¡Disponible!' : `Faltan ${faltan} recorte${faltan === 1 ? '' : 's'}`}</Text>
            </View>
          </TouchableOpacity>
        )
      })}

      {historial.length > 0 && (
        <>
          <View style={s.histHead}><Text style={s.sec}>TUS VISITAS</Text><TouchableOpacity onPress={() => router.push('/(app)/cliente/historial')}><Text style={s.verTodo}>Ver todo</Text></TouchableOpacity></View>
          {historial.slice(0, 4).map((h: any) => (
            <View key={h.id} style={s.histItem}>
              <View style={{ flex: 1 }}><Text style={s.histServ}>{h.turno_servicios?.nombre ?? 'Servicio'}</Text><Text style={s.histMeta}>{h.fecha} · {h.turno_perfiles?.turno_usuarios?.nombre ?? ''}</Text></View>
              <Text style={s.histPrecio}>{dinero(h.precio_cobrado, negocio?.moneda)}</Text>
            </View>
          ))}
        </>
      )}

    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  hola: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.textLight, letterSpacing: 0.4, marginBottom: 4 },
  marcaHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  marcaSlogan: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textMid, marginTop: 2 },
  marcaMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  marcaMeta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight },
  tab: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 11, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  tabOn: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  tabT: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.textMid, maxWidth: 160 },
  tabMas: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 11, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  rowLbl: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 12 },
  fila: { backgroundColor: COLORS.carbon, borderRadius: 16, padding: 18, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: COLORS.red },
  filaLbl: { fontFamily: FONTS.bold, fontSize: 11, color: COLORS.red, letterSpacing: 1 },
  filaTitle: { fontFamily: FONTS.extrabold, fontSize: 19, color: '#fff', marginTop: 8 },
  filaSub: { fontFamily: FONTS.medium, fontSize: 14, color: '#9A9CA6', marginTop: 2 },
  filaLink: { fontFamily: FONTS.bold, fontSize: 14, color: '#fff' },
  cita: { flexDirection: 'row', gap: 12, backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 18, borderWidth: 1, borderColor: COLORS.border },
  citaIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.redLight, alignItems: 'center', justifyContent: 'center' },
  citaTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  citaKick: { fontFamily: FONTS.bold, fontSize: 11, color: COLORS.textLight, letterSpacing: 1 },
  citaCd: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.red },
  citaServ: { fontFamily: FONTS.extrabold, fontSize: 18, color: COLORS.ink, marginTop: 4 },
  citaMeta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textMid, marginTop: 2 },
  citaEstado: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.textMid, marginTop: 8, lineHeight: 17 },
  citaPasada: { backgroundColor: COLORS.bg, borderStyle: 'dashed' },
  citaIconPasada: { backgroundColor: COLORS.border },
  citaAcc: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12 },
  citaBtn: { backgroundColor: COLORS.red, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  citaBtnT: { fontFamily: FONTS.bold, color: '#fff', fontSize: 13 },
  citaReprog: { fontFamily: FONTS.semibold, color: COLORS.blue, fontSize: 13 },
  citaCancel: { fontFamily: FONTS.semibold, color: COLORS.textLight, fontSize: 13 },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginBottom: 12 },
  // Las dos puertas. Misma forma las dos: ninguna es "la buena" — depende de
  // si tienes prisa o de si quieres una hora.
  // Aquí vivían los estilos del catálogo de barberos y servicios: se fueron
  // con él a "Mi turno", que es donde se elige.
  accion: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  accIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.redLight, alignItems: 'center', justifyContent: 'center' },
  accTitle: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  accSub: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  pts: { backgroundColor: COLORS.carbon, borderRadius: 16, padding: 16, marginTop: 6, marginBottom: 22 },
  ptsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ptsLbl: { fontFamily: FONTS.bold, fontSize: 11, color: 'rgba(255,255,255,0.55)', letterSpacing: 1 },
  ptsNum: { fontFamily: FONTS.display, fontSize: 22, color: '#fff' },
  barBg: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 10, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: COLORS.red },
  ptsFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  ptsMeta: { fontFamily: FONTS.medium, fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  ptsFaltan: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.red },
  histHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  verTodo: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.blue, marginBottom: 12 },
  histItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: COLORS.borderSoft },
  histServ: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  histMeta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  histPrecio: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.ink },
})
