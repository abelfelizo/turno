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
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native'
import { useEffect, useRef } from 'react'
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
  /** Para cruzarlo con las sillas y ver si TU barbero se puso en pausa. */
  perfilId?: string | null
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
   * La última consulta no llegó y lo que se ve es lo de antes.
   *
   * Vaciar la tarjeta sería mentir —diría que no hay nadie en el local
   * cuando lo que pasa es que no pudimos preguntar—, así que se conserva el
   * último dato y se marca. Un dato viejo etiquetado como viejo sigue
   * sirviendo; uno viejo disfrazado de fresco manda al cliente al local.
   */
  desconectado?: boolean

  /**
   * Minutos desde la última consulta que SÍ llegó.
   *
   * «Sin conexión» solo dice que ahora no hay línea; lo que decide si el
   * cliente puede fiarse del número es cuánto hace que se midió. Dos minutos
   * es la misma fila; veinte no se parece en nada.
   */
  desdeMin?: number | null

  /**
   * Todavía no está en ninguna barbería (cuenta recién hecha).
   *
   * No es lo mismo que un local sin sillas activas: ahí hay un local que
   * nombrar y una espera a que lo enciendan. Aquí no hay nada que enseñar, y
   * la tarjeta deja de informar para convertirse en la invitación.
   */
  sinLocal?: boolean

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
  /** Solo con `sinLocal`: la única puerta que tiene una cuenta recién hecha. */
  onAgregarLocal?: () => void
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

  /**
   * EL POSTE ES LA SEÑAL DE QUE LA BARBERÍA ESTÁ ABIERTA, no un adorno de la
   * tarjeta. Girando sobre un local cerrado, sobre uno que todavía no atiende
   * por la app o sobre una cuenta que aún no tiene barbería, dice lo
   * contrario de lo que dice el texto que tiene debajo. Se apaga.
   */
  const conPoste = !p.sinLocal && p.sillas.length > 0 && (abierto || !!p.turno)

  return (
    <View style={[s.card, { backgroundColor: fondo }]}>
      {conPoste && <Pole height={7} radius={0} animado={!llamado} />}

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
            <Text style={s.local} numberOfLines={2}>
              {p.sinLocal ? 'Aún no tienes barbería' : p.negocio?.nombre ?? 'Tu barbería'}
            </Text>
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

/**
 * E16 · MIENTRAS CARGA, LA FORMA DE LO QUE VA A LLEGAR.
 *
 * Un aro girando en medio de la pantalla no promete nada: no dice cuánto
 * falta, no dice qué va a aparecer, y cuando aparece la tarjeta el salto es
 * total. El esqueleto ya tiene el tamaño y el peso de la tarjeta, así que lo
 * que llega la rellena en vez de sustituirla.
 *
 * SIN POSTE, con la tira apagada: el poste es la señal de que la barbería
 * está abierta, y eso todavía no se sabe.
 */
export function TarjetaEsqueleto() {
  return (
    <View style={[s.card, { backgroundColor: COLORS.carbon }]} accessibilityLabel="Cargando tu turno">
      <View style={s.huesoPoste} />
      <View style={s.cuerpo}>
        <View style={[s.hueso, { height: 26, width: '62%' }]} />
        <View style={[s.filete, { backgroundColor: COLORS.carbonDash }]} />
        <View style={[s.hueso, { height: 11, width: '38%' }]} />
        <View style={[s.hueso, { height: 52, width: '45%', marginTop: 14 }]} />
        <View style={[s.hueso, { height: 10, width: '30%', marginTop: 10 }]} />
        <View style={{ flexDirection: 'row', gap: 9, marginTop: 24 }}>
          <View style={[s.hueso, { height: 50, flex: 1 }]} />
          <View style={[s.hueso, { height: 50, flex: 1, opacity: 0.55 }]} />
        </View>
      </View>
    </View>
  )
}

/* ─────────────────────── SIN TURNO · manda el local ─────────────────────── */

function SinTurno(p: Props & { abierto: boolean; libres: number; sinServicio: boolean; motivoComun: string | null }) {
  const soloCitas = soloConCita(p.sillas)
  const nadie = p.abierto && p.delante === 0
  // Qué puertas tiene este local de verdad. `modo` lo manda turno_estado_local
  // con cada silla; si falta, se supone que las dos, porque el silencio nunca
  // puede cerrar una puerta que está abierta.
  const hayFila = p.sillas.some(x => (x.modo ?? 'ambos') !== 'solo_citas')
  const hayAgenda = p.sillas.some(x => (x.modo ?? 'ambos') !== 'solo_fila')

  /**
   * TODA LA FILA EN PAUSA no es lo mismo que el local cerrado, y confundirlos
   * le cuesta la visita a alguien: cerrado significa «vuelve mañana» y pausa
   * significa «vuelve en veinte minutos». La diferencia la marca que haya una
   * hora de vuelta; sin ella no se afirma, se dice que están en pausa y ya.
   */
  //
  // El servidor cuenta el descanso como fila cerrada (`fila_abierta` false,
  // motivo «está en descanso»), y es verdad: en pausa no entra nadie nuevo.
  // Pero para quien mira la tarjeta NO es un cierre: la silla en pausa sigue
  // siendo de la fila. Sin contarla aquí, «todo en pausa» no salía nunca y el
  // cliente leía CERRADO con el barbero a punto de volver.
  const enFila = p.sillas.filter(x => (x.modo ?? 'ambos') !== 'solo_citas'
    && (x.fila_abierta !== false || x.estado === 'descanso'))
  const pausados = enFila.filter(x => x.estado === 'descanso')
  const todoEnPausa = enFila.length > 0 && pausados.length === enFila.length
  const vuelta = pausados.map(x => x.hasta).filter(Boolean).sort()[0] as string | undefined

  /**
   * UN SOLO RÓTULO, Y EL ORDEN IMPORTA: se lee el más grave que sea cierto.
   * «Abierto» encima de un dato de hace diez minutos es peor que no decir
   * nada, y «solo citas» en un local cerrado contesta una pregunta que el
   * cliente no llegó a hacer.
   */
  const rotulo =
    p.sinLocal ? { texto: 'NUEVA', color: COLORS.onCarbonMid }
    : p.desconectado ? { texto: 'SIN CONEXIÓN', color: COLORS.ambarNoche }
    : p.sinServicio ? { texto: 'SIN SERVICIO', color: COLORS.onCarbonMid }
    : todoEnPausa ? { texto: 'EN PAUSA', color: COLORS.ambarNoche }
    : !p.abierto ? { texto: 'CERRADO', color: COLORS.onCarbonMid }
    : soloCitas ? { texto: 'SOLO CITAS', color: COLORS.azulNoche }
    : !hayAgenda ? { texto: 'SOLO FILA', color: COLORS.okNoche }
    : { texto: 'ABIERTO AHORA', color: COLORS.okNoche }

  return (
    <>
      <View style={s.estadoFila}>
        <View style={s.estadoIzq}>
          <PuntoVivo color={rotulo.color} vivo={p.abierto && !p.desconectado} />
          <Text style={[s.estadoT, { color: rotulo.color }]}>{rotulo.texto}</Text>
        </View>
        {(p.abierto || todoEnPausa) && !p.sinServicio && !p.sinLocal && (
          <Text style={s.estadoDer} numberOfLines={1}>
            {p.desconectado
              ? (p.desdeMin != null ? `Datos de hace ${p.desdeMin} min` : 'Último dato conocido')
              : (p.delante === 0 ? 'Nadie esperando' : `${p.delante} esperando`)
                + (p.libres > 0 ? ` · ${p.libres} libre${p.libres === 1 ? '' : 's'}` : '')}
          </Text>
        )}
      </View>

      {/* SIN SERVICIO Y CERRADO NO LLEVAN CIFRA. En su sitio va el motivo, que
          viene del servidor palabra por palabra: es el mismo texto con el que
          rechazaría el turno, así que no hay dos versiones de la verdad. */}
      {p.sinLocal ? (
        /* E18 · No hay local que enseñar, así que la tarjeta deja de informar
           y se convierte en la invitación. Un estado vacío con la forma de un
           dato («0 esperando») haría creer que ya está dentro de algún sitio. */
        <Text style={s.motivo}>
          Entra con el código que te dan en el local y aquí verás tu turno.
        </Text>
      ) : p.sinServicio ? (
        <Text style={s.motivo}>
          Todavía no atienden por la app. Puedes seguir yendo como siempre — y en
          cuanto la activen, aparecerá aquí.
        </Text>
      ) : !p.abierto && !todoEnPausa ? (
        <Text style={s.motivo}>
          {p.motivoComun
            ? p.motivoComun.charAt(0).toUpperCase() + p.motivoComun.slice(1)
            : 'Ninguna silla está tomando gente ahora'}
        </Text>
      ) : (
        <Cifra
          valor={todoEnPausa ? (vuelta ? hora12(vuelta) : '—')
            : soloCitas ? (p.proximoHueco ?? '—')
            : nadie ? '0' : `${p.esperaMin || 0}′`}
          rotulo={todoEnPausa ? (vuelta ? 'VUELVE SOBRE' : 'LA FILA ESTÁ EN PAUSA')
            : soloCitas
              ? (p.proximoHueco
                  ? (p.deTuBarbero ? 'PRÓXIMO CON TU BARBERO' : 'PRÓXIMO HUECO LIBRE')
                  : 'HOY SOLO CON CITA')
              : nadie ? 'ENTRAS DIRECTO' : 'DE ESPERA SI ENTRAS AHORA'}
          // Sin conexión la cifra se apaga: el número sigue siendo el que
          // había, pero ya no se afirma con el color de un dato de ahora.
          color={p.desconectado ? COLORS.onCarbonMid
            : todoEnPausa ? COLORS.ambarNoche
            : nadie ? COLORS.okNoche
            : soloCitas ? COLORS.azulNoche : COLORS.redSoft}
        />
      )}

      {/* Guion y nada más deja al cliente sin saber si es que no hay huecos
          hoy o si la app no pudo preguntar. Se dice. */}
      {soloCitas && !p.proximoHueco && (
        <Text style={s.motivo}>Hoy no quedan huecos. Reserva para otro día.</Text>
      )}

      {!p.sinLocal && p.sillas.length > 0 && <Sillas sillas={p.sillas} />}

      {/* Sin servicio no hay puertas: dos botones que llevan a pantallas
          vacías son peor que ninguno. */}
      {/* LAS DOS PUERTAS SALEN SOLO SI EXISTEN.
          «Reservar» estaba siempre, y en un local donde todos trabajan por
          orden de llegada abría una hoja vacía: el cliente tocaba, leía
          «nadie está tomando reservas» y volvía. Un botón que solo sirve para
          descubrir que no sirve. Y sin servicio no hay ninguna de las dos:
          dos puertas a pantallas vacías son peor que ninguna. */}
      {p.sinLocal && (
        <Pie principal={{ texto: 'Tengo un código', onPress: p.onAgregarLocal }} secundario={null} />
      )}

      {!p.sinLocal && !p.sinServicio && (hayFila || hayAgenda) && (
        <Pie
          // E2 · «Entrar a la fila» con la fila vacía nombra algo que no
          // existe. Si no hay nadie delante no se entra a una fila: se entra.
          // Con todo en pausa no se ofrece: el servidor no deja entrar hasta
          // que alguien vuelva, y un botón que falla es peor que ninguno.
          principal={p.abierto && !todoEnPausa && !soloCitas && hayFila
            ? { texto: nadie && !todoEnPausa ? 'Entrar ya' : 'Entrar a la fila', onPress: p.onFila } : null}
          secundario={hayAgenda ? { texto: p.abierto || todoEnPausa ? 'Reservar cita' : 'Reservar otro día', onPress: p.onAgendar } : null}
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
  // Solo mientras esperas: una vez te llamaron o estás en la silla, la pausa
  // de su fila ya no te afecta — la tuya ya salió.
  const pausado = !p.llamado && !p.enSilla && p.turno?.perfilId
    ? p.sillas.find(x => x.perfil_id === p.turno!.perfilId
        && (x.fila_abierta === false || x.estado === 'descanso')) ?? null
    : null

  // «Voy en camino» avisa al barbero pero NO para el reloj, así que la cifra
  // sigue siendo la misma que cuando te llamaron: lo que te queda para llegar.
  // Ponerle el puesto sería enseñar un número que ya no decide nada —y además
  // vacío, porque el puesto solo se calcula mientras estás en la fila.
  const corriendo = (p.llamado || (enCamino && !llego)) && p.quedanMin != null
  const cifra = corriendo ? `${Math.max(0, p.quedanMin ?? 0)}′`
    : p.enSilla ? 'AHORA'
    : llego ? 'AQUÍ'
    : p.puesto ? ordinal(p.puesto) : '—'
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
        // E12 · Solo cuando de verdad se acaba el tiempo. Late despacio, no
        // parpadea: un destello rápido se lee como un fallo de la pantalla y
        // se mira menos, justo al revés de lo que hace falta aquí.
        latiendo={p.urgente}
      />

      <Text style={s.servicio} numberOfLines={1}>{p.turno?.servicio ?? 'Tu turno'}</Text>
      <Text style={[s.servicioMeta, { color: p.tenue }]} numberOfLines={1}>
        {p.turno?.barbero ?? 'Sin asignar'}
        {p.turno?.precio ? ` · ${p.turno.precio}` : ''}
      </Text>

      {p.urgente && <Text style={s.consecuencia}>Si no llegas, pierdes el turno</Text>}

      {/* TU BARBERO SE FUE UN MOMENTO Y TÚ YA ESTÁS EN LA FILA.
          El miedo es inmediato y es uno solo: «¿perdí mi turno?». Se contesta
          antes de que se pregunte, y se dice lo que se sabe —hasta cuándo— sin
          tocar el puesto: la pausa mueve el reloj, no la fila. */}
      {pausado && (
        <View style={s.pausa}>
          <Ionicons name="pause-circle-outline" size={16} color={COLORS.ambarNoche} />
          <Text style={s.pausaT}>
            Tu barbero está en pausa{pausado.hasta ? ` hasta las ${hora12(pausado.hasta)}` : ''}.
            Tu turno sigue en pie.
          </Text>
        </View>
      )}
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

/**
 * EL PUESTO SE ESCRIBE COMO SE DICE: 1ro, 2do, 3ro.
 *
 * Era `3º`. El indicador ordinal es un volado —se dibuja arriba del todo, por
 * encima incluso de las mayúsculas— y en una cifra de 76 px era lo primero
 * que se salía de la caja. Pero aunque cupiera, en un cartel a ese tamaño el
 * volado se lee como una mota de suciedad en la pantalla, no como parte del
 * número.
 *
 * Y se dice así: nadie en una barbería dice «tercero grado», dice «el tercero».
 * Escribirlo con letras lo pone a la altura de las cifras, que es donde se lee.
 */
export function ordinal(n: number): string {
  const SUF: Record<number, string> = { 1: 'ro', 2: 'do', 3: 'ro', 4: 'to', 7: 'mo', 8: 'vo', 9: 'no' }
  return `${n}${SUF[n] ?? 'to'}`
}

/* ─────────────────────────────── piezas ─────────────────────────────────── */

export function Cifra({ valor, rotulo, color, filete, latiendo }: {
  valor: string; rotulo: string; color: string; filete?: boolean; latiendo?: boolean
}) {
  /**
   * El latido va por `opacity` y con el driver nativo, así que corre en el
   * hilo de la interfaz: si fuera por JavaScript se pararía justo cuando la
   * pantalla está ocupada recargando la fila —que es exactamente el minuto
   * en el que tiene que latir.
   */
  const alfa = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (!latiendo) { alfa.setValue(1); return }
    const ciclo = Animated.loop(Animated.sequence([
      Animated.timing(alfa, { toValue: 0.25, duration: 520, useNativeDriver: true }),
      Animated.timing(alfa, { toValue: 1, duration: 520, useNativeDriver: true }),
    ]))
    ciclo.start()
    return () => { ciclo.stop(); alfa.setValue(1) }
  }, [latiendo, alfa])

  // El sufijo del ordinal se separa para poder empequeñecerlo. Lo demás
  // —«25′», «AHORA», «3:15»— no tiene sufijo y sale entero.
  const m = /^(\d+)(ro|do|to|mo|vo|no)$/.exec(valor)
  const num = m ? m[1] : valor
  const suf = m ? m[2] : ''
  // Se mide lo que se pinta: con el sufijo aparte, «10mo» son dos caracteres
  // de número, no cuatro, y no tiene por qué encogerse como «AHORA».
  const largo = num.length > 3

  return (
    <View style={[s.cifraCaja, filete && s.cifraFilete]}>
      {/* El sufijo va dentro del mismo Text, no al lado: así comparte línea
          base con la cifra. Un Text hermano se alinearía por la caja y el
          «ro» quedaría flotando a media altura del número. */}
      <Animated.Text style={[s.cifra, { color, opacity: alfa }, largo && { fontSize: 46, lineHeight: 50 }]}>
        {num}
        {!!suf && <Text style={[s.cifraSufijo, largo && { fontSize: 22 }]}>{suf}</Text>}
      </Animated.Text>
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
        // El descanso llega como fila cerrada, pero se dice como lo que es:
        // una pausa con hora de vuelta, no un «cerrado» de hasta mañana.
        const pausa = x.estado === 'descanso'
        const cerrada = x.fila_abierta === false && !pausa
        return (
          <View key={x.perfil_id} style={s.chip}>
            <View style={[s.punto, { backgroundColor: cerrada ? COLOR.inactivo : COLOR[x.estado] ?? COLOR.inactivo }]} />
            <Text style={s.chipT} numberOfLines={1}>
              {x.barbero?.split(' ')[0] ?? 'Barbero'}
              <Text style={s.chipD}>
                {cerrada ? (x.modo === 'solo_citas' ? '  solo con cita' : '  cerrado')
                  : pausa ? (x.hasta ? `  vuelve ~${hora12(x.hasta)}` : '  en pausa')
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
  hueso: { backgroundColor: 'rgba(255,255,255,0.11)', marginTop: 12 },
  huesoPoste: { height: 7, backgroundColor: COLORS.carbonDash },
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

  cifraCaja: { marginTop: 6 },
  cifraFilete: { borderLeftWidth: 3, borderLeftColor: COLORS.redSoft, paddingLeft: 12, marginLeft: -15 },
  /**
   * `lineHeight` NUNCA por debajo de `fontSize`. Estaba en 64 con letra de 76:
   * doce píxeles menos que la letra, así que la caja recortaba por arriba y
   * el remate del ordinal —lo que más sube de toda la cifra— quedaba cortado
   * por el filo de la línea. Se veía como un fallo de pintado y era una resta.
   * Anton sube bastante sobre la altura de la x; 1.06 le deja sitio.
   */
  cifra: { fontFamily: FONTS.display, fontSize: 76, lineHeight: 81 },
  cifraSufijo: { fontFamily: FONTS.display, fontSize: 34 },
  cifraRot: { fontFamily: FONTS.bold, fontSize: 10, letterSpacing: 1.6, color: COLORS.onCarbonMid, marginTop: 6 },

  motivo: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.onCarbonMid, marginTop: 12, lineHeight: 20 },
  servicio: { fontFamily: FONTS.bold, fontSize: 16, color: '#fff', marginTop: 14 },
  servicioMeta: { fontFamily: FONTS.medium, fontSize: 12.5, marginTop: 2 },
  consecuencia: { fontFamily: FONTS.bold, fontSize: 13, color: '#fff', marginTop: 10 },
  pausa: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 13,
    borderLeftWidth: 3, borderLeftColor: COLORS.ambarNoche, paddingLeft: 11 },
  pausaT: { flex: 1, fontFamily: FONTS.bold, fontSize: 12.5, color: '#fff', lineHeight: 18 },

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
