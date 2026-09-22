/**
 * MI SILLA: QUÉ ESTÁ PASANDO EN LA SILLA, DICHO EN UN SOLO MODO.
 *
 * La tarjeta de Mi silla enseña UN modo a la vez, el más urgente, en este
 * orden:
 *
 *   alguien sentado › alguien llamado › una cita ahora › (silla sin pagar)
 *   › la pausa › una hora bloqueada › solo citas › fila cerrada › la fila
 *
 * Los veinte están dibujados en el lienzo (tablero «D2B · los 20 modos») y
 * cada uno lleva aquí su código —S1…S20— para poder ir del tablero al código
 * y volver sin adivinar.
 *
 * ES UNA FUNCIÓN PURA a propósito: recibe los datos y devuelve qué pintar,
 * sin tocar la red ni React. Así cada modo se puede comprobar con datos de
 * ejemplo (scripts/probar-silla.mjs) sin un teléfono delante, y la pantalla
 * solo tiene que dibujar lo que se le dice.
 *
 * Dos decisiones que no están en el tablero, y por qué:
 *
 *  · La silla sin pagar (S18) no pasa por delante de quien ya está sentado,
 *    llamado o citado ahora. El servidor deja de mandar gente nueva, pero el
 *    corte que ya está en marcha hay que poder cerrarlo: esconder «Terminar»
 *    detrás de un aviso de pago sería perder ese cobro.
 *  · Sin conexión (S19) no es un modo aparte: es el modo que hubiera, con el
 *    rótulo cambiado, la cifra apagada y los botones sin fuerza. Lo que se ve
 *    es verdad, solo que vieja, y se dice de cuándo es.
 */

// ── lo que entra ────────────────────────────────────────────────────────────

/** Cómo decide el servidor si se puede sentar a alguien sin cita. */
export type ReglaWalkIn = 'nadie_esperando' | 'nadie_presente'

/**
 * EL QUE ENTRA SIN CITA RESPETA AL QUE ESTÁ, NO AL QUE VIENE (migración 118,
 * aplicada el 22 sep). Frena el llamado o en camino, la fila física, el que
 * dijo «ya llegué» y el segundo turno de un doble servicio; quien espera en
 * la app sin haber llegado, no. Es la misma cuenta que hace el servidor, para
 * que el botón y la puerta digan lo mismo.
 *
 * 'nadie_esperando' es la regla vieja (107): se queda solo para las pruebas y
 * por si hubiera que volver atrás (supabase/rollback_118_…sql).
 */
export const REGLA_WALK_IN: ReglaWalkIn = 'nadie_presente'

/** El motivo con el que se marca una pausa con reloj. Es un bloqueo corto
 *  —la doctrina de la 88: los bloqueos solo quitan disponibilidad— y este
 *  texto es lo que lo distingue de un almuerzo o de una hora bloqueada. */
export const MOTIVO_PAUSA = 'Salgo un momento'

export type DatosSilla = {
  /** Hora local de ahora, «HH:MM:SS». La del teléfono: solo decide qué se
   *  pinta; lo que se puede hacer lo decide el servidor. */
  ahora: string
  /** Milisegundos de ahora, para las cuentas atrás. */
  ahoraMs: number
  cola: any[]
  citas: any[]
  bloqueos: any[]
  estado: {
    estado?: string; acepta?: boolean; acepta_citas?: boolean; acepta_fila?: boolean
    fila_abierta?: boolean | null; fila_motivo?: string | null; fin_estimado?: string | null
  } | null
  /** ¿Puede darse trabajo él mismo? (migraciones 107/108). Si no, el local
   *  reparte: no llama de la fila ni sienta a nadie sin cita. */
  captaSolo: boolean
  suscripcion: { al_dia?: boolean | null; quien?: 'silla' | 'local' } | null
  jornada: { hora_inicio: string; hora_fin: string } | null
  /** Hay una jornada viva ahora mismo (puede venir de ayer: migración 113). */
  enJornada: boolean
  desconectado?: boolean
  desdeMin?: number | null
  regla?: ReglaWalkIn
}

