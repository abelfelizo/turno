/**
 * MI LOCAL · lo que pasa ahora en la barbería. Tablero: «D2 · Barbería · Cola».
 *
 * Solo hoy y solo lo que se mira de pie en el mostrador: cuántos esperan,
 * quién está libre, a quién le toca y lo que pide atención. Lo demás tiene su
 * pestaña: el dinero en Estadísticas, las personas en Equipo, la cartera en
 * Clientes, el código en Ajustes (aquí queda en pequeño, arriba, para
 * compartirlo). Antes esta pantalla lo tenía todo y la fila se repetía en la
 * pestaña Cola con la otra mitad de las acciones.
 *
 * Tres cosas no se deciden aquí, y se dice por qué en vez de esconderlas:
 *   · el orden de la fila, que lo lleva la regla (sin subir ni bajar);
 *   · el horario de cada silla (alargar inventa disponibilidad, migración 88);
 *   · lo que pasa en una silla ocupada, que lo cierra quien corta (76).
 */
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert, Share } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getSesion, guardarSesion } from '../../../lib/storage'
import {
  getNegocioById, getColaActiva, getSolicitudesPendientes, getEstadisticasNegocio, getPerfilesNegocio,
  getConfiguracion, asignarCola, getEstadoLocal, getLocalOperativo, marcarNoEsta,
} from '../../../lib/db'
import { suscribirCola, desuscribir } from '../../../lib/realtime'
import { relojesDeSilla, fechaLarga, hora12 } from '../../../lib/format'
import { useRecargaAlEnfocar } from '../../../lib/recarga'
import { COLORS, FONTS } from '../../../constants'
import { NoCargo } from '../../../components/ui'
import { Encabezado, Rotulo, Cifras } from '../../../components/d2'
import { Fila, Iniciales, Puesto, Estado, Flecha, Aviso, Tarjeta, Boton, Nota as NotaLista } from '../../../components/turno-ui'
import { Titulo, Sub, Seccion, Nota, Opcion, AhoraNo } from '../../../components/hoja-piezas'
import PanelBadge from '../../../components/panel-badge'
import Hoja from '../../../components/hoja'

// Colores de estado de la línea gráfica (handoff § 4): llamado y en la silla
// en rojo, en camino en azul, en fila en gris.
const ESTADO_TURNO: Record<string, { l: string; c: string }> = {
  en_fila: { l: 'En fila', c: COLORS.textLight },
  llamado: { l: 'Llamado', c: COLORS.red },
  en_camino: { l: 'En camino', c: COLORS.blue },
  atendiendo: { l: 'En la silla', c: COLORS.red },
}

/** Una línea que diga lo que está pasando en esa silla ahora mismo. */
function estadoTexto(e: any): string {
  if (!e) return 'No aparece'
  if (e.estado === 'descanso') return e.hasta ? `En pausa · vuelve ${hora12(e.hasta)}` : 'En descanso'
  if (e.estado === 'inactivo') return 'Inactivo'
  if (e.estado === 'atendiendo') return e.cliente ? `Atendiendo a ${e.cliente}` : 'Ocupada'
  return 'Libre'
}

/** Cuánto lleva esperando: el número con el que se decide a quién adelantar. */
function esperaDe(q: any): number | null {
  if (!q?.created_at) return null
  const m = Math.floor((Date.now() - new Date(q.created_at).getTime()) / 60000)
  return m > 0 ? m : null
}

