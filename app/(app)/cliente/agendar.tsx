import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { useEffect, useState } from 'react'
import { useRouter, Stack, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getSesion } from '../../../lib/storage'
import { getPerfilesNegocio, slotsDisponibles, agendarCita, agendarGrupo, getNegocioById, getHorariosPerfil, cancelarCita, getMiUsuario, getMisCitas, getMiPreferido } from '../../../lib/db'
import { aceptaCitas } from '../../../lib/atencion'
import { avisos, programarRecordatoriosCitas } from '../../../lib/notificaciones'
import { COLORS, FONTS } from '../../../constants'
import { dinero, fechaDeISO, fechaISOLocal, fechaLarga, hora12 } from '../../../lib/format'
import { Display, Chip, Avatar } from '../../../components/ui'

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
function proximosDias(n: number) {
  const out: { fecha: string; dia: string; num: number; wd: number }[] = []
  for (let i = 0; i < n; i++) { const d = new Date(); d.setDate(d.getDate() + i); out.push({ fecha: fechaISOLocal(d), dia: DIAS[d.getDay()], num: d.getDate(), wd: d.getDay() }) }
  return out
}

export default function Agendar() {
  const router = useRouter()
  const params = useLocalSearchParams<{ perfil?: string; servicio?: string; reagendar?: string }>()
  const [perfiles, setPerfiles] = useState<any[]>([])
  const [negocio, setNegocio] = useState<any>(null)
  const [perfil, setPerfil] = useState<any>(null)
  const [servicio, setServicio] = useState<any>(null)
  const [fecha, setFecha] = useState('')
  const [slots, setSlots] = useState<string[]>([])
  const [hora, setHora] = useState('')
  const [personas, setPersonas] = useState(1)
  const [diasActivos, setDiasActivos] = useState<Set<number> | null>(null)
  const [loading, setLoading] = useState(true)
  const [cargandoSlots, setCargandoSlots] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const dias = proximosDias(14)

  useEffect(() => {
    (async () => {
      const ss = await getSesion()
      if (ss?.negocio_id) {
        const [ps, neg] = await Promise.all([
          // soloAlDia: el cliente no elige entre barberos que no puede usar
          // (migración 96). La 95 ya hace que reservarle una cita rebote.
          getPerfilesNegocio(ss.negocio_id, { soloAlDia: true }) as Promise<any[]>,
          getNegocioById(ss.negocio_id).catch(() => null),
        ])
        // Quien trabaja SOLO POR ORDEN DE LLEGADA no da citas: su agenda no
        // tiene huecos y turno_agendar_cita lo rechaza. Listarlo aquí sería
        // llevar al cliente a una pantalla vacía sin explicarle por qué.
        const conCitas = (ps as any[]).filter(aceptaCitas)
        setPerfiles(conCitas); setNegocio(neg)

        // TU BARBERO, YA ELEGIDO (migración 83). Quien tiene barbero de
        // confianza no debería tener que buscarlo en la tira cada vez que
        // reserva: si da citas, entra preseleccionado con su primer servicio.
        // Se salta cuando la pantalla viene con un barbero por parámetro, que
        // es reprogramar una cita concreta y ahí manda la cita.
        if (!params.perfil) {
          const pref = await getMiPreferido(ss.negocio_id).catch(() => null)
          const suyo = pref ? conCitas.find((x: any) => x.id === pref) : null
          if (suyo) {
            setPerfil(suyo)
            const sv = (suyo.turno_servicios ?? []).filter((x: any) => x.activo)[0]
            if (sv) setServicio(sv)
          }
        }

        // Preselección al reprogramar
        if (params.perfil) {
          const p = ps.find((x: any) => x.id === params.perfil)
          if (p) {
            setPerfil(p)
            const sv = (p.turno_servicios ?? []).find((x: any) => x.id === params.servicio)
            if (sv) setServicio(sv)
          }
        }
      }
      setLoading(false)
    })()
  }, [])

  // Días en que el barbero trabaja (para deshabilitar los cerrados)
  useEffect(() => {
    if (!perfil) { setDiasActivos(null); return }
    getHorariosPerfil(perfil.id).then((hs: any[]) => {
      setDiasActivos(new Set(hs.filter(h => h.activo).map(h => h.dia_semana)))
    }).catch(() => setDiasActivos(null))
  }, [perfil])

  useEffect(() => {
    if (!perfil || !servicio || !fecha) { setSlots([]); return }
    setCargandoSlots(true); setHora('')
    slotsDisponibles(perfil.id, fecha, servicio.id).then(x => setSlots(x.map(t => t.slice(0, 5)))).catch(() => setSlots([])).finally(() => setCargandoSlots(false))
  }, [perfil, servicio, fecha])

  async function confirmar() {
    if (!perfil || !servicio || !fecha || !hora) return
    setEnviando(true)
    try {
      if (params.reagendar) {
        await agendarCita(perfil.id, servicio.id, fecha, hora)
        await cancelarCita(params.reagendar).catch(() => {})   // reprogramar: cancela la vieja
      } else if (personas > 1) {
        await agendarGrupo(perfil.id, servicio.id, fecha, hora, personas)   // R5: N espacios seguidos
      } else {
        await agendarCita(perfil.id, servicio.id, fecha, hora)
      }
      // El barbero se enteraba de sus propias citas solo al abrir la agenda.
      const yo = await getMiUsuario().catch(() => null)
      if (perfil.usuario_id) {
        avisos.barberoNuevaCita(perfil.usuario_id, yo?.nombre ?? 'Un cliente',
          `${fechaLarga(fechaDeISO(fecha))} a las ${hora12(hora)}`)
      }
      // Los recordatorios (T-24h y T-2h) los agenda el propio teléfono, porque
      // este proyecto no tiene pg_net y la base no puede despertar a nadie. Se
      // reprograman aquí y no solo en Inicio: quien reservaba y se salía sin
      // volver a esa pantalla se quedaba sin recordatorio.
      const sesion = await getSesion()
      if (sesion?.usuario_id && sesion?.negocio_id) {
        const mias = await getMisCitas(sesion.usuario_id, sesion.negocio_id).catch(() => [])
        programarRecordatoriosCitas((mias as any[]).map(c => ({
          fecha: c.fecha, hora_inicio: c.hora_inicio, servicio: c.turno_servicios?.nombre,
        })))
      }
      const titulo = params.reagendar ? 'Cita reprogramada' : personas > 1 ? 'Grupo agendado' : 'Cita agendada'
      const detalle = personas > 1 ? `${personas} personas · ${servicio.nombre} el ${fecha} desde las ${hora12(hora)}.` : `${servicio.nombre} el ${fecha} a las ${hora12(hora)}.`
      Alert.alert(titulo, detalle, [{ text: 'Listo', onPress: () => router.replace('/(app)/cliente/home') }])
    } catch (e: any) { Alert.alert('No se pudo agendar', e.message ?? 'Intenta otro horario.') }
    finally { setEnviando(false) }
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>

  return (
    <View style={s.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}><Ionicons name="chevron-back" size={22} color={COLORS.ink} /></TouchableOpacity>
        <Display size={24}>Reservar</Display>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {/* resumen del servicio elegido (carbón) */}
        {servicio && (
          <View style={s.mini}>
            <View style={s.miniIcon}><Ionicons name="cut" size={20} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.miniName}>{servicio.nombre}</Text>
              <Text style={s.miniMeta}>con {perfil?.turno_usuarios?.nombre ?? '—'} · {servicio.duracion_min} min</Text>
            </View>
            <Text style={s.miniPrice}>{dinero(servicio.precio, negocio?.moneda)}</Text>
          </View>
        )}

        <Text style={s.sec}>1 · BARBERO</Text>
        {/* Un local entero en modo "solo fila" deja esta tira VACÍA, y una tira
            vacía no explica nada: parecía que la pantalla no había cargado.
            Inicio ya lo avisa antes de entrar; si aun así se llega aquí —por un
            enlace de reprogramar, por ejemplo— hay que decirlo. */}
        {perfiles.length === 0 && (
          <Text style={s.vacio}>
            Aquí nadie está tomando citas ahora mismo. En esta barbería se atiende por orden de llegada:
            entra a la fila digital desde “Mi turno”.
          </Text>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 8 }}>
          {perfiles.map((p: any) => {
            const on = perfil?.id === p.id
            return (
              <TouchableOpacity key={p.id} style={[s.bChip, on && s.bChipOn]} onPress={() => { setPerfil(p); setServicio(null); setFecha(''); setHora('') }}>
                <Avatar name={p.turno_usuarios?.nombre} uri={p.turno_usuarios?.foto_url} size={48} bg={on ? '#fff' : COLORS.blue} color={on ? COLORS.red : '#fff'} />
                <Text style={[s.bChipT, on && { color: '#fff' }]} numberOfLines={1}>{p.turno_usuarios?.nombre ?? 'Barbero'}</Text>
                {p.turno_usuarios?.especialidad ? <Text style={[s.bChipEsp, on && { color: 'rgba(255,255,255,0.85)' }]} numberOfLines={1}>{p.turno_usuarios.especialidad}</Text> : null}
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {perfil?.mensaje_bienvenida ? (
          <View style={s.bienvenida}><Text style={s.bienvenidaT}>“{perfil.mensaje_bienvenida}”</Text></View>
        ) : null}

        {perfil && (
          <>
            <Text style={s.sec}>2 · SERVICIO</Text>
            {(perfil.turno_servicios ?? []).filter((sv: any) => sv.activo).map((sv: any) => {
              const on = servicio?.id === sv.id
              return (
                <TouchableOpacity key={sv.id} style={[s.serv, on && s.servOn]} onPress={() => { setServicio(sv); setFecha(''); setHora('') }}>
                  <View><Text style={s.servName}>{sv.nombre}</Text><Text style={s.servMeta}>{sv.duracion_min} min</Text></View>
                  <Text style={s.servPrice}>{dinero(sv.precio, negocio?.moneda)}</Text>
                </TouchableOpacity>
              )
            })}
          </>
        )}

        {servicio && !params.reagendar && (
          <View style={s.personas}>
            <View style={{ flex: 1 }}>
              <Text style={s.personasL}>¿Para cuántas personas?</Text>
              <Text style={s.personasD}>Reserva espacios seguidos con el mismo barbero (tú + acompañantes).</Text>
            </View>
            <View style={s.stepRow2}>
              <TouchableOpacity style={s.stepBtn} onPress={() => { setPersonas(p => Math.max(1, p - 1)); setHora('') }}><Text style={s.stepT}>−</Text></TouchableOpacity>
              <Text style={s.stepVal}>{personas}</Text>
              <TouchableOpacity style={s.stepBtn} onPress={() => { setPersonas(p => Math.min(6, p + 1)); setHora('') }}><Text style={s.stepT}>+</Text></TouchableOpacity>
            </View>
          </View>
        )}

        {servicio && (
          <>
            <Text style={[s.sec, { marginTop: 22 }]}>3 · DÍA</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {dias.map(d => {
                const on = fecha === d.fecha
                const cerrado = diasActivos != null && !diasActivos.has(d.wd)
                return (
                  <TouchableOpacity key={d.fecha} style={[s.dia, on && s.diaOn, cerrado && s.diaOff]} disabled={cerrado} onPress={() => setFecha(d.fecha)}>
                    <Text style={[s.diaTxt, on && { color: 'rgba(255,255,255,0.85)' }, cerrado && { color: COLORS.textLight }]}>{d.dia}</Text>
                    <Text style={[s.diaNum, on && { color: '#fff' }, cerrado && { color: COLORS.textLight }]}>{d.num}</Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </>
        )}

        {fecha && (
          <>
            <Text style={[s.sec, { marginTop: 22 }]}>4 · HORA</Text>
            {cargandoSlots ? <ActivityIndicator color={COLORS.red} style={{ marginVertical: 16 }} /> :
              slots.length === 0 ? <Text style={s.empty}>No hay horarios disponibles ese día.</Text> :
                <View style={s.slots}>
                  {slots.map(t => (
                    <View key={t} style={{ width: '31%' }}>
                      <Chip tone="blue" selected={hora === t} onPress={() => setHora(t)}>{hora12(t)}</Chip>
                    </View>
                  ))}
                </View>}
          </>
        )}
      </ScrollView>

      {hora ? (
        <View style={s.ctaWrap}>
          <TouchableOpacity style={s.cta} onPress={confirmar} disabled={enviando}>
            {enviando ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaT}>{personas > 1 ? `Confirmar ${personas} espacios` : 'Confirmar cita'} · {hora12(hora)}</Text>}
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12 },
  back: { width: 36, height: 36, borderRadius: 11, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  mini: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.carbon, borderRadius: 16, padding: 14, marginBottom: 20 },
  miniIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center' },
  miniName: { fontFamily: FONTS.bold, fontSize: 14, color: '#fff' },
  miniMeta: { fontFamily: FONTS.medium, fontSize: 12, color: '#9A9CA6', marginTop: 2 },
  miniPrice: { fontFamily: FONTS.display, fontSize: 20, color: '#fff' },
  vacio: { fontFamily: FONTS.medium, fontSize: 13.5, color: COLORS.textMid, lineHeight: 19, marginBottom: 16 },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginBottom: 12 },
  bChip: { width: 104, paddingHorizontal: 10, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: 'center', gap: 6 },
  bChipOn: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  bChipT: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.ink, textAlign: 'center' },
  bChipEsp: { fontFamily: FONTS.medium, fontSize: 11, color: COLORS.textLight, textAlign: 'center' },
  bienvenida: { backgroundColor: COLORS.surfaceAlt, borderRadius: 12, padding: 14, marginBottom: 20 },
  bienvenidaT: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textMid, fontStyle: 'italic' },
  serv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, padding: 14, marginBottom: 8 },
  servOn: { borderColor: COLORS.red, backgroundColor: COLORS.redLight },
  servName: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  servMeta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  servPrice: { fontFamily: FONTS.display, fontSize: 22, color: COLORS.ink },
  personas: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, marginTop: 22 },
  personasL: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  personasD: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2, paddingRight: 10 },
  stepRow2: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  stepT: { fontFamily: FONTS.bold, fontSize: 22, color: COLORS.ink },
  stepVal: { fontFamily: FONTS.bold, fontSize: 17, color: COLORS.ink, minWidth: 22, textAlign: 'center' },
  dia: { width: 58, height: 66, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  diaOn: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  diaOff: { opacity: 0.4, backgroundColor: COLORS.surfaceAlt },
  diaTxt: { fontFamily: FONTS.semibold, fontSize: 12, color: COLORS.textLight },
  diaNum: { fontFamily: FONTS.extrabold, fontSize: 20, color: COLORS.ink, marginTop: 2 },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  empty: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textLight, paddingVertical: 16 },
  ctaWrap: { padding: 16, paddingBottom: 28, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.bg },
  cta: { backgroundColor: COLORS.red, borderRadius: 14, padding: 17, alignItems: 'center' },
  ctaT: { fontFamily: FONTS.bold, fontSize: 16, color: '#fff' },
})
