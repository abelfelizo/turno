/**
 * LA TARJETA UNIFICADA — el único objeto oscuro de la pantalla principal.
 *
 * Antes eran dos bloques compitiendo: «la barbería ahora» y el ticket del
 * turno, cada uno con su poste, uno encima del otro. Más la fidelidad, que era
 * un tercero. Tres cosas negras en la misma pantalla y ninguna manda.
 *
 * Esto las funde en una, con DOS ESTADOS EXCLUYENTES, y la regla que lo ordena
 * todo es esta:
 *
 *   Si tienes turno, MANDA TU TURNO y el local baja a nota al pie.
 *   Si no tienes turno, MANDA EL LOCAL.
 *
 * Sin esa jerarquía son treinta combinaciones (turno × modo de atención ×
 * abierto × pausa × conexión) y ninguna forma de decidir qué se lee primero.
 *
 * LA CIFRA GRANDE ES UNA SOLA RANURA CON SIETE SIGNIFICADOS, y cambia de
 * sentido a propósito según el estado:
 *
 *   sin turno, hay cola     25′    DE ESPERA
 *   sin turno, nadie         0     ENTRAS DIRECTO
 *   solo con cita          3:30    PRÓXIMA CON JEISON
 *   en la fila              3º     DE LA FILA
 *   te llamaron             4′     PARA LLEGAR
 *   en la silla           AHORA    TE ESTÁN ATENDIENDO
 *   fila en pausa          3:15    VUELVE SOBRE
 *   cerrado             (ninguna)  el motivo ocupa su sitio
 *
 * Sin turno importa cuánto esperarías; ya dentro, lo que esperan los demás
 * deja de ser asunto tuyo y lo tuyo es tu puesto; cuando te llaman, lo único
 * que importa es cuánto te queda para llegar. Con el local cerrado NO HAY
 * CIFRA: un 0 contestaría una pregunta que nadie hizo.
 *
 * EL ROJO MACIZO, UNA VEZ. La tarjeta entera se vuelve roja solo cuando te
 * llamaron, y entonces el botón de fila ni existe porque ya estás dentro.
 * «Eres el siguiente» se queda en filete: gastar el grito antes lo desactiva
 * para cuando de verdad hace falta.
 */
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS } from '../constants'
import { Pole, PuntoVivo } from './ui'
import { hora12, relojesDeSilla } from '../lib/format'
import type { SillaEstado } from './estado-local'

export type TurnoVivo = {
  id: string
  estado: string
  codigo?: string | null
  servicio?: string | null
  barbero?: string | null
  /** Ya formateado: la tarjeta no sabe en qué moneda cobra este local. */
  precio?: string | null
  /**
   * Ya dijo que está EN EL LOCAL (`llego_at`), no solo que venía.
   *
   * Son dos cosas distintas y confundirlas le costaba el turno a quien ya
   * había llegado: «voy en camino» avisa al barbero para que no llame al
   * siguiente, pero NO apaga la cuenta atrás de la ventana — ese reloj existe
   * para el que no aparece, y el que está de pie en la puerta ya apareció.
   * Mientras esto sea falso sigue habiendo un botón que tocar, aunque ya haya
   * dicho que viene.
   */
  llego?: boolean
}