export default function MiLocal() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [negocio, setNegocio] = useState<any>(null)
  const [cola, setCola] = useState<any[]>([])
  const [solicitudes, setSolicitudes] = useState(0)
  const [equipo, setEquipo] = useState<any[]>([])
  const [config, setConfig] = useState<any>(null)
  // Estado deducido de cada silla (turno_estado_local): si está ocupada, en
  // pausa o libre. `estado_actual` del perfil solo dice si acepta clientes.
  const [estados, setEstados] = useState<Record<string, any>>({})
  // «No pude preguntar» no es «nadie está al día»: sin esto un fallo de red
  // se leería como que ninguna silla ha pagado.
  const [estadosOk, setEstadosOk] = useState(false)
  const [perfilPropio, setPerfilPropio] = useState<string | null>(null)
  const [atendidosHoy, setAtendidosHoy] = useState(0)
  const [operativo, setOperativo] = useState(true)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [fallo, setFallo] = useState(false)
  const [sel, setSel] = useState<any>(null)
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setFallo(false)
      const ss = await getSesion()
      if (!ss?.negocio_id) return
      setPerfilPropio(ss.perfil_id ?? null)
      const [neg, q, sol, est, st, eq, cfg, op] = await Promise.all([
        getNegocioById(ss.negocio_id),
        // La fila SIN `.catch`: esta pantalla ES la fila del local. Una lista
        // vacía por un fallo de red se lee como «no hay nadie esperando» con la
        // barbería llena.
        getColaActiva(ss.negocio_id),
        getSolicitudesPendientes(ss.negocio_id).catch(() => []),
        getEstadoLocal(ss.negocio_id).catch(() => null),
        getEstadisticasNegocio(ss.negocio_id).catch(() => null),
        getPerfilesNegocio(ss.negocio_id).catch(() => []),
        getConfiguracion(ss.negocio_id).catch(() => null),
        // Si falla se asume operativo: apagar el panel por un error de red
        // sería contarle al dueño que no ha pagado cuando sí ha pagado.
        getLocalOperativo(ss.negocio_id).catch(() => true),
      ])
      const mapa: Record<string, any> = {}
      for (const e of ((est ?? []) as any[])) mapa[e.perfil_id] = e
      setEstados(mapa); setEstadosOk(est != null); setOperativo(op as boolean)
      setNegocio(neg); setCola(q as any[]); setSolicitudes((sol as any[]).length)
      setAtendidosHoy((st as any)?.atendidosHoy ?? 0); setEquipo(eq as any[]); setConfig(cfg)
    } catch {
      setFallo(true)
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [])
  const correr = useRecargaAlEnfocar(cargar)

  // En vivo: cualquier cambio en la fila del local recarga. Va atado al id del
  // local ya cargado, así que la limpieza siempre tiene la suscripción que
  // cerrar (antes se creaba después de desmontar y quedaban vivas de otro local).
  const negocioId: string | null = negocio?.id ?? null
  useEffect(() => {
    if (!negocioId) return
    const sub = suscribirCola(negocioId, () => { void correr() })
    return () => { desuscribir(sub) }
  }, [negocioId, correr])

  // Cambiar de panel es cambiar la sesión, no solo navegar: si solo navegas,
  // el distintivo sigue diciendo BARBERÍA sobre la pantalla de la silla.
  async function irAMiSilla() {
    const ss = await getSesion(); if (!ss) return
    await guardarSesion({ ...ss, panel: 'silla' })
    router.replace('/(app)/barbero/silla')
  }
  function abrirSilla(p: any) {
    if (p.id === perfilPropio) { void irAMiSilla(); return }
    router.push({
      pathname: '/(app)/dueno/barbero',
      params: { perfil: p.id, nombre: p.turno_usuarios?.nombre ?? 'Barbero', rol: p.rol ?? '' },
    } as any)
  }

  async function op(fn: () => Promise<any>, err: string) {
    setOcupado(true)
    try { await fn(); setSel(null); void correr() }
    catch (e: any) { Alert.alert(err, e.message ?? 'Intenta de nuevo.') }
    finally { setOcupado(false) }
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>
  if (fallo) return <View style={s.center}><NoCargo que="tu local" onReintentar={() => { setLoading(true); void correr() }} /></View>

  const conEmpleados = negocio?.tipo !== 'espacios_rentados'
  const enFila = cola.filter(c => c.estado === 'en_fila')
  const masEspera = enFila.map(esperaDe).filter((m): m is number => m != null).sort((a, b) => b - a)[0] ?? null

  const sillas = equipo.map((p: any) => {
    const e = estados[p.id]
    const r = e?.estado === 'atendiendo' ? relojesDeSilla(e.desde, e.fin_estimado) : null
    const alDia = !estadosOk || !!e
    const cerrada = e?.fila_abierta === false
    // Lo que se lee a la derecha de la fila: una palabra y su color.
    const estado = p.suspendido ? { texto: 'Suspendido', color: COLORS.textLight }
      : !alDia ? { texto: 'No al día', color: COLORS.redText }
      : e?.estado === 'atendiendo' ? { texto: 'En la silla', color: COLORS.red }
      : e?.estado === 'descanso' ? { texto: 'Descanso', color: COLORS.textLight }
      : e?.estado === 'inactivo' || !e ? { texto: 'Inactivo', color: COLORS.textLight }
      : cerrada ? { texto: 'Fila cerrada', color: COLORS.textLight }
      : { texto: 'Disponible', color: COLORS.success }
    return {
      p, e, alDia, cerrada, estado,
      tu: p.id === perfilPropio,
      nombre: p.turno_usuarios?.nombre ?? 'Profesional',
      motivo: e?.fila_motivo ?? null,
      libreA: r?.fin ? (r.tarde ? `pasado ${Math.abs(r.faltan ?? 0)} min` : `libre ~${r.fin}`) : null,
      esperan: e?.en_cola ?? 0,
    }
  })
  const abiertas = sillas.filter(x => x.alDia && !x.p.suspendido && !x.cerrada && (x.e?.estado === 'libre' || x.e?.estado === 'atendiendo')).length
  const cerradas = sillas.filter(x => x.cerrada)
  const sinPagar = sillas.filter(x => !x.alDia)
  // EL LOCAL SIN NINGUNA SILLA AL DÍA (95 y 96): no se decide nada aquí, solo
  // se cuenta lo que ya pasa. Un panel apagado sin explicación se lee como un
  // martes tranquilo.
  const apagado = estadosOk && !operativo && equipo.length > 0

  // A quién se le puede asignar: sillas que trabajan hoy y hacen ese servicio.
  const candidatos = (item: any) => sillas.filter(x =>
    x.alDia && !x.p.suspendido && (!item?.tipo_servicio || x.p.tipo_servicio === item.tipo_servicio))

  const codigo = negocio?.codigo_acceso ?? null

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void correr() }} />}>
        <PanelBadge />
        <Encabezado
          titulo={negocio?.nombre ?? 'Mi local'}
          sub={fechaLarga()}
          derecha={codigo ? (
            <TouchableOpacity style={s.codigo} accessibilityRole="button" accessibilityLabel="Compartir el código del local"
              onPress={() => Share.share({ message: `Únete a ${negocio?.nombre} en Turno con el código ${codigo}` })}>
              <Text style={s.codigoL}>Código</Text>
              <Text style={s.codigoV}>{codigo}</Text>
            </TouchableOpacity>
          ) : null} />

        {/* LO QUE PIDE ATENCIÓN va antes que las cifras: es lo único de la
            pantalla que espera una respuesta del dueño. */}
        {solicitudes > 0 && (
          <View style={{ marginTop: 20 }}>
            <Aviso texto={solicitudes === 1 ? 'Un barbero quiere entrar' : `${solicitudes} barberos quieren entrar`}
              accion="Ver" onPress={() => router.push('/(app)/dueno/equipo')} />
          </View>
        )}

        {apagado ? (
          <Tarjeta style={{ marginTop: 20 }}>
            <Text style={s.overline}>LA FILA ESTÁ APAGADA</Text>
            <Text style={s.apagadoD}>
              {conEmpleados
                ? 'Ninguna silla de tu local está al día, así que por la app no entra nadie. Lo reservado sigue en pie y quien llegue al local se atiende igual.'
                : 'Ningún barbero de tu local tiene su silla al día, así que ninguno aparece en la app. Aquí cada uno paga la suya.'}
            </Text>
            <Boton tipo="secondary" texto={conEmpleados ? 'Ver la suscripción' : 'Ver la cuenta del local'}
              onPress={() => router.push('/(app)/dueno/config')} style={{ marginTop: 14 }} />
          </Tarjeta>
        ) : (
          <View style={{ marginTop: 20 }}>
            <Cifras items={[
              { n: enFila.length, l: 'En fila', color: enFila.length ? COLORS.red : undefined },
              { n: atendidosHoy, l: 'Atendidos' },
              { n: `${abiertas}/${sillas.length}`, l: 'Sillas' },
              { n: masEspera ? `${masEspera}′` : '—', l: 'Espera' },
            ]} />
          </View>
        )}

        {/* LAS SILLAS. La del dueño va marcada «Tú» y lleva a su panel: es la
            única puerta a su silla. */}
        <Rotulo>{conEmpleados ? 'Las sillas' : 'Quienes rentan'}{sillas.length ? ` · ${sillas.length}` : ''}</Rotulo>
        {sillas.length === 0 && (
          <NotaLista>Todavía no trabaja nadie aquí. Invita a alguien desde Equipo.</NotaLista>
        )}
        {sillas.map((x, i) => (
          <Fila key={x.p.id}
            titulo={x.nombre}
            tituloExtra={x.tu ? <Text style={s.tu}>  · Tú</Text> : null}
            meta={x.p.suspendido ? 'No le entra trabajo hasta que lo reactives'
              : !x.alDia ? 'No aparece en la app'
              : [x.e?.estado === 'atendiendo' ? estadoTexto(x.e) : null,
                 x.e?.estado === 'descanso' ? estadoTexto(x.e) : null,
                 x.libreA,
                 x.esperan ? `${x.esperan} ${x.esperan === 1 ? 'espera' : 'esperan'}` : 'Nadie esperando'].filter(Boolean).join(' · ')}
            inicio={<Iniciales nombre={x.nombre} oscuro={x.tu} />}
            fin={<View style={s.finFila}><Estado texto={x.estado.texto} color={x.estado.color} /><Flecha /></View>}
            onPress={() => abrirSilla(x.p)}
            ultima={i === sillas.length - 1} />
        ))}
        {cerradas.length > 0 && !apagado && (
          <NotaLista>
            {cerradas.length === sillas.length
              ? `Nadie puede entrar a la fila por la app ahora${cerradas[0].motivo && cerradas.every(c => c.motivo === cerradas[0].motivo) ? `: ${cerradas[0].motivo}` : ''}.`
              : `${cerradas.length} de ${sillas.length} sillas tienen la fila cerrada.`}
            {' '}Quien llegue al local se atiende igual.
          </NotaLista>
        )}
        {sinPagar.length > 0 && !apagado && (
          <NotaLista>
            {sinPagar.length === 1 ? 'Una silla no está al día' : `${sinPagar.length} sillas no están al día`}: no
            {sinPagar.length === 1 ? ' aparece' : ' aparecen'} en la app.
            {conEmpleados ? ' La suscripción cubre las más antiguas primero.' : ' Aquí cada barbero paga la suya.'}
          </NotaLista>
        )}

        {/* QUIÉN ESTÁ ESPERANDO, en el orden en que se atiende. Todo lo que el
            dueño puede hacer con alguien vive en su hoja: asignarlo (si el
            local reparte) o marcar que no se presentó (si ya le tocó). */}
        {!apagado && (
          <>
            <Rotulo>Fila del local{cola.length ? ` · ${cola.length}` : ''}</Rotulo>
            {cola.length === 0 && (
              <NotaLista>Nadie en la fila ahora mismo.</NotaLista>
            )}
            {cola.map((c: any, i: number) => {
              const e = ESTADO_TURNO[c.estado] ?? ESTADO_TURNO.en_fila
              const sinAsignar = c.estado === 'en_fila' && !c.perfil_id
              const min = esperaDe(c)
              return (
                <Fila key={c.id}
                  titulo={c.turno_usuarios?.nombre ?? 'Cliente'}
                  tituloExtra={c.prioridad === 1 ? <Text style={s.cita}>  · Cita</Text> : null}
                  meta={[c.turno_servicios?.nombre ?? 'Servicio',
                    c.turno_perfiles?.turno_usuarios?.nombre ?? null,
                    c.espera_a_id ? 'espera su otro servicio' : null,
                    min && c.estado === 'en_fila' ? `lleva ${min} min` : null].filter(Boolean).join(' · ')}
                  inicio={<Puesto n={i + 1} />}
                  fin={sinAsignar && config?.asignacion_por_dueno
                    ? <Estado texto="Asignar" color={COLORS.blue} />
                    : <Estado texto={sinAsignar ? 'Sin asignar' : e.l} color={sinAsignar ? COLORS.redText : e.c} />}
                  onPress={() => setSel(c)}
                  ultima={i === cola.length - 1} />
              )
            })}
          </>
        )}
      </ScrollView>

      {/* LA HOJA DE UN TURNO. Lo que se puede hacer depende de en qué punto
          está, y lo que NO se puede se dice con su motivo. */}
      <Hoja visible={!!sel} onClose={() => setSel(null)}>
        <Titulo>{sel?.turno_usuarios?.nombre ?? 'Turno'}</Titulo>
        <Sub>
          {[sel?.turno_servicios?.nombre, (ESTADO_TURNO[sel?.estado] ?? ESTADO_TURNO.en_fila).l,
            sel?.turno_perfiles?.turno_usuarios?.nombre ? `con ${sel.turno_perfiles.turno_usuarios.nombre}` : 'sin asignar'].filter(Boolean).join(' · ')}
        </Sub>

        {sel?.estado === 'en_fila' && config?.asignacion_por_dueno && (
          <>
            <Seccion>{sel?.perfil_id ? 'Pasárselo a otra silla' : 'Asignar a'}</Seccion>
            {candidatos(sel).filter(x => x.p.id !== sel?.perfil_id).map(x => (
              <Opcion key={x.p.id} t={x.nombre + (x.tu ? ' (tú)' : '')} d={estadoTexto(x.e) + (x.esperan ? ` · ${x.esperan} en su fila` : '')}
                disabled={ocupado} onPress={() => op(() => asignarCola(sel.id, x.p.id), 'No se pudo asignar')} />
            ))}
            {candidatos(sel).length === 0 && <Nota tono="gris">No hay ninguna silla trabajando que haga este servicio.</Nota>}
          </>
        )}
        {sel?.estado === 'en_fila' && !config?.asignacion_por_dueno && (
          <Nota tono="gris">Está esperando su turno. El orden lo lleva la fila: cuando le toque, el barbero lo llama.</Nota>
        )}
        {(sel?.estado === 'llamado' || sel?.estado === 'en_camino') && (
          <>
            <Nota tono="gris">Ya le tocó. Si no aparece, márcalo: el turno pasa al siguiente y queda constancia.</Nota>
            <Opcion t="No se presentó" d="Se le llamó y no apareció" rojo disabled={ocupado}
              onPress={() => op(() => marcarNoEsta(sel.id), 'No se pudo marcar')} />
          </>
        )}
        {sel?.estado === 'atendiendo' && (
          <Nota tono="gris">
            Lo está atendiendo {sel?.turno_perfiles?.turno_usuarios?.nombre ?? 'un barbero'}. Lo que pase en esa silla lo cierra quien está cortando.
          </Nota>
        )}
        <AhoraNo texto="Cerrar" onPress={() => setSel(null)} />
      </Hoja>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  codigo: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'flex-end' },
  codigoL: { fontFamily: FONTS.medium, fontSize: 11, color: COLORS.textLight },
  codigoV: { fontFamily: FONTS.mono, fontSize: 15, color: COLORS.ink },
  overline: { fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 1.2, color: COLORS.redText },
  apagadoD: { fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20, color: COLORS.textMid, marginTop: 6 },
  finFila: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tu: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.red },
  cita: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.blue },
})
