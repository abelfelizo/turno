/**
 * LAS HOJAS DE MI SILLA — lo que sube desde abajo al tocar algo de la silla.
 *
 * En la agenda de antes, la mitad de esto eran alertas del sistema: «¿Pedro no
 * está?» con cuatro botones, de los que Android pinta tres y tira el resto en
 * silencio. Aquí cada decisión es una hoja, y LA HOJA ES LA CONFIRMACIÓN: se
 * ve qué va a pasar —quién sube, a quién se avisa, qué cuenta como visita—
 * antes de tocar. Tableros: lienzo de diseño, «D2B · Hoja …».
 *
 * No decide nada que no esté ya decidido en otro sitio. Qué puede hacer el
 * barbero lo dice lib/silla.ts (walkIn, cabeAntesDeLaCita) y lo guarda el
 * servidor; qué pasa al tocar lo hace components/mi-silla.tsx, que es quien
 * sabe recargar y avisar. Esto enseña y pregunta.
 *
 * Las reglas que hereda de la agenda, con su porqué, siguen aquí:
 *   · sacar de la fila a quien ESPERA es repartirla: sin «capta por su
 *     cuenta» no se ofrece (migración 109);
 *   · en el hueco de un ausente solo entra alguien de la fila física: un
 *     turno pedido desde el teléfono no prueba que su dueño esté aquí (109);
 *   · con alguien sentado, «sacar» es «se fue sin terminar», y se dice que no
 *     cuenta como visita: es la diferencia entre cobrar y no cobrar.
 */
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Linking } from 'react-native'
import { useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import Hoja from './hoja'
import { Titulo, Sub, Seccion, Nota, Dato, Opcion, Pie, BotonRojo, BotonContorno, AhoraNo } from './hoja-piezas'
import { ordinal } from './tarjeta-turno'
import { COLORS, FONTS } from '../constants'
import { dinero, fechaDeISO } from '../lib/format'
import {
  getCanjeActivoCliente, getFidelidad, getTarjetaCliente, getPreferenciasCliente, getNotaBarbero, getHistorialCliente,
} from '../lib/db'
import {
  walkIn, cabeAntesDeLaCita, partirCola, enElLocal, nombreDe, primerNombre, hora12, sumarMinutos, CITA_ABIERTA,
  type DatosSilla,
} from '../lib/silla'

export type HojaSilla =
  | { tipo: 'sinCita' }
  | { tipo: 'noEsta'; item: any }
  | { tipo: 'cobrar'; item: any }
  | { tipo: 'persona'; item: any }
  | { tipo: 'sacar'; item: any }
  | { tipo: 'servicios'; item: any; volver: HojaSilla | null }
  | { tipo: 'cita'; item: any }
  | { tipo: 'salgo'; min: number | null }
  | { tipo: 'local' }
  | { tipo: 'ficha'; clienteId: string; nombre: string; telefono?: string; volver: HojaSilla | null }

export type AccionesSilla = {
  cobrar: (item: any, valeId: string | null) => void
  salir: (min: number | null) => void
  sentarSinCita: (sv: any, nombre: string) => void
  cambiarLocal: (l: any) => void
  citaAtendida: (c: any) => void
  citaNoLlego: (c: any) => void
  citaCancelar: (c: any) => void
  recordar: (c: any) => void
  sustituir: (item: any, w: any) => void
  quitarAusente: (item: any) => void
  cambiarServicio: (item: any, sv: any) => void
  devolver: (item: any) => void
  sacar: (item: any) => void
  escribir: (item: any) => void
  avisar: (item: any) => void
  verFicha: (item: any) => void
}

type Props = {
  hoja: HojaSilla | null
  setHoja: (h: HojaSilla | null) => void
  ocupado: boolean
  datos: DatosSilla
  servicios: any[]
  moneda?: string
  sesion: any
  locales: any[]
  negocioId?: string
  captaSolo: boolean
  enFila: any[]
  acciones: AccionesSilla
}

const FRASE_CITA: Record<string, string> = {
  creada: 'Reservada. Falta que el cliente confirme que viene.',
  confirmada: 'Confirmada. El cliente dijo que viene.',
  no_confirmada: 'Se pasó la hora de confirmar y no dijo nada. Puede aparecer igual: decides tú.',
  en_camino: 'Va en camino.',
  atendida: 'Atendida. Ya cuenta como visita.',
  no_llego: 'No llegó. Pasó a tu fila con prioridad por si aparece.',
  cancelada: 'Cancelada.',
}

/** Un teléfono de verdad. Al que entra sin cita se le guarda «-». */
const telDe = (x: any): string | null => {
  const t = x?.turno_usuarios?.telefono ?? x?.telefono
  return t && /\d{7,}/.test(String(t).replace(/\D/g, '')) ? t : null
}
const esperaMin = (q: any, ahoraMs: number) =>
  q?.created_at ? Math.max(0, Math.floor((ahoraMs - new Date(q.created_at).getTime()) / 60000)) : null
const fechaCorta = (iso: string) =>
  fechaDeISO(iso).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' }).replace('.', '')

export default function HojasSilla(p: Props) {
  const { hoja, setHoja } = p
  const cerrar = () => setHoja(null)
  // Cada hoja se monta de nuevo al cambiar de persona o de tipo: su estado
  // (el vale marcado, el servicio elegido, el nombre escrito) no se hereda.
  const clave = hoja ? `${hoja.tipo}:${(hoja as any).item?.id ?? (hoja as any).clienteId ?? ''}` : 'nada'
  return (
    <Hoja visible={!!hoja} onClose={cerrar}>
      {hoja?.tipo === 'cobrar' && <Cobrar key={clave} {...p} item={hoja.item} />}
      {hoja?.tipo === 'noEsta' && <NoEsta key={clave} {...p} item={hoja.item} />}
      {hoja?.tipo === 'sinCita' && <SinCita key={clave} {...p} />}
      {hoja?.tipo === 'persona' && <Persona key={clave} {...p} item={hoja.item} />}
      {hoja?.tipo === 'sacar' && <Sacar key={clave} {...p} item={hoja.item} />}
      {hoja?.tipo === 'servicios' && <Servicios key={clave} {...p} item={hoja.item} volver={hoja.volver} />}
      {hoja?.tipo === 'cita' && <Cita key={clave} {...p} item={hoja.item} />}
      {hoja?.tipo === 'salgo' && <Salgo key={clave} {...p} min={hoja.min} />}
      {hoja?.tipo === 'local' && <Local key={clave} {...p} />}
      {hoja?.tipo === 'ficha' && <Ficha key={clave} {...p} f={hoja} />}
    </Hoja>
  )
}

/* ─────────────────────────── COBRAR · terminar ─────────────────────────── */

function Cobrar({ item, servicios, moneda, sesion, ocupado, acciones, setHoja }: Props & { item: any }) {
  const sv = servicios.find(x => x.id === item.servicio_id)
  const [vale, setVale] = useState<any>(null)
  const [fid, setFid] = useState<{ meta: number; premio: string; disp: number } | null>(null)
  const [usarVale, setUsarVale] = useState(false)
  const [cargando, setCargando] = useState(true)
  const enSilla = item.atendiendo_at ? Math.max(1, Math.round((Date.now() - new Date(item.atendiendo_at).getTime()) / 60000)) : null

  useEffect(() => {
    if (!item.cliente_id || !sesion?.negocio_id) { setCargando(false); return }
    let vivo = true
    Promise.all([
      getCanjeActivoCliente(item.cliente_id, sesion.negocio_id).catch(() => null),
      getFidelidad(sesion.negocio_id, sesion.perfil_id).catch(() => null),
    ]).then(async ([v, f]) => {
      if (!vivo) return
      setVale(v)
      if (f?.activo) {
        const t: any = await getTarjetaCliente(item.cliente_id, sesion.negocio_id, f.perfil ?? null).catch(() => null)
        if (vivo) setFid({ meta: f.meta, premio: f.premio, disp: (t?.visitas_totales ?? 0) - (t?.visitas_canjeadas ?? 0) })
      }
    }).finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [item.cliente_id, sesion?.negocio_id, sesion?.perfil_id])

  const precio = sv?.precio != null ? dinero(sv.precio, moneda) : null
  return (
    <>
      <Titulo>{nombreDe(item)}</Titulo>
      <Sub>{[item.turno_servicios?.nombre ?? sv?.nombre, enSilla ? `${enSilla} min en la silla` : null].filter(Boolean).join(' · ')}</Sub>

      <Dato l="Servicio" v={`${item.turno_servicios?.nombre ?? sv?.nombre ?? 'Servicio'} ›`}
        onPress={() => setHoja({ tipo: 'servicios', item, volver: { tipo: 'cobrar', item } })} />
      {precio && <Dato l="Precio" v={precio} />}
      {cargando ? <ActivityIndicator color={COLORS.ink} style={{ marginVertical: 14 }} /> : (
        <>
          {/* El vale se ve AQUÍ, en el momento de cobrar: un premio que el
              cliente tiene que recordar pedir es un premio que se pierde. */}
          {vale && (
            <Dato l="Tiene un premio" color={COLORS.blue}
              v={`${fid?.premio ?? 'Su premio'} · ${usarVale ? 'aplicado ✓' : 'aplicar'}`}
              onPress={() => setUsarVale(x => !x)} />
          )}
          {fid && item.cliente_id && (
            <Dato l="Su tarjeta contigo" v={`${fid.disp} → ${fid.disp + 1} de ${fid.meta}`} />
          )}
        </>
      )}

      <Nota tono="gris">
        Cuenta como visita y suma a su tarjeta. Si no lo atendiste, sácalo de la fila en vez de cobrar: así no entra en
        las cuentas del día.
      </Nota>

      <Pie>
        <BotonRojo texto={usarVale ? 'Cobrar con el premio' : precio ? `Cobrar ${precio}` : 'Cobrar'} ocupado={ocupado}
          onPress={() => acciones.cobrar(item, usarVale && vale ? vale.id : null)} />
        <AhoraNo onPress={() => setHoja(null)} />
      </Pie>
    </>
  )
}

/* ─────────────────────────── ¿NO ESTÁ? ─────────────────────────── */

function NoEsta({ item, enFila, captaSolo, datos, ocupado, acciones, setHoja }: Props & { item: any }) {
  // Solo la fila FÍSICA: es la que el servidor acepta como sustituta (109).
  const presentes = captaSolo ? enFila.filter(q => q.tipo_cola === 'fisica' && q.id !== item.id).slice(0, 3) : []
  return (
    <>
      <Titulo>¿{primerNombre(item)} no está?</Titulo>
      <Sub>
        {presentes.length
          ? 'Pierde su turno. En su hueco puedes meter a alguien que ya esté aquí: quien viene detrás conserva su puesto y su hora.'
          : 'Pierde su turno y pasa el siguiente de la fila. Si aparece después, tendrá que volver a pedir turno.'}
      </Sub>
      {presentes.map(w => {
        const e = esperaMin(w, datos.ahoraMs)
        return (
          <Opcion key={w.id} t={`Que pase ${primerNombre(w)}`} d={`Está en el local${e != null ? ` · espera ${e}′` : ''}`}
            flecha disabled={ocupado} onPress={() => acciones.sustituir(item, w)} />
        )
      })}
      <Opcion t={presentes.length ? 'Nadie, solo quitarlo' : 'Pierde el turno'} rojo disabled={ocupado}
        d="Pasa el siguiente de la fila. Si aparece, tendrá que volver a pedir turno."
        onPress={() => acciones.quitarAusente(item)} />
      <Pie>
        <BotonContorno texto="Sigo esperándolo" onPress={() => setHoja(null)} />
      </Pie>
    </>
  )
}

/* ─────────────────────────── ATENDER SIN CITA ─────────────────────────── */

function SinCita({ datos, servicios, moneda, enFila, ocupado, acciones, setHoja }: Props) {
  const regla = walkIn(datos)
  const [elegido, setElegido] = useState<any>(null)
  const [nombre, setNombre] = useState('')
  // Con la regla de la 118, los de la app que aún no han llegado no frenan al
  // que está de pie delante: se les corre la espera, y se les dice.
  const noLlegan = enFila.filter(q => !enElLocal(q))

  return (
    <>
      <Titulo>Atender sin cita</Titulo>
      <Sub>No entra a la fila: lo atiendes ahora, o no.</Sub>

      {!regla.puede ? (
        <>
          <Nota tono="ambar">{regla.porQue}</Nota>
          <Pie><AhoraNo texto="Entendido" onPress={() => setHoja(null)} /></Pie>
        </>
      ) : (
        <>
          {noLlegan.length > 0 && (
            <Nota tono="azul">
              <Text style={s.b}>{noLlegan.length === 1 ? `${primerNombre(noLlegan[0])}, que espera,` : `Los ${noLlegan.length} que esperan`}</Text>
              {noLlegan.length === 1 ? ' está en la app y todavía no ha llegado.' : ' están en la app y todavía no han llegado.'}
            </Nota>
          )}

          <Seccion>Qué se hace</Seccion>
          {servicios.length === 0 && <Text style={s.vacio}>Primero crea un servicio en Ajustes.</Text>}
          {servicios.map(sv => {
            // «Si tiene el tiempo»: un servicio que pisa la próxima cita no se
            // ofrece, y se dice por qué en vez de apagarlo sin más.
            const { cabe, cita } = cabeAntesDeLaCita(datos, sv.duracion_min ?? 30)
            const sel = elegido?.id === sv.id
            return (
              <TouchableOpacity key={sv.id} disabled={!cabe} onPress={() => setElegido(sv)} activeOpacity={0.8}
                style={[s.serv, sel && s.servSel]} accessibilityRole="radio" accessibilityState={{ selected: sel, disabled: !cabe }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.servN, !cabe && { color: COLORS.textLight }]}>{sv.nombre}</Text>
                  {cabe
                    ? <Text style={s.servD}>{sv.duracion_min} min{cita ? ` · cabe antes de tu cita de las ${hora12(cita.hora_inicio)}` : ''}</Text>
                    : <Text style={[s.servD, { color: COLORS.redDark, fontFamily: FONTS.semibold }]}>No te da tiempo: tu cita de las {hora12(cita?.hora_inicio)} llega antes</Text>}
                </View>
                {sv.precio != null && <Text style={[s.servP, !cabe && { color: COLORS.textLight }]}>{dinero(sv.precio, moneda)}</Text>}
              </TouchableOpacity>
            )
          })}

          <Seccion>Su nombre · si quiere</Seccion>
          <TextInput style={s.input} value={nombre} onChangeText={setNombre} placeholder="Para su ficha y su tarjeta"
            placeholderTextColor={COLORS.textLight} autoCapitalize="words" returnKeyType="done" maxLength={60} />

          {noLlegan.length > 0 && elegido && (
            <Nota tono="ambar">
              A los de la app se les corre la espera <Text style={s.b}>unos {elegido.duracion_min} min</Text>, y se les avisa.
            </Nota>
          )}

          <Pie>
            {elegido && (
              <View style={s.resumen}>
                <Text style={s.resumenT}>{elegido.nombre} · {elegido.duracion_min} min</Text>
                {elegido.precio != null && <Text style={s.resumenP}>{dinero(elegido.precio, moneda)}</Text>}
              </View>
            )}
            <BotonRojo texto="Sentarlo ahora" ocupado={ocupado} disabled={!elegido}
              onPress={() => elegido && acciones.sentarSinCita(elegido, nombre)} />
            <AhoraNo onPress={() => setHoja(null)} />
          </Pie>
        </>
      )}
    </>
  )
}

/* ─────────────────────────── EL MENÚ DE UNA PERSONA ─────────────────────────── */

function Persona({ item, enFila, captaSolo, datos, ocupado, acciones, setHoja }: Props & { item: any }) {
  const esperando = item.estado === 'en_fila'
  const sentado = item.estado === 'atendiendo'
  const dobleServicio = !!item.espera_a_id
  const pos = enFila.findIndex(q => q.id === item.id)
  const e = esperaMin(item, datos.ahoraMs)
  const sub = [
    sentado ? 'en la silla' : esperando ? (dobleServicio ? 'viene de su otro servicio' : pos >= 0 ? `${ordinal(pos + 1)} en la fila` : 'en la fila')
      : item.estado === 'en_camino' ? (item.llego_at ? 'ya llegó' : 'viene en camino') : 'llamado',
    item.turno_servicios?.nombre,
    item.tipo_cola === 'fisica' ? null : 'por la app',
    esperando && e != null ? `espera ${e}′` : null,
  ].filter(Boolean).join(' · ')
  const tel = telDe(item)

  return (
    <>
      <Titulo>{nombreDe(item)}</Titulo>
      <Sub>{sub}</Sub>

      {/* El orden de la fila es una REGLA: no hay «adelantar». Se explica
          por qué va donde va, que es lo que el barbero sí puede contarle. */}
      {esperando && (
        <Nota tono="gris">
          {dobleServicio ? 'Está en la otra silla. Entra aquí en cuanto acabe allí: no hace falta llamarlo.'
            : item.prioridad === 1 ? 'Tenía cita, por eso va primero.'
            : item.prioridad === 3 ? 'Llegó sin cita: entra cuando no quede nadie esperando.'
            : 'Entró a la fila desde la app.'}
        </Nota>
      )}

      {item.cliente_id && <Opcion t="Ver su ficha" d="Cómo le gusta, alergias, tu nota" flecha onPress={() => acciones.verFicha(item)} />}
      <Opcion t="Cambiar el servicio" d={sentado ? 'Pidió algo más o algo distinto' : 'Si al llegar pide otra cosa'}
        flecha onPress={() => setHoja({ tipo: 'servicios', item, volver: { tipo: 'persona', item } })} />
      {tel && !esperando && !sentado && (
        <Opcion t="Avisarle por WhatsApp" d="«Eres el próximo, acércate»" onPress={() => acciones.avisar(item)} />
      )}
      {tel && <Opcion t="Escribirle por WhatsApp" d="Abre el chat" onPress={() => acciones.escribir(item)} />}

      {!esperando && !sentado && (
        <Opcion t="Devolver a la fila" d="Deshace el llamado y conserva su puesto" disabled={ocupado} onPress={() => acciones.devolver(item)} />
      )}
      {sentado && (
        <Opcion t="Levantarlo de la silla" d="Te equivocaste de persona: vuelve a la fila con su puesto" disabled={ocupado}
          onPress={() => acciones.devolver(item)} />
      )}

      {!sentado && !(esperando && !captaSolo) && (
        <Opcion t="Sacarlo de la fila" d="Se le avisa. No cuenta como visita." rojo onPress={() => setHoja({ tipo: 'sacar', item })} />
      )}
      {esperando && !captaSolo && (
        <Nota tono="gris">Quién entra y quién sale de la fila lo decide la barbería. Si se fue, díselo a quien la maneja.</Nota>
      )}
      {sentado && (
        <Opcion t="Se fue sin terminar" d="Cierra el turno sin contar la visita" rojo onPress={() => setHoja({ tipo: 'sacar', item })} />
      )}
      <Pie><AhoraNo texto="Cerrar" onPress={() => setHoja(null)} /></Pie>
    </>
  )
}

function Sacar({ item, ocupado, acciones, setHoja }: Props & { item: any }) {
  const sentado = item.estado === 'atendiendo'
  const quien = nombreDe(item)
  return (
    <>
      <Titulo>{sentado ? '¿Se fue sin terminar?' : '¿Sacarlo de la fila?'}</Titulo>
      <Sub>
        {sentado
          ? `${quien} deja la silla sin que cuente como visita: no entra en las cuentas del día ni suma a su tarjeta. Si sí lo atendiste, cierra con «Terminar» en vez de esto.`
          : `${quien} deja de estar en la fila y los demás suben. Si es un cliente de la app, su turno se cierra y podrá volver a entrar cuando quiera.`}
      </Sub>
      <Pie>
        <BotonRojo texto={sentado ? 'Sí, se fue' : 'Sí, sacarlo'} ocupado={ocupado} onPress={() => acciones.sacar(item)} />
        <AhoraNo texto="Volver" onPress={() => setHoja({ tipo: 'persona', item })} />
      </Pie>
    </>
  )
}

function Servicios({ item, volver, servicios, moneda, ocupado, acciones, setHoja }: Props & { item: any; volver: HojaSilla | null }) {
  return (
    <>
      <Titulo>Cambiar el servicio</Titulo>
      <Sub>El turno pasa a este servicio: cambian la duración y lo que se cobra.</Sub>
      {servicios.length === 0 && <Text style={s.vacio}>Primero crea un servicio en Ajustes.</Text>}
      {servicios.map(sv => {
        const actual = sv.id === item.servicio_id
        return (
          <TouchableOpacity key={sv.id} style={[s.serv, actual && s.servSel]} disabled={actual || ocupado}
            onPress={() => acciones.cambiarServicio(item, sv)} activeOpacity={0.8}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.servN}>{sv.nombre}</Text>
              <Text style={s.servD}>{sv.duracion_min} min{actual ? ' · el de ahora' : ''}</Text>
            </View>
            {sv.precio != null && <Text style={s.servP}>{dinero(sv.precio, moneda)}</Text>}
          </TouchableOpacity>
        )
      })}
      <Pie><AhoraNo texto="Volver" onPress={() => setHoja(volver)} /></Pie>
    </>
  )
}