type Props = {
  negocio?: { nombre?: string | null; ciudad?: string | null; sector?: string | null } | null
  /** Más de una barbería: el nombre se vuelve conmutador. */
  variosLocales?: boolean
  onCambiarLocal?: () => void

  sillas: SillaEstado[]
  delante: number
  esperaMin: number

  /**
   * EL PRÓXIMO HUECO LIBRE, cuando el local solo trabaja con cita.
   *
   * Sin esto la cifra era un guion: «hoy solo con cita» y nada más. Es cierto
   * y es inútil — deja al cliente con la pregunta entera («¿a qué hora
   * entonces?») y obliga a abrir la agenda para averiguarlo. Con la hora
   * puesta, la tarjeta contesta lo mismo que contestaría el barbero por
   * teléfono: «hoy a las tres y media».
   *
   * Nunca dice el NOMBRE de quién tiene ese hueco. Con cuatro barberos,
   * elegir uno para enseñarlo es recomendarlo, y recomendar no le toca a la
   * app. `deTuBarbero` distingue lo único que el cliente sí decidió: si el
   * hueco es del que él marcó como suyo, o el primero del local.
   */
  proximoHueco?: string | null
  deTuBarbero?: boolean

  /** El turno activo, si lo hay. Manda sobre todo lo demás. */
  turno?: TurnoVivo | null
  puesto?: number | null
  etaMin?: number | null
  /** Minutos que quedan de ventana de llegada, cuando te llamaron. */
  quedanMin?: number | null

  /**
   * Por qué el botón de responder está apagado, si lo está.
   *
   * La ventana de llegada tiene un cerrojo de distancia (`puedeConfirmar`): no
   * se puede decir «ya llegué» desde la casa. Sin este texto el botón se
   * quedaba encendido y el error salía después de tocarlo, o —peor— se
   * escondía y el cliente no sabía que existía una forma de responder.
   */
  bloqueo?: string | null

  onFila?: () => void
  onAgendar?: () => void
  onVoyEnCamino?: () => void
  onCancelar?: () => void
}

/**
 * ¿HAY ALGUIEN TOMANDO GENTE? ¿Y ES SOLO CON CITA?
 *
 * Las dos preguntas se contestan aquí y no dentro de la tarjeta porque la
 * pantalla también las necesita —para saber si merece la pena ir a buscar el
 * próximo hueco— y una regla copiada en dos sitios se corrige en uno.
 *
 * `fila_abierta === false` es un no del servidor; `null` o ausente es «no se
 * sabe», y el silencio nunca puede significar cerrado: dejaría a oscuras un
 * local abierto solo porque una respuesta vino cacheada.
 */
export function localAbierto(sillas: SillaEstado[]): boolean {
  return sillas.some(x => x.fila_abierta !== false)
}

export function soloConCita(sillas: SillaEstado[]): boolean {
  return localAbierto(sillas) && sillas.every(x => x.modo === 'solo_citas' || x.fila_abierta === false)
}

export default function TarjetaTurno(p: Props) {
  const conFila = p.sillas.filter(x => x.fila_abierta !== false)
  const abierto = localAbierto(p.sillas)
  const libres = conFila.filter(x => x.estado === 'libre').length
  const sinServicio = p.sillas.length === 0

  // El motivo del cierre solo se resume cuando TODAS dicen lo mismo. Con dos
  // motivos distintos no se inventa un resumen: se ve silla por silla abajo.
  const motivos = Array.from(new Set(p.sillas.map(x => x.fila_motivo).filter(Boolean))) as string[]
  const motivoComun = !abierto && motivos.length === 1 ? motivos[0] : null

  const llamado = p.turno?.estado === 'llamado'
  const enSilla = p.turno?.estado === 'atendiendo'
  const urgente = llamado && (p.quedanMin ?? 99) <= 2

  const fondo = llamado ? (urgente ? COLORS.redDark : COLORS.red) : COLORS.carbon
  const tenue = llamado ? 'rgba(255,255,255,0.72)' : COLORS.onCarbonMid

  return (
    <View style={[s.card, { backgroundColor: fondo }]}>
      <Pole height={7} radius={0} animado={!llamado} />

      <View style={s.cuerpo}>
        {/* EL NOMBRE DEL LOCAL ES LA CABECERA, y vive dentro del bloque.
            La tira de píldoras que había antes flotando encima no pesaba nada
            y encima repetía el nombre que la tarjeta ya decía debajo. */}
        <TouchableOpacity
          disabled={!p.variosLocales}
          onPress={p.onCambiarLocal}
          activeOpacity={0.75}
          accessibilityRole={p.variosLocales ? 'button' : undefined}
          accessibilityLabel={p.variosLocales ? 'Cambiar de barbería' : undefined}
          style={s.cab}>
          <View style={{ flex: 1 }}>
            <Text style={s.local} numberOfLines={2}>{p.negocio?.nombre ?? 'Tu barbería'}</Text>
            {p.variosLocales && <Text style={[s.localSub, { color: tenue }]}>Tocá para cambiar de barbería</Text>}
          </View>
          {p.variosLocales && <Ionicons name="chevron-down" size={18} color={tenue} />}
        </TouchableOpacity>

        <View style={[s.filete, { backgroundColor: llamado ? 'rgba(255,255,255,0.28)' : COLORS.carbonDash }]} />

        {p.turno ? <ConTurno {...p} llamado={llamado} enSilla={enSilla} urgente={urgente} tenue={tenue} />
                 : <SinTurno {...p} abierto={abierto} libres={libres} sinServicio={sinServicio} motivoComun={motivoComun} />}
      </View>
    </View>
  )
}