// ── lo que sale ─────────────────────────────────────────────────────────────

export type Senal = 'ok' | 'azul' | 'ambar' | 'neutro' | 'blanco' | 'rojo'
export type Accion =
  | 'llamar' | 'sinCita' | 'atendiendo' | 'mas5' | 'noEsta' | 'terminar'
  | 'citaAtendida' | 'citaNoLlego' | 'citaEscribir'
  | 'yaVolvi' | 'mas10' | 'quitarBloqueo' | 'renovar'

export type Boton = {
  texto: string
  accion: Accion
  tipo: 'claro' | 'contorno' | 'rojo' | 'apagado'
  /** Ancho relativo. «Llamar al siguiente» necesita más que «Sin cita»: con
   *  la mitad exacta se partía en dos líneas. */
  peso?: number
}

export type ModoSilla = {
  codigo: string
  estado: string
  senal: Senal
  derecha?: string
  cifra?: string
  cifraSenal?: Senal | 'tenue'
  rotulo?: string
  /** El cuerpo, con un nombre en negrita delante si lo hay. */
  destacado?: string
  cuerpo: string
  botones: Boton[]
  nota?: string
  fondo: 'carbon' | 'rojo'
  poste: boolean
  latiendo?: boolean
}

// ── utilidades ──────────────────────────────────────────────────────────────

/** Las citas que siguen en pie. Mismos cuatro estados que turno_cerrar_citas_viejas. */
export const CITA_ABIERTA = ['creada', 'confirmada', 'no_confirmada', 'en_camino']

const aMin = (hhmm: string) => {
  const [h, m] = String(hhmm).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function hora12(t?: string | null): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const suf = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suf}`
}

/** «3:30», sin AM/PM: en la cifra grande el sufijo sobra y la ensancha. */
export function horaCorta(t?: string | null): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')}`
}