/* ─────────────────────────── UNA CITA DE HOY ─────────────────────────── */

function Cita({ item: c, servicios, moneda, datos, acciones, setHoja }: Props & { item: any }) {
  const abierta = CITA_ABIERTA.includes(c.estado)
  const precio = c.turno_servicios?.precio ?? servicios.find(x => x.id === c.servicio_id)?.precio
  const yaPaso = String(c.hora_inicio).slice(0, 5) < datos.ahora.slice(0, 5)
  const tel = telDe(c)
  const confirmada = c.estado === 'confirmada' || c.estado === 'en_camino'
  // Las que llevan Alert se preguntan con la hoja ya cerrada: dos capas
  // modales a la vez es justo lo que se atascaba en Android.
  const y = (fn: (c: any) => void) => () => { setHoja(null); fn(c) }
  return (
    <>
      <Titulo>{hora12(c.hora_inicio).replace(/ (AM|PM)$/, '')} · {nombreDe(c)}</Titulo>
      <Sub>{[c.turno_servicios?.nombre, c.turno_servicios?.duracion_min ? `${c.turno_servicios.duracion_min} min` : null,
        precio != null ? dinero(precio, moneda) : null].filter(Boolean).join(' · ')}</Sub>
      <Nota tono={confirmada ? 'azul' : abierta ? 'ambar' : 'gris'}>{FRASE_CITA[c.estado] ?? c.estado}</Nota>

      {abierta && (
        <>
          <Opcion t="Atendida" d="Cuenta como visita y como cobro" onPress={y(acciones.citaAtendida)} />
          <Opcion t="No llegó" d="Pasa a tu fila con prioridad por si aparece" rojo onPress={y(acciones.citaNoLlego)} />
          <Opcion t="Cancelar la cita" d="La cancelas tú, y se le avisa" rojo onPress={y(acciones.citaCancelar)} />
          {tel && !yaPaso && <Opcion t="Recordarle por WhatsApp" d="Abre el chat con el mensaje escrito" onPress={() => acciones.recordar(c)} />}
        </>
      )}
      {c.cliente_id && (
        <Opcion t="Ver su ficha" d="Historial, su tarjeta y tu nota" flecha
          onPress={() => setHoja({ tipo: 'ficha', clienteId: c.cliente_id, nombre: nombreDe(c), telefono: tel ?? undefined, volver: { tipo: 'cita', item: c } })} />
      )}
      <Pie><AhoraNo texto="Cerrar" onPress={() => setHoja(null)} /></Pie>
    </>
  )
}