/* ─────────────────────── SIN TURNO · manda el local ─────────────────────── */

function SinTurno(p: Props & { abierto: boolean; libres: number; sinServicio: boolean; motivoComun: string | null }) {
  const soloCitas = soloConCita(p.sillas)
  const nadie = p.abierto && p.delante === 0

  return (
    <>
      <View style={s.estadoFila}>
        <View style={s.estadoIzq}>
          <PuntoVivo color={p.abierto ? COLORS.okNoche : 'rgba(255,255,255,0.4)'} vivo={p.abierto} />
          <Text style={[s.estadoT, { color: p.abierto ? COLORS.okNoche : COLORS.onCarbonMid }]}>
            {p.sinServicio ? 'SIN SERVICIO' : p.abierto ? 'ABIERTO AHORA' : 'CERRADO'}
          </Text>
        </View>
        {p.abierto && !p.sinServicio && (
          <Text style={s.estadoDer} numberOfLines={1}>
            {p.delante === 0 ? 'Nadie esperando' : `${p.delante} esperando`}
            {p.libres > 0 ? ` · ${p.libres} libre${p.libres === 1 ? '' : 's'}` : ''}
          </Text>
        )}
      </View>

      {/* SIN SERVICIO Y CERRADO NO LLEVAN CIFRA. En su sitio va el motivo, que
          viene del servidor palabra por palabra: es el mismo texto con el que
          rechazaría el turno, así que no hay dos versiones de la verdad. */}
      {p.sinServicio ? (
        <Text style={s.motivo}>
          Todavía no atienden por la app. Puedes seguir yendo como siempre — y en
          cuanto la activen, aparecerá aquí.
        </Text>
      ) : !p.abierto ? (
        <Text style={s.motivo}>
          {p.motivoComun
            ? p.motivoComun.charAt(0).toUpperCase() + p.motivoComun.slice(1)
            : 'Ninguna silla está tomando gente ahora'}
        </Text>
      ) : (
        <Cifra
          valor={soloCitas ? (p.proximoHueco ?? '—') : nadie ? '0' : `${p.esperaMin || 0}′`}
          rotulo={soloCitas
            ? (p.proximoHueco
                ? (p.deTuBarbero ? 'PRÓXIMO CON TU BARBERO' : 'PRÓXIMO HUECO LIBRE')
                : 'HOY SOLO CON CITA')
            : nadie ? 'ENTRAS DIRECTO' : 'DE ESPERA SI ENTRAS AHORA'}
          color={nadie ? COLORS.okNoche : soloCitas ? COLORS.azulNoche : COLORS.redSoft}
        />
      )}

      {/* Guion y nada más deja al cliente sin saber si es que no hay huecos
          hoy o si la app no pudo preguntar. Se dice. */}
      {soloCitas && !p.proximoHueco && (
        <Text style={s.motivo}>Hoy no quedan huecos. Reserva para otro día.</Text>
      )}

      {p.sillas.length > 0 && <Sillas sillas={p.sillas} />}

      {/* Sin servicio no hay puertas: dos botones que llevan a pantallas
          vacías son peor que ninguno. */}
      {!p.sinServicio && (
        <Pie
          principal={p.abierto && !soloCitas ? { texto: 'Entrar a la fila', onPress: p.onFila } : null}
          secundario={{ texto: p.abierto ? 'Reservar cita' : 'Reservar otro día', onPress: p.onAgendar }}
        />
      )}
    </>
  )
}