/** Suma minutos a «HH:MM[:SS]» sin salirse del día. */
export function sumarMinutos(hhmm: string, min: number): string {
  const total = Math.max(0, Math.min(23 * 60 + 59, aMin(hhmm) + min))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function nombreDe(q: any): string {
  return q?.turno_usuarios?.nombre ?? 'Cliente'
}

export function primerNombre(q: any): string {
  return nombreDe(q).split(' ')[0]
}

/**
 * ¿ESTÁ EN EL LOCAL? La fila física es la que el barbero registró con la
 * persona delante; de la app, solo quien dijo «ya llegué». Un turno pedido
 * desde el teléfono no prueba que su dueño esté aquí.
 */
export function enElLocal(q: any): boolean {
  return q?.tipo_cola === 'fisica' || !!q?.llego_at
}

// ── la fila, partida como la entiende el barbero ────────────────────────────

export function partirCola(cola: any[]) {
  const llamado = cola.find(c => c.estado === 'llamado' || c.estado === 'en_camino' || c.estado === 'atendiendo') ?? null
  const enCola = cola.filter(c => c.estado === 'en_fila')
  // Doble servicio (migración 114): el segundo turno espera a que acabe el
  // primero en OTRA silla. No se puede llamar, así que no está en la fila de
  // los que se llaman; se enseña aparte y sin puesto.
  const enFila = enCola.filter(c => !c.espera_a_id)
  const enEspera = enCola.filter(c => c.espera_a_id)
  return { llamado, enFila, enEspera, presentes: enFila.filter(enElLocal) }
}

/** ¿Se puede sentar a alguien sin cita ahora? Y si no, por qué. */
export function walkIn(d: DatosSilla): { puede: boolean; porQue?: string } {
  const { llamado, enFila, enEspera, presentes } = partirCola(d.cola)
  if (!d.captaSolo) return { puede: false, porQue: 'Aquí los clientes te los asigna la barbería.' }
  if (llamado) return { puede: false, porQue: 'Ya tienes a alguien llamado o en la silla.' }
  const regla = d.regla ?? REGLA_WALK_IN
  if (regla === 'nadie_presente') {
    // La misma cuenta que la migración 118, para que el letrero y la puerta
    // digan lo mismo: el segundo turno de un doble servicio está en el local,
    // en la otra silla, y va a necesitar esta en cuanto acabe.
    if (enEspera.length > 0) return { puede: false, porQue: `Sin cita, no: ${primerNombre(enEspera[0])} viene de su otro servicio y es el siguiente aquí.` }
    if (presentes.length === 1) return { puede: false, porQue: `Sin cita, no: primero ${primerNombre(presentes[0])}, que espera aquí.` }
    if (presentes.length > 1) return { puede: false, porQue: `Sin cita, no: primero los ${presentes.length} que esperan aquí.` }
    return { puede: true }
  }
  // La regla de hoy del servidor (107) cuenta a TODO el que espera, incluido
  // el segundo turno de un doble servicio. Si aquí no se contara, el botón
  // saldría encendido y el servidor lo rechazaría.
  const esperan = enFila.length + enEspera.length
  // Si solo espera un doble servicio, «llámalo» sería mentira: no se le puede
  // llamar hasta que acabe en la otra silla.
  if (enFila.length === 0 && enEspera.length > 0) {
    return { puede: false, porQue: `Sin cita, no: ${primerNombre(enEspera[0])} viene de su otro servicio y es el siguiente aquí.` }
  }
  if (esperan > 0) {
    return { puede: false, porQue: esperan === 1
      ? 'Sin cita, no: hay 1 esperando. Llámalo, o márcalo ausente si no llegó.'
      : `Sin cita, no: hay ${esperan} esperando. Llama al siguiente, o marca ausente a quien no llegó.` }
  }
  return { puede: true }
}

/** Las citas de hoy que siguen abiertas, en orden. */
export function citasAbiertas(citas: any[]) {
  return citas.filter(c => CITA_ABIERTA.includes(c.estado))
    .sort((a, b) => String(a.hora_inicio).localeCompare(String(b.hora_inicio)))
}

/**
 * LA CITA DE AHORA: desde 15 minutos antes hasta 15 después de su duración.
 * El margen es de PRESENTACIÓN, no una regla: decide cuándo aparece la
 * tarjeta, nada más. Lo que se puede hacer con ella lo deciden las RPC.
 */
export const MARGEN_CITA_MIN = 15
export function citaDeAhora(d: DatosSilla) {
  const ahora = aMin(d.ahora)
  return citasAbiertas(d.citas).find(c => {
    const faltan = aMin(c.hora_inicio) - ahora
    const dura = c.turno_servicios?.duracion_min ?? 30
    return faltan <= MARGEN_CITA_MIN && faltan > -(dura + MARGEN_CITA_MIN)
  }) ?? null
}

/** Las que vienen después de ahora: «lo que queda hoy». */
export function citasQueQuedan(d: DatosSilla) {
  const ahora = aMin(d.ahora)
  const actual = citaDeAhora(d)
  return citasAbiertas(d.citas).filter(c => c.id !== actual?.id && aMin(c.hora_inicio) - ahora > MARGEN_CITA_MIN)
}

/** ¿Cabe este servicio antes de la próxima cita? Es el «si tiene el tiempo». */
export function cabeAntesDeLaCita(d: DatosSilla, duracionMin: number): { cabe: boolean; cita?: any } {
  const prox = citasQueQuedan(d)[0]
  if (!prox) return { cabe: true }
  return { cabe: aMin(d.ahora) + duracionMin <= aMin(prox.hora_inicio), cita: prox }
}

/** La pausa con reloj: su bloqueo de hoy, si lo hay, y en qué punto está. */
export function pausaDe(d: DatosSilla) {
  const ahora = d.ahora.slice(0, 5)
  const pausas = d.bloqueos.filter(b => b.motivo === MOTIVO_PAUSA)
    .sort((a, b) => String(b.hora_inicio).localeCompare(String(a.hora_inicio)))
  const activa = pausas.find(b => String(b.hora_inicio).slice(0, 5) <= ahora && String(b.hora_fin).slice(0, 5) > ahora) ?? null
  const vencida = !activa ? pausas.find(b => String(b.hora_fin).slice(0, 5) <= ahora) ?? null : null
  return { activa, vencida }
}

/** Una hora bloqueada que cubre ahora y no es una pausa (el almuerzo). */
export function bloqueoActual(d: DatosSilla) {
  const ahora = d.ahora.slice(0, 5)
  // Tolerancia de 2 min al inicio: el servidor sella con la hora del local y
  // el reloj del teléfono puede ir unos segundos por detrás.
  const ahoraMas2 = sumarMinutos(ahora, 2)
  return d.bloqueos.find(b => b.motivo !== MOTIVO_PAUSA
    && String(b.hora_inicio).slice(0, 5) <= ahoraMas2 && String(b.hora_fin).slice(0, 5) > ahora) ?? null
}

// ── EL MODO ─────────────────────────────────────────────────────────────────

export function modoDeSilla(d: DatosSilla): ModoSilla {
  const m = elegir(d)
  if (!d.desconectado) return m
  // S19 · Se conserva lo último que se supo y se dice de cuándo es.
  return {
    ...m,
    codigo: m.codigo + '+S19',
    estado: 'SIN CONEXIÓN',
    senal: 'ambar',
    derecha: d.desdeMin != null ? `Datos de hace ${d.desdeMin} min` : 'Último dato conocido',
    cifraSenal: m.cifra ? 'tenue' : m.cifraSenal,
    botones: m.botones.map(b => ({ ...b, tipo: 'apagado' as const })),
    nota: 'Los botones vuelven cuando vuelva la red.',
    latiendo: false,
  }
}

function elegir(d: DatosSilla): ModoSilla {
  const { llamado, enFila } = partirCola(d.cola)
  const base = { fondo: 'carbon' as const, poste: true }
  const daFila = d.estado?.acepta_fila !== false
  const esperando = enFila.length

  // ── ALGUIEN EN LA SILLA · S9 / S10 ────────────────────────────────────────
  if (llamado?.estado === 'atendiendo') {
    const desde = llamado.atendiendo_at ?? llamado.llamado_at
    const lleva = desde ? Math.max(0, Math.floor((d.ahoraMs - new Date(desde).getTime()) / 60000)) : null
    const dura = llamado.turno_servicios?.duracion_min ?? null
    // Lo que queda sale del servidor si lo sabe (fin_estimado); si no, de la
    // duración del servicio. Nunca de un número inventado.
    const fin = d.estado?.fin_estimado ? new Date(d.estado.fin_estimado).getTime()
      : desde && dura ? new Date(desde).getTime() + dura * 60000 : null
    const quedan = fin != null ? Math.ceil((fin - d.ahoraMs) / 60000) : null
    const servicio = llamado.turno_servicios?.nombre ?? 'Servicio'
    const detras = esperando > 0 ? ` · ${esperando} ${esperando === 1 ? 'espera' : 'esperan'} detrás` : ''
    const pasado = quedan != null && quedan < 0
    return {
      ...base, codigo: pasado ? 'S10' : 'S9',
      estado: 'EN LA SILLA', senal: 'azul',
      derecha: esperando ? `${esperando} esperando` : undefined,
      cifra: quedan == null ? undefined : pasado ? `+${-quedan}′` : `${quedan}′`,
      cifraSenal: pasado ? 'rojo' : 'blanco',
      rotulo: pasado ? 'PASADO DEL TIEMPO' : 'TE QUEDAN',
      destacado: nombreDe(llamado),
      cuerpo: ` · ${servicio}${lleva != null ? ` · lleva ${lleva}′` : ''}${pasado ? detras : ''}`,
      botones: [{ texto: 'Terminar', accion: 'terminar', tipo: 'claro' }],
    }
  }

  // ── LLAMASTE A ALGUIEN · S5 / S6 / S7 / S8 ────────────────────────────────
  if (llamado) {
    const quien = primerNombre(llamado).toUpperCase()
    const servicio = llamado.turno_servicios?.nombre ?? 'Servicio'
    const origen = llamado.tipo_cola === 'fisica' ? 'en el local' : 'por la app'
    if (llamado.llego_at) {
      return {
        ...base, codigo: 'S7', estado: 'YA ESTÁ AQUÍ', senal: 'ok',
        cifra: 'AQUÍ', cifraSenal: 'ok', rotulo: 'ESPERANDO EN EL LOCAL',
        destacado: nombreDe(llamado), cuerpo: ` · ${servicio}`,
        botones: [{ texto: 'Atendiendo', accion: 'atendiendo', tipo: 'claro' }],
      }
    }
    const restanteS = llamado.expira_at
      ? Math.max(0, Math.round((new Date(llamado.expira_at).getTime() - d.ahoraMs) / 1000)) : null
    const minutos = restanteS == null ? null : Math.ceil(restanteS / 60)
    if (restanteS === 0) {
      return {
        ...base, codigo: 'S8', fondo: 'rojo', estado: 'SE LE PASÓ EL TIEMPO', senal: 'blanco',
        cifra: '0′', cifraSenal: 'blanco', rotulo: 'PARA LLEGAR',
        destacado: nombreDe(llamado), cuerpo: ' no ha llegado.',
        botones: [
          { texto: 'No está', accion: 'noEsta', tipo: 'claro', peso: 1.6 },
          { texto: '+5', accion: 'mas5', tipo: 'contorno' },
        ],
      }
    }
    const enCamino = llamado.estado === 'en_camino'
    return {
      ...base, codigo: enCamino ? 'S6' : 'S5',
      estado: enCamino ? 'VIENE EN CAMINO' : `LLAMASTE A ${quien}`,
      senal: enCamino ? 'ok' : 'blanco',
      cifra: minutos != null ? `${minutos}′` : undefined, cifraSenal: 'blanco', rotulo: 'PARA LLEGAR',
      destacado: enCamino ? nombreDe(llamado) : undefined,
      cuerpo: enCamino ? ' dijo que va para allá.' : `${servicio} · ${origen}`,
      // El último minuto late: es cuando hay que mirar.
      latiendo: minutos != null && minutos <= 1,
      botones: enCamino
        ? [{ texto: 'Atendiendo', accion: 'atendiendo', tipo: 'claro' }, { texto: 'No está', accion: 'noEsta', tipo: 'contorno' }]
        : [{ texto: 'Atendiendo', accion: 'atendiendo', tipo: 'claro', peso: 1.4 },
           { texto: '+5', accion: 'mas5', tipo: 'contorno', peso: 0.6 },
           { texto: 'No está', accion: 'noEsta', tipo: 'contorno' }],
    }
  }

  // ── LA CITA DE AHORA · S11 / S12 ──────────────────────────────────────────
  const cita = citaDeAhora(d)
  if (cita) {
    const confirmada = cita.estado === 'confirmada' || cita.estado === 'en_camino'
    const botones: Boton[] = [
      { texto: 'Atendida', accion: 'citaAtendida', tipo: 'claro' },
      { texto: 'No llegó', accion: 'citaNoLlego', tipo: 'contorno' },
    ]
    if (cita.turno_usuarios?.telefono) botones.push({ texto: 'Escribir', accion: 'citaEscribir', tipo: 'contorno' })
    return {
      ...base, codigo: confirmada ? 'S11' : 'S12',
      estado: confirmada ? 'CITA · CONFIRMADA' : 'CITA · SIN CONFIRMAR',
      senal: confirmada ? 'azul' : 'ambar',
      cifra: horaCorta(cita.hora_inicio), cifraSenal: 'azul', rotulo: 'CITA DE AHORA',
      destacado: confirmada ? nombreDe(cita) : undefined,
      cuerpo: confirmada ? ` · ${cita.turno_servicios?.nombre ?? 'Servicio'}` : `${nombreDe(cita)} no confirmó. Puede venir igual.`,
      botones,
    }
  }

  // ── S18 · LA SILLA NO ESTÁ PAGADA ─────────────────────────────────────────
  if (d.suscripcion && d.suscripcion.al_dia === false) {
    const suya = d.suscripcion.quien !== 'local'
    return {
      ...base, poste: false, codigo: 'S18', estado: 'NO SALES A LOS CLIENTES', senal: 'rojo',
      cuerpo: suya
        ? 'Tu suscripción venció. Nadie puede pedirte turno ni cita hasta que la renueves.'
        : 'La suscripción de tu barbería venció. Nadie puede pedirte turno ni cita hasta que la renueve.',
      botones: suya ? [{ texto: 'Renovar', accion: 'renovar', tipo: 'rojo' }] : [],
      nota: suya ? undefined : 'La paga tu barbería: díselo a quien la lleva.',
    }
  }

  // ── ESTÁS EN PAUSA · S13 / S14 / S15 ──────────────────────────────────────
  if (d.estado?.estado === 'descanso') {
    const { activa, vencida } = pausaDe(d)
    const aviso = esperando ? `Tus ${esperando} de la fila saben que vuelves. Su turno sigue.` : 'Tu fila está cerrada a los nuevos.'
    if (activa) {
      return {
        ...base, codigo: 'S13', estado: 'EN PAUSA', senal: 'ambar',
        cifra: horaCorta(activa.hora_fin), cifraSenal: 'ambar', rotulo: 'VUELVES',
        cuerpo: aviso, botones: [{ texto: 'Ya volví', accion: 'yaVolvi', tipo: 'rojo' }],
      }
    }
    if (vencida) {
      // NO se reabre sola: metería gente a esperar a quien no ha vuelto.
      return {
        ...base, codigo: 'S15', estado: '¿YA VOLVISTE?', senal: 'ambar',
        cifra: horaCorta(vencida.hora_fin), cifraSenal: 'ambar', rotulo: 'ERA TU HORA',
        cuerpo: 'Tu fila sigue cerrada hasta que vuelvas.',
        botones: [{ texto: 'Ya volví', accion: 'yaVolvi', tipo: 'rojo', peso: 1.4 },
                  { texto: '+10 min', accion: 'mas10', tipo: 'contorno' }],
      }
    }
    return {
      ...base, codigo: 'S14', estado: 'EN PAUSA', senal: 'ambar',
      cuerpo: 'Sin hora de vuelta. Tu fila está cerrada a los nuevos.',
      botones: [{ texto: 'Ya volví', accion: 'yaVolvi', tipo: 'rojo' }],
    }
  }

  // ── S16 · UNA HORA BLOQUEADA AHORA ────────────────────────────────────────
  const bloq = bloqueoActual(d)
  if (bloq) {
    return {
      ...base, codigo: 'S16', estado: 'BLOQUEADO', senal: 'neutro',
      cifra: horaCorta(bloq.hora_fin), cifraSenal: 'blanco', rotulo: 'HASTA',
      cuerpo: `${bloq.motivo ? bloq.motivo + '. ' : ''}La fila sigue guardando el orden.`,
      botones: [{ texto: 'Quitar bloqueo', accion: 'quitarBloqueo', tipo: 'contorno' }],
    }
  }

  const wi = walkIn(d)
  const sinCita = (tipo: Boton['tipo']): Boton[] => d.captaSolo
    ? [{ texto: 'Atender sin cita', accion: 'sinCita', tipo: wi.puede ? tipo : 'apagado' }] : []
  const notaLocal = d.captaSolo ? undefined : 'Aquí llama la barbería: cuando te asignen a alguien, sale aquí.'

  // ── S3 · SOLO CON CITA ────────────────────────────────────────────────────
  if (!daFila) {
    const prox = citasQueQuedan(d)[0]
    return {
      ...base, codigo: 'S3', estado: 'SOLO CITAS', senal: 'azul',
      cifra: prox ? horaCorta(prox.hora_inicio) : undefined, cifraSenal: 'azul',
      rotulo: prox ? 'PRÓXIMA CITA' : undefined,
      cuerpo: prox ? `${nombreDe(prox)} · ${prox.turno_servicios?.nombre ?? 'Servicio'}` : 'No te quedan citas hoy.',
      botones: sinCita('contorno'), nota: wi.puede ? notaLocal : wi.porQue,
    }
  }

  // ── S17 / S4 · FUERA DE HORARIO ───────────────────────────────────────────
  if (!d.enJornada) {
    if (!d.jornada) {
      return {
        ...base, poste: false, codigo: 'S17', estado: 'HOY NO TRABAJAS', senal: 'neutro',
        cuerpo: 'Hoy no tienes jornada. Si vas a trabajar, ábrela desde Agenda.',
        botones: [],
      }
    }
    const antes = d.ahora.slice(0, 5) < String(d.jornada.hora_inicio).slice(0, 5)
    return {
      ...base, poste: false, codigo: 'S4', estado: 'FILA CERRADA', senal: 'neutro',
      cuerpo: antes
        ? `Abres a las ${hora12(d.jornada.hora_inicio)}. Hasta entonces, por la app no te entra nadie.`
        : `Cerraste a las ${hora12(d.jornada.hora_fin)}. Por la app ya no te entra nadie hoy.`,
      botones: sinCita('contorno'), nota: wi.puede ? notaLocal : wi.porQue,
    }
  }
  if (d.estado?.fila_abierta === false) {
    // Cerrada por otro motivo: se dice con las palabras del servidor, que son
    // las mismas con las que rechazaría el turno.
    const motivo = d.estado.fila_motivo ?? 'Tu fila está cerrada'
    return {
      ...base, poste: false, codigo: 'S4', estado: 'FILA CERRADA', senal: 'neutro',
      cuerpo: motivo.charAt(0).toUpperCase() + motivo.slice(1) + '.',
      botones: sinCita('contorno'), nota: wi.puede ? notaLocal : wi.porQue,
    }
  }

  // ── S1 · NADIE ESPERANDO ──────────────────────────────────────────────────
  if (esperando === 0) {
    return {
      ...base, codigo: 'S1', estado: 'LIBRE', senal: 'ok',
      cifra: '0', cifraSenal: 'ok', rotulo: 'ESPERANDO',
      cuerpo: 'Tu fila está abierta. Nadie esperando.',
      botones: sinCita('claro'), nota: wi.puede ? notaLocal : wi.porQue,
    }
  }

  // ── S2 · HAY FILA ─────────────────────────────────────────────────────────
  const sig = enFila[0]
  const presentes = enFila.filter(enElLocal).length
  const espera = sig?.created_at ? Math.max(0, Math.floor((d.ahoraMs - new Date(sig.created_at).getTime()) / 60000)) : null
  const botones: Boton[] = d.captaSolo
    ? [{ texto: 'Llamar al siguiente', accion: 'llamar', tipo: 'claro', peso: 1.6 },
       { texto: 'Sin cita', accion: 'sinCita', tipo: wi.puede ? 'contorno' : 'apagado' }]
    : []
  return {
    ...base, codigo: 'S2', estado: 'LIBRE', senal: 'ok',
    derecha: presentes ? `${presentes} en el local` : undefined,
    cifra: String(esperando), cifraSenal: 'blanco', rotulo: 'ESPERANDO',
    destacado: `Sigue ${nombreDe(sig)}`,
    cuerpo: ` · ${sig?.turno_servicios?.nombre ?? 'Servicio'}${espera != null ? ` · lleva ${espera}′ esperando` : ''}`,
    botones,
    nota: d.captaSolo ? (wi.puede ? undefined : wi.porQue) : notaLocal,
  }
}