/* ─────────────────────────── SALGO UN MOMENTO ─────────────────────────── */

function Salgo({ min: inicial, datos, enFila, ocupado, acciones, setHoja }: Props & { min: number | null }) {
  const [min, setMin] = useState<number | null>(inicial)
  const { enEspera } = partirCola(datos.cola)
  const esperan = enFila.length + enEspera.length
  const vuelta = min ? sumarMinutos(datos.ahora.slice(0, 5), min) : null
  // Una cita que cae mientras estás fuera: se dice ahora, no cuando llegue.
  const choca = min ? cabeAntesDeLaCita(datos, min) : { cabe: true as const, cita: undefined }
  return (
    <>
      <Titulo>Salgo un momento</Titulo>
      <Sub>Mientras estás fuera, tu fila no deja entrar a nadie nuevo.</Sub>
      <View style={s.chips}>
        {([10, 15, 30, null] as (number | null)[]).map(m => {
          const sel = m === min
          return (
            <TouchableOpacity key={String(m)} style={[s.chip, sel && s.chipSel]} onPress={() => setMin(m)}
              accessibilityRole="radio" accessibilityState={{ selected: sel }}>
              <Text style={[s.chipT, sel && { color: '#fff' }]}>{m ? `${m} min` : 'Sin hora'}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {esperan > 0 && (
        <Nota tono="ambar">
          Avisamos a <Text style={s.b}>{esperan === 1 ? 'quien espera' : `los ${esperan} que esperan`}</Text>
          {vuelta ? `: «salió un momento, vuelve sobre las ${hora12(vuelta)}. Tu turno sigue en pie.»` : ': «salió un momento. Tu turno sigue en pie.»'}
        </Nota>
      )}
      {!choca.cabe && choca.cita && (
        <Nota tono="rojo">
          Tu cita de las <Text style={s.b}>{hora12(choca.cita.hora_inicio)}</Text> ({primerNombre(choca.cita)}) llega antes de que vuelvas.
        </Nota>
      )}
      <Nota tono="gris">
        {min
          ? <>Si pasa la hora y no has vuelto, la fila <Text style={s.b}>no se reabre sola</Text>: te preguntamos si ya volviste.</>
          : <>Sin hora, la fila sigue cerrada hasta que toques <Text style={s.b}>«Ya volví»</Text>.</>}
      </Nota>

      <Pie>
        <View style={s.resumen}>
          <Text style={s.resumenT}>{vuelta ? `Vuelves sobre las ${hora12(vuelta)}` : 'Vuelves cuando vuelvas'}</Text>
          {min ? <Text style={s.resumenP}>{min}′</Text> : null}
        </View>
        <BotonRojo texto="Salgo" ocupado={ocupado} onPress={() => acciones.salir(min)} />
        <AhoraNo onPress={() => setHoja(null)} />
      </Pie>
    </>
  )
}

/* ─────────────────────────── ¿EN QUÉ LOCAL? ─────────────────────────── */

function Local({ locales, negocioId, acciones, setHoja }: Props) {
  return (
    <>
      <Titulo>¿En qué local?</Titulo>
      <Sub>Tu perfil es tuyo en todos. La silla, la fila y las citas son de cada uno.</Sub>
      {locales.map((l: any) => {
        const aqui = l.negocio_id === negocioId
        return (
          <TouchableOpacity key={l.negocio_id} style={[s.local, aqui && s.localAqui]} disabled={aqui}
            onPress={() => acciones.cambiarLocal(l)} activeOpacity={0.75} accessibilityRole="button">
            <Text style={s.localN} numberOfLines={1}>{l.nombre}</Text>
            {aqui ? <Text style={s.aqui}>AQUÍ</Text> : <Ionicons name="chevron-forward" size={17} color={COLORS.textLight} />}
          </TouchableOpacity>
        )
      })}
      <Pie><AhoraNo texto="Cerrar" onPress={() => setHoja(null)} /></Pie>
    </>
  )
}

/* ─────────────────────────── LA FICHA, SIN SALIR DE LA SILLA ─────────────────────────── */

function Ficha({ f, sesion, moneda, setHoja }: Props & { f: Extract<HojaSilla, { tipo: 'ficha' }> }) {
  const router = useRouter()
  const [d, setD] = useState<any>(null)
  useEffect(() => {
    if (!sesion?.negocio_id) return
    let vivo = true
    Promise.all([
      getPreferenciasCliente(f.clienteId, sesion.negocio_id).catch(() => null),
      sesion.usuario_id ? getNotaBarbero(sesion.usuario_id, f.clienteId).catch(() => '') : Promise.resolve(''),
      getHistorialCliente(f.clienteId, sesion.negocio_id).catch(() => []),
      getFidelidad(sesion.negocio_id, sesion.perfil_id).catch(() => null),
    ]).then(async ([prefs, nota, hist, fid]) => {
      const t: any = fid?.activo ? await getTarjetaCliente(f.clienteId, sesion.negocio_id, fid.perfil ?? null).catch(() => null) : null
      // «Contigo»: el historial del local trae las visitas con cualquier
      // barbero; aquí interesan las tuyas.
      const mias = (hist as any[]).filter(h => !h.perfil_id || h.perfil_id === sesion.perfil_id)
      if (vivo) setD({ prefs, nota, mias, fid: fid?.activo ? { meta: fid.meta, disp: (t?.visitas_totales ?? 0) - (t?.visitas_canjeadas ?? 0) } : null })
    })
    return () => { vivo = false }
  }, [f.clienteId, sesion?.negocio_id, sesion?.perfil_id, sesion?.usuario_id])

  const gusto = d?.prefs ? [d.prefs.tipo_corte, d.prefs.largo, d.prefs.barba].filter(Boolean).join(', ') : ''
  const tel = f.telefono && /\d{7,}/.test(f.telefono.replace(/\D/g, '')) ? f.telefono : null
  return (
    <>
      <Titulo>{f.nombre}</Titulo>
      {!d ? <ActivityIndicator color={COLORS.ink} style={{ marginVertical: 30 }} /> : (
        <>
          <Sub>
            {d.mias.length === 0 ? 'Todavía no ha venido contigo.'
              : `${d.mias.length} ${d.mias.length === 1 ? 'visita' : 'visitas'} contigo · la última, el ${fechaCorta(d.mias[0].fecha)}`}
          </Sub>
          {!!gusto && <Dato l="Cómo le gusta" v={gusto} />}
          {!!d.prefs?.alergias && <Dato l="Alergias" v={d.prefs.alergias} color={COLORS.redDark} />}
          {!!d.prefs?.notas && <Dato l="Lo que pide" v={d.prefs.notas} />}
          {!!d.nota && <Dato l="Tu nota · solo tú" v={d.nota} />}
          {d.fid && (
            <View style={s.dato}>
              <View style={s.datoFila}>
                <Text style={s.datoL}>Su tarjeta contigo</Text>
                <Text style={s.tarjetaN}>{d.fid.disp} / {d.fid.meta}</Text>
              </View>
              <View style={s.barra}><View style={[s.barraLlena, { width: `${Math.min(100, (d.fid.disp / Math.max(1, d.fid.meta)) * 100)}%` }]} /></View>
            </View>
          )}
          {d.mias.length > 0 && (
            <>
              <Seccion>Últimas visitas</Seccion>
              {d.mias.slice(0, 3).map((h: any) => (
                <View key={h.id} style={s.visita}>
                  <Text style={s.visitaF}>{fechaCorta(h.fecha)}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.servN} numberOfLines={1}>{h.turno_servicios?.nombre ?? 'Servicio'}</Text>
                    {h.precio_cobrado != null && <Text style={s.servD}>{dinero(h.precio_cobrado, moneda)}</Text>}
                  </View>
                </View>
              ))}
            </>
          )}
          <TouchableOpacity style={s.todo} onPress={() => {
            setHoja(null)
            router.push({ pathname: '/(app)/barbero/clientes', params: { cliente: f.clienteId, nombre: f.nombre, telefono: f.telefono ?? '' } } as any)
          }}>
            <Text style={s.todoT}>Ver todo y escribir tu nota ›</Text>
          </TouchableOpacity>
        </>
      )}
      <Pie>
        {tel && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><BotonContorno texto="WhatsApp" onPress={() => Linking.openURL(`https://wa.me/${tel.replace(/\D/g, '')}`)} /></View>
            <View style={{ flex: 1 }}><BotonContorno texto="Llamar" onPress={() => Linking.openURL(`tel:${tel.replace(/[^\d+]/g, '')}`)} /></View>
          </View>
        )}
        <AhoraNo texto={f.volver ? 'Volver' : 'Cerrar'} onPress={() => setHoja(f.volver)} />
      </Pie>
    </>
  )
}

const s = StyleSheet.create({
  titulo: { fontFamily: FONTS.bold, letterSpacing: -0.6, fontSize: 26, lineHeight: 30, color: COLORS.ink, marginTop: 4 },
  sub: { fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19, color: COLORS.textMid, marginTop: 4, marginBottom: 8 },
  b: { fontFamily: FONTS.semibold, color: COLORS.ink },
  secT: { fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 2, color: COLORS.ink },
  secFilete: { height: 2, backgroundColor: COLORS.ink, marginTop: 7 },
  nota: { marginVertical: 10, backgroundColor: COLORS.surfaceAlt, borderRadius: 8, padding: 12 },
  notaT: { fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19, color: COLORS.ink },
  dato: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  datoFila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  datoL: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textMid },
  datoV: { flex: 1, textAlign: 'right', fontFamily: FONTS.semibold, fontSize: 14.5, color: COLORS.ink },
  tarjetaN: { flex: 1, textAlign: 'right', fontFamily: FONTS.monoBold, fontSize: 20, color: COLORS.ink },
  barra: { height: 8, backgroundColor: COLORS.surfaceAlt, marginTop: 10 },
  barraLlena: { height: 8, backgroundColor: COLORS.ink },
  opc: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  opcT: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  opcD: { fontFamily: FONTS.regular, fontSize: 12.5, lineHeight: 17, color: COLORS.textMid, marginTop: 2 },
  serv: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  servSel: { backgroundColor: COLORS.surfaceAlt, borderRadius: 8, paddingHorizontal: 12 },
  servN: { fontFamily: FONTS.semibold, fontSize: 15.5, color: COLORS.ink },
  servD: { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textMid, marginTop: 2 },
  servP: { fontFamily: FONTS.monoBold, fontSize: 19, color: COLORS.ink },
  vacio: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textMid, marginVertical: 14 },
  input: { borderWidth: 1, borderColor: COLORS.border, height: 50, paddingHorizontal: 14, marginTop: 12, fontFamily: FONTS.regular, fontSize: 15, color: COLORS.ink, backgroundColor: COLORS.surface },
  chips: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 4 },
  chip: { flex: 1, height: 46, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  chipSel: { backgroundColor: COLORS.ink },
  chipT: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  local: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  localAqui: { backgroundColor: COLORS.surfaceAlt, borderRadius: 8, paddingHorizontal: 12 },
  localN: { flex: 1, fontFamily: FONTS.semibold, letterSpacing: -0.3, fontSize: 20, color: COLORS.ink },
  aqui: { fontFamily: FONTS.bold, fontSize: 10, letterSpacing: 1, color: '#fff', backgroundColor: COLORS.ink, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  visita: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  visitaF: { width: 62, fontFamily: FONTS.monoBold, fontSize: 18, color: COLORS.ink },
  todo: { paddingVertical: 14 },
  todoT: { fontFamily: FONTS.semibold, fontSize: 13.5, color: COLORS.blue },
  pie: { borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 18, paddingTop: 16, gap: 4 },
  resumen: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  resumenT: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textMid },
  resumenP: { fontFamily: FONTS.monoBold, fontSize: 22, color: COLORS.ink },
  rojo: { height: 56, backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  rojoT: { fontFamily: FONTS.semibold, fontSize: 16, color: '#fff' },
  contorno: { height: 54, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  contornoT: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.ink, letterSpacing: 0 },
  ahoraNo: { alignItems: 'center', paddingVertical: 12 },
  ahoraNoT: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.textMid },
})
