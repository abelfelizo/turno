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
import { Display, Avatar, Badge, NoCargo, Ticket } from '../../../components/ui'
import EstadoLocal from '../../../components/estado-local'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

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
  // El hueco de arriba lo dice el sistema, no un número: en un teléfono con
  // isla dinámica 72 px se quedaban cortos y en uno sin muesca sobraban.
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [sesion, setSesion] = useState<any>(null)
  const [miNombre, setMiNombre] = useState('')
  const [negocio, setNegocio] = useState<any>(null)
  const [negocios, setNegocios] = useState<any[]>([])
  // El local silla por silla y la espera de ahora: lo que alimenta el cuadro
  // de estado. Ver components/estado-local.tsx.
  const [sillas, setSillas] = useState<any[]>([])
  // Cero sillas y "no pude preguntar" no son lo mismo. Sin esta distinción, un
  // fallo de red le diría al cliente que su barbería no atiende.
  const [sillasOk, setSillasOk] = useState(false)
  const [resumen, setResumen] = useState<{ delante: number; espera_min: number }>({ delante: 0, espera_min: 0 })
  const [turno, setTurno] = useState<any>(null)
  const [puesto, setPuesto] = useState<number | null>(null)
  const [citas, setCitas] = useState<any[]>([])
  const [tarjetas, setTarjetas] = useState<any[]>([])
  const [historial, setHistorial] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  /** No es lo mismo «no hay nada» que «no pude preguntar». Ver NoCargo. */
  const [fallo, setFallo] = useState(false)

  /** El barbero descubría los huecos al abrir la agenda; ahora se entera. */
  function avisarCancelacion(cita: any) {
    const barbero = cita?.turno_perfiles?.usuario_id
    if (barbero) {
      avisos.barberoCitaCancelada(barbero, miNombre || 'Un cliente',
        `${fechaLarga(fechaDeISO(cita.fecha))} a las ${hora12(cita.hora_inicio)}`)
    }
  }

  const cargar = useCallback(async () => {
   // EL TRY NO ES ADORNO. `setLoading(false)` estaba suelto detrás del await,
   // y dos de estas nueve llamadas no llevaban `.catch`: si cualquiera de las
   // dos fallaba, esta función reventaba, el spinner no se quitaba nunca y la
   // pantalla de inicio del cliente se quedaba girando hasta cerrar la app.
   try {
    setFallo(false)
    const ss = await getSesion(); setSesion(ss)
    if (!ss?.negocio_id || !ss?.usuario_id) { setLoading(false); return }
    const [neg, est, res, t, cs, negs, pts, hist, yo] = await Promise.all([
      getNegocioById(ss.negocio_id),
      getEstadoLocal(ss.negocio_id).catch(() => null),
      getResumenFila(ss.negocio_id).catch(() => ({ delante: 0, espera_min: 0 })),
      getMiTurnoActivo(ss.usuario_id, ss.negocio_id),
      getMisCitas(ss.usuario_id, ss.negocio_id).catch(() => []),
      getMisNegociosCliente(ss.usuario_id).catch(() => []),
      getMisTarjetas(ss.negocio_id).catch(() => []),
      getHistorialCliente(ss.usuario_id, ss.negocio_id).catch(() => []),
      getMiUsuario().catch(() => null),
    ])
    setNegocio(neg); setSillas((est ?? []) as any[]); setSillasOk(est != null)
    setResumen(res); setTurno(t); setCitas(cs as any[])
    setPuesto(t?.id ? await getPuesto(t.id).catch(() => null) : null)
    setNegocios(negs as any[]); setTarjetas((pts as any[]) ?? []); setHistorial(hist as any[]); setMiNombre((yo as any)?.nombre ?? '')
    programarRecordatoriosCitas((cs as any[]).map(c => ({ fecha: c.fecha, hora_inicio: c.hora_inicio, servicio: c.turno_servicios?.nombre })))
   } catch {
     setFallo(true)
   } finally {
     setLoading(false); setRefreshing(false)
   }
  }, [])

  // LA SUSCRIPCIÓN SE ESCAPABA, Y ESO TRAÍA DATOS DE OTRO LOCAL.
  //
  // `getSesion()` es una promesa: si la pantalla se desmonta antes de que
  // resuelva —cambiar de panel es exactamente eso— la limpieza corría con
  // `sub` todavía sin asignar, y un instante después se creaba una suscripción
  // que ya nadie iba a cerrar. Cambiar de barbería un par de veces dejaba
  // varias vivas, cada una llamando a `cargar()` de una pantalla que pertenece
  // a otro local. Por eso aparecían nombres y colas que no eran de aquí.
  useEffect(() => {
    let vivo = true
    let sub: any
    cargar()
    getSesion().then(ss => {
      if (!vivo || !ss?.negocio_id) return
      sub = suscribirCola(ss.negocio_id, () => cargar())
    })
    return () => { vivo = false; if (sub) desuscribir(sub) }
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
  if (fallo) return <View style={s.center}><NoCargo que="tu barbería" onReintentar={() => { setLoading(true); cargar() }} /></View>

  // Lo que hay detrás de cada puerta, para escribirlo EN la puerta. Sale del
  // servidor (migración 77): la misma respuesta que daría al rechazar el turno.
  const hayFilaAbierta = sillas.some((x: any) => x.fila_abierta)
  const hayCitas = sillas.some((x: any) => x.acepta_citas)
  const motivos = Array.from(new Set(sillas.map((x: any) => x.fila_motivo).filter(Boolean))) as string[]
  const motivoFilaLocal = !hayFilaAbierta && motivos.length === 1
    ? motivos[0].charAt(0).toUpperCase() + motivos[0].slice(1)
    : null

  /**
   * UNA BARBERÍA QUE TODAVÍA NO ATIENDE POR LA APP (migraciones 95 y 96).
   *
   * Dicho desde el teléfono: «un cliente que entra a una barbería sin barberos
   * con suscripción activa no puede hacer nada, solo ve la información del
   * negocio; solo ve los barberos con suscripción activa».
   *
   * Desde la 96 turno_estado_local ya no devuelve las sillas que no están al
   * día, así que aquí llegan cero y el cuadro de estado desaparece solo. Lo que
   * quedaba era peor que nada: dos botones grandes —fila y cita— que llevan a
   * pantallas vacías. La puerta abierta a un sitio donde no hay nada.
   *
   * Y SE DICE SIN DELATAR A NADIE. El cliente no tiene por qué enterarse de que
   * su barbero no pagó la app: eso es un problema entre el barbero y nosotros,
   * no una nota en el escaparate de su negocio. Es la misma frase neutra que
   * usa turno_fila_abierta desde la migración 95, y por la misma razón.
   *
   * El negocio NO desaparece: nombre, logo, dirección, sus otras barberías y
   * sus tarjetas de fidelidad siguen donde estaban. Lo que no se enseña es una
   * fila que no existe.
   */
  const sinServicio = sillasOk && sillas.length === 0

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: 32 }}
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
        <TouchableOpacity activeOpacity={0.9} style={s.fila} onPress={() => router.push('/(app)/cliente/turno')}>
          <Ticket
            fondo={COLORS.bg}
            pie={<View style={s.linkRow}><Text style={s.filaLink}>Ver mi turno</Text><Ionicons name="chevron-forward" size={16} color="#fff" /></View>}>
            <View style={s.rowLbl}><Ionicons name="flash" size={13} color={COLORS.redSoft} /><Text style={s.filaLbl}>EN LA FILA</Text></View>
            <Text style={s.filaTitle}>{turno.turno_servicios?.nombre}</Text>
            {/* El puesto sale de turno_puesto, no de la columna `posicion`: esa
                cuenta también al que ya está en la silla. Ver getPuesto. */}
            <Text style={s.filaSub}>
              {turno.estado === 'en_fila'
                ? (puesto === 1 ? 'Eres el siguiente' : puesto ? `Puesto ${puesto} en la fila digital` : 'En la fila digital')
                : turno.estado === 'llamado' ? 'Te están llamando' : 'Vas en camino'}
            </Text>
          </Ticket>
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
          {/* Sin cuadrito de color: en D2 el estado lo dice la palabra
              ("PRÓXIMA CITA", "SE PASÓ LA HORA"), no un icono de adorno. */}
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
      {sinServicio ? (
        <View style={s.sinServicio}>
          <Ionicons name="time-outline" size={20} color={COLORS.textMid} />
          <View style={{ flex: 1 }}>
            <Text style={s.sinServT}>Todavía no atienden por la app</Text>
            <Text style={s.sinServD}>
              {negocio?.nombre ?? 'Esta barbería'} aún no está recibiendo clientes por Turno, así que
              por ahora no puedes entrar a la fila ni reservar. Puedes seguir yendo
              como siempre — y en cuanto activen la app, aparecerá aquí.
            </Text>
          </View>
        </View>
      ) : (
      <>
      <Text style={s.sec}>¿QUÉ QUIERES HACER?</Text>

      {/* Las dos puertas son BOTONES, no renglones de una lista. Con forma de
          fila parecían ajustes: algo que se consulta. Son lo que se viene a
          hacer, y por eso pesan — macizo el de ahora, de contorno el de otro
          día, que es la jerarquía real entre los dos. */}
      <View style={s.puertas}>
        <TouchableOpacity style={[s.puerta, s.puertaYa]} onPress={() => router.push('/(app)/cliente/turno')}>
          <Text style={s.puertaYaT}>Fila ahora</Text>
          <Text style={s.puertaYaD} numberOfLines={2}>
            {!hayFilaAbierta
              ? (motivoFilaLocal ?? 'Ahora mismo no hay nadie abierto')
              : resumen.delante === 0 ? 'Nadie esperando · entras directo'
              : `${resumen.delante} esperando${resumen.espera_min > 0 ? ` · unos ${resumen.espera_min} min` : ''}`}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={[s.puerta, s.puertaDespues]} onPress={() => router.push('/(app)/cliente/agendar')}>
          <Text style={s.puertaDespuesT}>Agendar</Text>
          <Text style={s.puertaDespuesD} numberOfLines={2}>
            {hayCitas ? 'Eliges día y hora' : 'Aquí nadie toma citas ahora'}
          </Text>
        </TouchableOpacity>
      </View>
      </>
      )}

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
  tab: { paddingHorizontal: 4, paddingVertical: 9, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: COLORS.red },
  tabT: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.textLight, maxWidth: 160 },
  tabMas: { paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1.5, borderColor: COLORS.ink },
  rowLbl: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  // El ticket pone el fondo, el poste y la perforación; aquí solo el hueco.
  fila: { marginBottom: 14 },
  filaLbl: { fontFamily: FONTS.bold, fontSize: 11, color: COLORS.redSoft, letterSpacing: 1 },
  filaTitle: { fontFamily: FONTS.extrabold, fontSize: 19, color: '#fff', marginTop: 8 },
  filaSub: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.onCarbonMid, marginTop: 2 },
  filaLink: { fontFamily: FONTS.bold, fontSize: 14, color: '#fff' },
  // D2: no hay tarjeta. La fila se apoya en la página y la separa un filete.
  cita: { flexDirection: 'row', gap: 12, paddingVertical: 16, marginBottom: 0, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  citaTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  citaKick: { fontFamily: FONTS.bold, fontSize: 10.5, color: COLORS.textLight, letterSpacing: 2 },
  citaCd: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.red },
  citaServ: { fontFamily: FONTS.extrabold, fontSize: 18, color: COLORS.ink, marginTop: 5 },
  citaMeta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textMid, marginTop: 2 },
  citaEstado: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.textMid, marginTop: 8, lineHeight: 17 },
  // La que se pasó de hora se apaga, no se esconde: sigue legible.
  citaPasada: { opacity: 0.6 },
  citaAcc: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12 },
  citaBtn: { backgroundColor: COLORS.red, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 8 },
  citaBtnT: { fontFamily: FONTS.bold, color: '#fff', fontSize: 13 },
  citaReprog: { fontFamily: FONTS.semibold, color: COLORS.blue, fontSize: 13 },
  citaCancel: { fontFamily: FONTS.semibold, color: COLORS.textLight, fontSize: 13 },
  sec: { fontFamily: FONTS.bold, fontSize: 11, color: COLORS.textLight, letterSpacing: 2, textTransform: 'uppercase',
    borderBottomWidth: 2, borderBottomColor: COLORS.ink, paddingBottom: 8, marginBottom: 4 },
  // Las dos puertas. Misma forma las dos: ninguna es "la buena" — depende de
  // si tienes prisa o de si quieres una hora.
  // Aquí vivían los estilos del catálogo de barberos y servicios: se fueron
  // con él a "Mi turno", que es donde se elige.
  puertas: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 8 },
  puerta: { flex: 1, minHeight: 76, paddingVertical: 13, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 4 },
  puertaYa: { backgroundColor: COLORS.red },
  puertaYaT: { fontFamily: FONTS.display, fontSize: 19, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 },
  puertaYaD: { fontFamily: FONTS.medium, fontSize: 11.5, color: 'rgba(255,255,255,0.9)', marginTop: 3, lineHeight: 15 },
  puertaDespues: { borderWidth: 2, borderColor: COLORS.ink },
  puertaDespuesT: { fontFamily: FONTS.display, fontSize: 19, color: COLORS.ink, textTransform: 'uppercase', letterSpacing: 0.5 },
  puertaDespuesD: { fontFamily: FONTS.medium, fontSize: 11.5, color: COLORS.textMid, marginTop: 3, lineHeight: 15 },
  // Ocupa el sitio de "¿qué quieres hacer?" y se parece a una nota, no a una
  // tarjeta con acción: aquí no hay nada que tocar, y un borde pintado de rojo
  // haría parecer que la app está rota cuando la barbería solo está sin activar.
  sinServicio: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 2, borderColor: COLORS.border,
    padding: 16, marginBottom: 22 },
  sinServT: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  sinServD: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.textMid, marginTop: 4, lineHeight: 18 },
  pts: { paddingVertical: 16, marginTop: 6, marginBottom: 22, borderTopWidth: 2, borderTopColor: COLORS.ink },
  ptsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ptsLbl: { fontFamily: FONTS.bold, fontSize: 10.5, color: COLORS.textLight, letterSpacing: 2 },
  ptsNum: { fontFamily: FONTS.display, fontSize: 24, color: COLORS.ink },
  barBg: { height: 10, backgroundColor: COLORS.border, marginTop: 11, overflow: 'hidden' },
  barFill: { height: 10, backgroundColor: COLORS.red },
  ptsFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  ptsMeta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textMid },
  ptsFaltan: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.red },
  histHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  verTodo: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.blue, marginBottom: 12 },
  histItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  histServ: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  histMeta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  histPrecio: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.ink },
})