/* ─────────────────────── CON TURNO · manda tu turno ─────────────────────── */

function ConTurno(p: Props & { llamado: boolean; enSilla: boolean; urgente: boolean; tenue: string }) {
  // Camino dicho y llegada dicha no son lo mismo: solo la segunda cierra el
  // asunto. Ver `llego` en TurnoVivo.
  const llego = !!p.turno?.llego
  const enCamino = p.turno?.estado === 'en_camino'

  // «Voy en camino» avisa al barbero pero NO para el reloj, así que la cifra
  // sigue siendo la misma que cuando te llamaron: lo que te queda para llegar.
  // Ponerle el puesto sería enseñar un número que ya no decide nada —y además
  // vacío, porque el puesto solo se calcula mientras estás en la fila.
  const corriendo = (p.llamado || (enCamino && !llego)) && p.quedanMin != null
  const cifra = corriendo ? `${Math.max(0, p.quedanMin ?? 0)}′`
    : p.enSilla ? 'AHORA'
    : llego ? 'AQUÍ'
    : p.puesto ? `${p.puesto}º` : '—'
  const rotulo = corriendo ? 'PARA LLEGAR'
    : p.enSilla ? 'TE ESTÁN ATENDIENDO'
    : llego ? 'ESPERANDO EN EL LOCAL'
    : p.puesto === 1 ? 'ERES EL SIGUIENTE' : 'DE LA FILA'

  return (
    <>
      <View style={s.estadoFila}>
        <Text style={[s.estadoT, { color: p.llamado ? '#fff' : COLORS.onCarbonMid }]}>
          {p.llamado ? '¡ES TU TURNO!'
            : p.enSilla ? 'EN LA SILLA'
            : llego ? 'YA LLEGASTE'
            : enCamino ? 'VAS EN CAMINO'
            : 'ESTÁS EN LA FILA'}
        </Text>
        {!!p.turno?.codigo && <Text style={s.codigo}>{p.turno.codigo}</Text>}
      </View>

      <Cifra
        valor={cifra}
        rotulo={rotulo}
        color="#fff"
        // «Eres el siguiente» todavía NO es rojo macizo: aún no te han llamado.
        filete={!p.llamado && p.puesto === 1}
      />

      <Text style={s.servicio} numberOfLines={1}>{p.turno?.servicio ?? 'Tu turno'}</Text>
      <Text style={[s.servicioMeta, { color: p.tenue }]} numberOfLines={1}>
        {p.turno?.barbero ?? 'Sin asignar'}
        {p.turno?.precio ? ` · ${p.turno.precio}` : ''}
      </Text>

      {p.urgente && <Text style={s.consecuencia}>Si no llegas, pierdes el turno</Text>}
      {!p.llamado && !p.enSilla && p.etaMin != null && (
        <View style={s.eta}><Text style={s.etaT}>≈ {p.etaMin}′ de espera</Text></View>
      )}

      {/* EN LA SILLA NO HAY BOTONES: ya estás sentado, no hay nada que
          gestionar. Y si ya dijiste que vas en camino, el botón se convierte
          en estado — si siguiera siendo botón no habría forma de saber que se
          registró. */}
      {!p.enSilla && (
        llego ? (
          <View style={s.pieSolo}>
            <View style={s.enCamino}>
              <PuntoVivo color={COLORS.okNoche} vivo />
              <Text style={s.enCaminoT}>Ya llegaste · el barbero lo sabe</Text>
            </View>
            <TouchableOpacity onPress={p.onCancelar} hitSlop={8}>
              <Text style={[s.cancelar, { color: p.tenue }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Pie
            principal={p.bloqueo ? null
              : { texto: p.llamado ? 'Ya llegué' : 'Voy en camino', onPress: p.onVoyEnCamino, claro: true }}
            secundario={null}
            nota={p.bloqueo ?? undefined}
            cancelar={{ texto: p.llamado ? 'No puedo ir' : 'Cancelar', onPress: p.onCancelar, color: p.tenue }}
          />
        )
      )}
    </>
  )
}

/* ─────────────────────────────── piezas ─────────────────────────────────── */

function Cifra({ valor, rotulo, color, filete }: { valor: string; rotulo: string; color: string; filete?: boolean }) {
  return (
    <View style={[s.cifraCaja, filete && s.cifraFilete]}>
      <Text style={[s.cifra, { color }, valor.length > 3 && { fontSize: 46 }]}>{valor}</Text>
      <Text style={s.cifraRot}>{rotulo}</Text>
    </View>
  )
}

function Sillas({ sillas }: { sillas: SillaEstado[] }) {
  const COLOR: Record<string, string> = {
    libre: COLORS.okNoche,
    atendiendo: COLORS.azulNoche,
    descanso: COLORS.ambarNoche,
    inactivo: 'rgba(255,255,255,0.35)',
  }
  return (
    <View style={s.sillas}>
      {sillas.map(x => {
        const cerrada = x.fila_abierta === false
        return (
          <View key={x.perfil_id} style={s.chip}>
            <View style={[s.punto, { backgroundColor: cerrada ? COLOR.inactivo : COLOR[x.estado] ?? COLOR.inactivo }]} />
            <Text style={s.chipT} numberOfLines={1}>
              {x.barbero?.split(' ')[0] ?? 'Barbero'}
              <Text style={s.chipD}>
                {cerrada ? (x.modo === 'solo_citas' ? '  solo con cita' : '  cerrado')
                  : x.estado === 'atendiendo' ? (() => {
                      const r = relojesDeSilla(x.desde, x.fin_estimado)
                      if (r?.fin && !r.tarde) return `  libre ~${r.fin}`
                      if (x.hasta) return `  vuelve ~${hora12(x.hasta)}`
                      return '  atendiendo'
                    })()
                  : x.en_cola > 0 ? `  ${x.en_cola} esperando`
                  : '  libre'}
              </Text>
            </Text>
          </View>
        )
      })}
    </View>
  )
}

/**
 * EL PIE. Los dos destinos van DENTRO de la tarjeta y no como bloques sueltos:
 * sueltos tenían el tamaño de la decisión principal y competían con la cifra,
 * que es lo que hay que leer primero. Aquí son la consecuencia del dato.
 */
function Pie({ principal, secundario, cancelar, nota }: {
  principal: { texto: string; onPress?: () => void; claro?: boolean } | null
  secundario: { texto: string; onPress?: () => void } | null
  cancelar?: { texto: string; onPress?: () => void; color: string }
  /** Ocupa el sitio del botón principal cuando ese botón no se puede tocar. */
  nota?: string
}) {
  return (
    <>
      <View style={[s.filete, { backgroundColor: COLORS.carbonDash, marginTop: 16, marginBottom: 14 }]} />
      <View style={s.pie}>
        {!!nota && (
          <View style={s.nota}>
            <Ionicons name="lock-closed" size={13} color={COLORS.onCarbonMid} />
            <Text style={s.notaT}>{nota}</Text>
          </View>
        )}
        {principal && (
          <TouchableOpacity
            style={[s.btn, principal.claro ? s.btnClaro : s.btnRojo]}
            onPress={principal.onPress} activeOpacity={0.85}>
            <Text style={[s.btnT, principal.claro && { color: COLORS.ink }]}>{principal.texto}</Text>
          </TouchableOpacity>
        )}
        {secundario && (
          <TouchableOpacity style={[s.btn, s.btnContorno]} onPress={secundario.onPress} activeOpacity={0.85}>
            <Text style={s.btnT}>{secundario.texto}</Text>
          </TouchableOpacity>
        )}
        {cancelar && (
          <TouchableOpacity style={s.btnCancelar} onPress={cancelar.onPress} hitSlop={8}>
            <Text style={[s.cancelar, { color: cancelar.color }]}>{cancelar.texto}</Text>
          </TouchableOpacity>
        )}
      </View>
    </>
  )
}

const s = StyleSheet.create({
  card: { borderRadius: 6, overflow: 'hidden', marginBottom: 12 },
  cuerpo: { paddingHorizontal: 18, paddingTop: 17, paddingBottom: 18 },

  cab: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  local: { fontFamily: FONTS.display, fontSize: 30, lineHeight: 32, color: '#fff',
    textTransform: 'uppercase', letterSpacing: 0.3 },
  localSub: { fontFamily: FONTS.bold, fontSize: 11, marginTop: 4, letterSpacing: 0.3 },

  filete: { height: 1, marginVertical: 15 },

  estadoFila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  estadoIzq: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  estadoT: { fontFamily: FONTS.bold, fontSize: 10.5, letterSpacing: 1.6 },
  estadoDer: { flex: 1, textAlign: 'right', fontFamily: FONTS.bold, fontSize: 12, color: COLORS.onCarbonMid },
  codigo: { flex: 1, textAlign: 'right', fontFamily: FONTS.bold, fontSize: 10.5, letterSpacing: 1.6, color: '#fff' },

  cifraCaja: { marginTop: 9 },
  cifraFilete: { borderLeftWidth: 3, borderLeftColor: COLORS.redSoft, paddingLeft: 12, marginLeft: -15 },
  cifra: { fontFamily: FONTS.display, fontSize: 76, lineHeight: 64 },
  cifraRot: { fontFamily: FONTS.bold, fontSize: 10, letterSpacing: 1.6, color: COLORS.onCarbonMid, marginTop: 6 },

  motivo: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.onCarbonMid, marginTop: 12, lineHeight: 20 },
  servicio: { fontFamily: FONTS.bold, fontSize: 16, color: '#fff', marginTop: 14 },
  servicioMeta: { fontFamily: FONTS.medium, fontSize: 12.5, marginTop: 2 },
  consecuencia: { fontFamily: FONTS.bold, fontSize: 13, color: '#fff', marginTop: 10 },

  eta: { alignSelf: 'flex-start', marginTop: 12, backgroundColor: COLORS.red, paddingVertical: 7, paddingHorizontal: 12 },
  etaT: { fontFamily: FONTS.bold, fontSize: 12.5, color: '#fff' },

  sillas: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 15 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.10)',
    paddingVertical: 6, paddingHorizontal: 11, maxWidth: '100%' },
  punto: { width: 7, height: 7, borderRadius: 4 },
  chipT: { fontFamily: FONTS.bold, fontSize: 12, color: '#fff', flexShrink: 1 },
  chipD: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.onCarbonMid },

  pie: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  pieSolo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16,
    borderTopWidth: 1, borderTopColor: COLORS.carbonDash, paddingTop: 14 },
  btn: { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center' },
  btnRojo: { backgroundColor: COLORS.red },
  btnClaro: { backgroundColor: '#fff' },
  btnContorno: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)' },
  btnT: { fontFamily: FONTS.display, fontSize: 16.5, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.4 },
  nota: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    height: 50, backgroundColor: 'rgba(255,255,255,0.10)' },
  notaT: { fontFamily: FONTS.bold, fontSize: 12.5, color: COLORS.onCarbonMid },
  btnCancelar: { paddingHorizontal: 4 },
  cancelar: { fontFamily: FONTS.bold, fontSize: 13 },

  enCamino: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  enCaminoT: { fontFamily: FONTS.bold, fontSize: 13.5, color: '#fff' },
})
