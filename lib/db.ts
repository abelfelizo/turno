import { supabase } from './supabase'
import { fechaISOLocal } from './format'

const T = (tabla: string) => `turno_${tabla}`

/** Normaliza un código tecleado a su forma canónica: MAYÚSCULA + guion tras
 * las 3 letras del prefijo. Acepta "dem a2b1", "DEMA2B1", "dem-a2b1" → "DEM-A2B1". */
export function codigoCanonico(entrada: string): string {
  const limpio = (entrada || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  return limpio.length > 3 ? `${limpio.slice(0, 3)}-${limpio.slice(3)}` : limpio
}

// NEGOCIOS
/**
 * Resolver UN código concreto. Antes esto leía turno_negocios directamente y la
 * política de lectura era `using (true)`: cualquier usuario registrado podía
 * listar la tabla entera con los códigos de acceso de todos los locales. Los
 * códigos son privados —solo entras a los que te pasan— así que la tabla queda
 * cerrada a los locales propios y esta consulta pasa por una función que
 * devuelve solo el nombre y la modalidad, nunca el código de vuelta.
 *
 * Se puede preguntar por un código; no se puede listar.
 */
export async function getNegocioPorCodigo(codigo: string) {
  const { data, error } = await supabase.rpc('turno_negocio_por_codigo', { p_codigo: codigoCanonico(codigo) })
  if (error) throw error
  const n = (data && data[0]) || null
  if (!n) throw new Error('No encontramos un local con ese código. Revísalo e intenta de nuevo.')
  return n
}

export async function getNegocioById(id: string) {
  const { data, error } = await supabase.from(T('negocios')).select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

/** Marca/contacto del negocio (dueño). Solo columnas de identidad. */
export async function actualizarNegocio(negocio_id: string, patch: {
  nombre?: string; slogan?: string; direccion?: string
  telefono?: string; instagram?: string; logo_url?: string; color_marca?: string
  // Dónde queda y en qué cobra (migración 80). La zona horaria va con el país
  // porque de ella depende que el servidor sepa si la fila está abierta.
  pais?: string; ciudad?: string; sector?: string; referencia?: string
  moneda?: string; tz?: string
}) {
  const { error } = await supabase.from(T('negocios')).update(patch).eq('id', negocio_id)
  if (error) throw error
}

// ── DUEÑO ─────────────────────────────────────────────────────────
/** Barberos pendientes de aprobación en el negocio. */
export async function getSolicitudesPendientes(negocio_id: string) {
  const { data, error } = await supabase.from(T('perfiles'))
    .select('*, turno_usuarios(nombre, telefono)')
    .eq('negocio_id', negocio_id).eq('aprobado', false).eq('activo', true)
  if (error) throw error
  return data || []
}
export async function aprobarPerfil(perfil_id: string) {
  const { error } = await supabase.from(T('perfiles')).update({ aprobado: true }).eq('id', perfil_id)
  if (error) throw error
}
/**
 * SUSPENDER NO ES ECHAR (migración 81).
 *
 * El dueño para a un empleado unos días sin desvincularlo: no se cancelan sus
 * citas ni se vacía su fila, solo deja de entrarle trabajo y de poder operar.
 * Va por RPC y no por update porque `suspendido` solo lo escribe el dueño: si
 * fuera un campo más del perfil, el suspendido se lo quitaría él mismo.
 */
/** Un perfil concreto, para la ficha que el dueño abre de su empleado. */
export async function getPerfilPorId(perfil_id: string) {
  const { data, error } = await supabase.from(T('perfiles'))
    .select('*, turno_usuarios(nombre, telefono, codigo_barbero, foto_url)')
    .eq('id', perfil_id).maybeSingle()
  if (error) throw error
  return data
}

export async function suspenderBarbero(perfil_id: string, suspender: boolean, motivo?: string) {
  const { error } = await supabase.rpc('turno_suspender_barbero', {
    p_perfil: perfil_id, p_suspender: suspender, p_motivo: motivo ?? null,
  })
  if (error) throw error
}

export async function rechazarPerfil(perfil_id: string) {
  const { error } = await supabase.from(T('perfiles')).update({ activo: false }).eq('id', perfil_id)
  if (error) throw error
}
export async function updateConfiguracion(negocio_id: string, patch: Record<string, any>) {
  const { error } = await supabase.from(T('configuracion_negocio')).update(patch).eq('negocio_id', negocio_id)
  if (error) throw error
}
/** Asientos que cubre el dueño (empleados activos + dueños que atienden). */
export async function getAsientosNegocio(negocio_id: string): Promise<number> {
  const { data, error } = await supabase.rpc('turno_asientos_negocio', { p_negocio: negocio_id })
  if (error) throw error
  return Number(data ?? 0)
}

/** Stats del negocio. Los ingresos son SOLO los propios (empleados + silla del
 * dueño). De los asientos alquilados se devuelve el número de visitas, nunca el
 * dinero: es un negocio independiente que paga por el espacio. */
export async function getEstadisticasNegocio(negocio_id: string) {
  const { data, error } = await supabase.rpc('turno_estadisticas_negocio', { p_negocio: negocio_id })
  if (error) throw error
  const r = (data && data[0]) || ({} as any)
  const propios = Number(r.ingresos_propios ?? 0)
  return {
    ingresosPropios: propios,
    // Conteo, no importe: lo que factura quien renta su asiento no es asunto
    // del dueño. Lo que sí necesita saber es si el asiento se usa.
    visitasRenta: Number(r.visitas_renta ?? 0),
    ingresosTotal: propios,                 // "ingresos del local" = propios
    ingresosHoy: Number(r.ingresos_hoy ?? 0),
    atendidosHoy: Number(r.atendidos_hoy ?? 0),
    totalVisitas: Number(r.total_visitas ?? 0),
    clientesUnicos: Number(r.clientes_unicos ?? 0),
  }
}

export async function getConfiguracion(negocio_id: string) {
  const { data, error } = await supabase.from(T('configuracion_negocio')).select('*').eq('negocio_id', negocio_id).maybeSingle()
  if (error) throw error
  return data
}

// USUARIOS
/** Alta/actualización del usuario autenticado (vía RPC SECURITY DEFINER). */
export async function registrarUsuario(nombre: string, telefono: string, tipo: 'profesional' | 'cliente') {
  const { data, error } = await supabase.rpc('turno_registrar_usuario', {
    p_nombre: nombre, p_telefono: telefono, p_tipo: tipo,
  })
  if (error) throw error
  return data
}

/** Devuelve la fila turno_usuarios del usuario autenticado, o null si aún no se registró. */
export async function getMiUsuario() {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null
  const { data, error } = await supabase.from(T('usuarios')).select('*').eq('auth_id', auth.user.id).maybeSingle()
  if (error) throw error
  return data
}

/** Membresías activas del usuario autenticado (para resolver rol y negocio). */
export async function getMisMembresias(usuario_id: string) {
  const { data, error } = await supabase.from(T('membresias')).select('*').eq('usuario_id', usuario_id).eq('activo', true)
  if (error) throw error
  return data || []
}

export type OpcionPanel = {
  panel: 'cliente' | 'barberia' | 'silla'
  rol: string
  negocio_id: string
  negocio: string
  perfil_id?: string
  aprobado: boolean
}

/** Paneles a los que el usuario puede entrar, para el conmutador.
 * OJO: no es uno por membresía. Un dueño que atiende tiene UNA membresía
 * (`dueno`) pero DOS paneles: la barbería y su propia silla. */
export async function getMisRoles(usuario_id: string): Promise<OpcionPanel[]> {
  const [mems, perfs] = await Promise.all([
    supabase.from(T('membresias')).select('rol, negocio_id, turno_negocios(nombre)').eq('usuario_id', usuario_id).eq('activo', true),
    supabase.from(T('perfiles')).select('id, negocio_id, aprobado').eq('usuario_id', usuario_id).eq('activo', true),
  ])
  if (mems.error) throw mems.error
  const perfilDe = new Map<string, any>()
  for (const p of (perfs.data ?? []) as any[]) perfilDe.set(p.negocio_id, p)

  const out: OpcionPanel[] = []
  for (const m of (mems.data ?? []) as any[]) {
    const perfil = perfilDe.get(m.negocio_id)
    const base = {
      rol: m.rol as string,
      negocio_id: m.negocio_id as string,
      negocio: (m as any).turno_negocios?.nombre ?? 'Local',
      perfil_id: perfil?.id as string | undefined,
      aprobado: perfil ? !!perfil.aprobado : true,
    }
    if (m.rol === 'cliente') { out.push({ ...base, panel: 'cliente' }); continue }
    if (m.rol === 'dueno') {
      out.push({ ...base, panel: 'barberia' })
      // El dueño-barbero también entra a su silla (servicios, horarios, agenda).
      if (perfil) out.push({ ...base, panel: 'silla' })
      continue
    }
    if (perfil) out.push({ ...base, panel: 'silla' })
  }
  return out
}

/** Dueños de un local, para avisarles. Cualquier miembro puede leerlo: la
 *  política de membresías ya limita a los negocios propios. */
export async function getDuenosNegocio(negocio_id: string): Promise<string[]> {
  const { data, error } = await supabase.from(T('membresias')).select('usuario_id')
    .eq('negocio_id', negocio_id).eq('rol', 'dueno').eq('activo', true)
  if (error) throw error
  return (data ?? []).map((m: any) => m.usuario_id)
}

/** Barberías donde el usuario es cliente (para el selector de local). */
export async function getMisNegociosCliente(usuario_id: string) {
  const { data, error } = await supabase.from(T('membresias'))
    .select('negocio_id, turno_negocios(nombre)')
    .eq('usuario_id', usuario_id).eq('activo', true).eq('rol', 'cliente')
  if (error) throw error
  return (data || []).map((m: any) => ({ negocio_id: m.negocio_id, nombre: m.turno_negocios?.nombre ?? 'Barbería' }))
}

export async function getUsuario(id: string) {
  const { data, error } = await supabase.from(T('usuarios')).select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

// ONBOARDING (RPC atómicos)
export async function crearNegocio(p: {
  nombre_negocio: string; tipo: 'espacios_rentados' | 'empleados'; moneda: string
  atiende: boolean; tipo_servicio: 'barbero' | 'manicuri_pedicuri'
  nombre_dueno: string; telefono: string
  anticipacion?: number; ventana?: number; gracia?: number
  puntos_activos?: boolean; puntos_por_visita?: number; visitas_gratis?: number
  asignacion_dueno?: boolean; doble_servicio?: boolean
}) {
  const { data, error } = await supabase.rpc('turno_crear_negocio', {
    p_nombre_negocio: p.nombre_negocio, p_tipo: p.tipo, p_moneda: p.moneda,
    p_atiende: p.atiende, p_tipo_servicio: p.tipo_servicio,
    p_nombre_dueno: p.nombre_dueno, p_telefono: p.telefono,
    p_anticipacion: p.anticipacion ?? 2, p_ventana: p.ventana ?? 10, p_gracia: p.gracia ?? 5,
    p_puntos_activos: p.puntos_activos ?? false, p_puntos_por_visita: p.puntos_por_visita ?? null,
    p_visitas_gratis: p.visitas_gratis ?? null, p_asignacion_dueno: p.asignacion_dueno ?? false,
    p_doble_servicio: p.doble_servicio ?? false,
  })
  if (error) throw error
  return data
}

export async function unirseProfesional(p: {
  codigo: string; tipo_servicio: 'barbero' | 'manicuri_pedicuri'
  rol: 'empleado' | 'barbero_renta'; nombre: string; telefono: string
}) {
  const { data, error } = await supabase.rpc('turno_unirse_profesional', {
    p_codigo: codigoCanonico(p.codigo), p_tipo_servicio: p.tipo_servicio, p_rol: p.rol,
    p_nombre: p.nombre, p_telefono: p.telefono,
  })
  if (error) throw error
  return data
}

export async function unirseCliente(p: { codigo: string; nombre: string; telefono: string }) {
  const { data, error } = await supabase.rpc('turno_unirse_cliente', {
    p_codigo: codigoCanonico(p.codigo), p_nombre: p.nombre, p_telefono: p.telefono,
  })
  if (error) throw error
  return data
}

// PERFILES
/**
 * El rol de una persona EN UN LOCAL. Vive en la membresía, no en el perfil.
 *
 * Existe porque la pantalla del dueño lo recibía por parámetro de navegación, y
 * un parámetro que llega vacío no es "no sé": la pantalla lo tomaba como
 * "empleado" y le ofrecía al dueño editar los servicios de alguien que renta su
 * asiento. Un rol se pregunta, no se pasa de mano en mano.
 */
export async function getRolDePerfil(perfil_id: string): Promise<string | null> {
  const { data: p, error } = await supabase.from(T('perfiles'))
    .select('usuario_id, negocio_id').eq('id', perfil_id).maybeSingle()
  if (error) throw error
  if (!p) return null
  const { data: m, error: e2 } = await supabase.from(T('membresias'))
    .select('rol').eq('usuario_id', (p as any).usuario_id)
    .eq('negocio_id', (p as any).negocio_id).eq('activo', true).maybeSingle()
  if (e2) throw e2
  return (m as any)?.rol ?? null
}

export async function getPerfilesNegocio(negocio_id: string) {
  const { data, error } = await supabase.from(T('perfiles')).select('*, turno_usuarios(nombre, telefono, codigo_barbero, foto_url, bio, especialidad, instagram, whatsapp), turno_servicios(*)').eq('negocio_id', negocio_id).eq('aprobado', true).eq('activo', true)
  if (error) throw error
  // El rol vive en la membresía, no en el perfil, y el dueño lo necesita para
  // saber a quién puede ponerle servicios y horario (empleado) y a quién no
  // (barbero_renta, que es autónomo).
  const { data: mem } = await supabase.from(T('membresias')).select('usuario_id, rol')
    .eq('negocio_id', negocio_id).eq('activo', true)
    .in('rol', ['empleado', 'barbero_renta', 'dueno'])
  const rol: Record<string, string> = {}
  for (const m of (mem ?? []) as any[]) if (!rol[m.usuario_id] || m.rol === 'dueno') rol[m.usuario_id] = m.rol

  // ¿ESTÁ ABIERTA SU FILA AHORA MISMO? (migración 74). No se puede deducir de
  // la fila de turno_perfiles: depende del horario del día, de la hora local
  // del negocio y del modo. La respuesta la da el servidor —el mismo que luego
  // abre o cierra la puerta— para que la pantalla no ofrezca lo que él va a
  // rechazar. Si esta llamada falla, la lista sale igual y sin motivo: perder
  // el letrero no puede dejar al cliente sin ver a sus barberos.
  const { data: filas } = await supabase.rpc('turno_filas_abiertas', { p_negocio: negocio_id })
  const abierta: Record<string, { abierta: boolean; motivo: string | null }> = {}
  for (const f of (filas ?? []) as any[]) abierta[f.perfil_id] = { abierta: f.abierta, motivo: f.motivo }

  return (data || []).map((p: any) => ({
    ...p,
    rol: rol[p.usuario_id] ?? null,
    fila_abierta: abierta[p.id]?.abierta ?? null,
    fila_motivo: abierta[p.id]?.motivo ?? null,
  }))
}

// ── IDENTIDAD DEL BARBERO (nivel persona; sigue al barbero entre locales) ──
/** Actualiza la identidad propia. Texto '' limpia, undefined/null conserva. */
export async function actualizarIdentidadBarbero(patch: {
  foto_url?: string; bio?: string; especialidad?: string; instagram?: string; whatsapp?: string
}) {
  const { error } = await supabase.rpc('turno_actualizar_identidad_barbero', {
    p_foto: patch.foto_url ?? null, p_bio: patch.bio ?? null, p_especialidad: patch.especialidad ?? null,
    p_instagram: patch.instagram ?? null, p_whatsapp: patch.whatsapp ?? null,
  })
  if (error) throw error
}

/** Busca un barbero por su código (campos públicos). */
export async function getBarberoPorCodigo(codigo: string) {
  const { data, error } = await supabase.rpc('turno_barbero_por_codigo', { p_codigo: codigoCanonico(codigo) })
  if (error) throw error
  return (data && data[0]) || null
}

/** Locales donde trabaja un barbero (para que el cliente lo reserve). */
export async function getBarberoNegocios(usuario_id: string) {
  const { data, error } = await supabase.rpc('turno_barbero_negocios', { p_usuario: usuario_id })
  if (error) throw error
  return (data || []).map((x: any) => ({ negocio_id: x.negocio_id, nombre: x.negocio_nombre, perfil_id: x.perfil_id }))
}

export type EstadoBarbero = {
  estado: 'libre' | 'atendiendo' | 'descanso' | 'inactivo'
  /** ¿Puede entrar gente a su fila AHORA? El descanso lo pone en false. */
  acepta: boolean
  /** ¿Se puede reservar con él para más adelante? Un descanso es de hoy, así
   *  que esto sigue en true; solo el inactivo cierra la agenda. */
  /** ¿Se le puede reservar hora? Cierra por 'inactivo' o por modo 'solo_fila'. */
  acepta_citas: boolean
  /** ¿Este barbero TRABAJA por fila? Cierra por 'descanso', 'inactivo' o modo
   *  'solo_citas'. No mira el reloj: su fila no deja de existir de madrugada,
   *  solo está cerrada. El panel del barbero se monta sobre esto. */
  acepta_fila: boolean
  /** ¿Puede alguien entrar a su fila AHORA MISMO? Esto sí mira el horario
   *  (migración 74), y es lo que tiene que apagar el botón del cliente. */
  fila_abierta: boolean
  /** Por qué no, con las MISMAS palabras que daría turno_entrar_a_cola. */
  fila_motivo: string | null
  /** ambos | solo_citas | solo_fila (migración 70). */
  modo: string
  /** Cuándo se sentó el que está en la silla (migración 79). */
  desde: string | null
  /** A qué hora debería quedar libre: inicio + duración del servicio. Es una
   *  estimación, y que quede atrás es la señal de que se está pasando. */
  fin_estimado: string | null
  cliente: string | null
  hasta: string | null
  en_cola: number
}

/** Estado real del barbero: 'atendiendo' se DEDUCE de la silla y los bloqueos,
 *  no de un campo que alguien tenga que acordarse de actualizar. Lo único que
 *  decide el barbero es si acepta clientes. */
export async function getEstadoBarbero(perfil_id: string): Promise<EstadoBarbero | null> {
  const { data, error } = await supabase.rpc('turno_estado_barbero', { p_perfil: perfil_id })
  if (error) throw error
  return ((data && data[0]) ?? null) as EstadoBarbero | null
}

/** El mismo estado para todo el equipo, de una consulta. */
export async function getEstadoLocal(negocio_id: string) {
  const { data, error } = await supabase.rpc('turno_estado_local', { p_negocio: negocio_id })
  if (error) throw error
  return (data ?? []) as (EstadoBarbero & { perfil_id: string; barbero: string; tipo_servicio: string })[]
}

/** Reglas de tiempo propias del barbero autónomo. Pasar null en un campo
 *  significa "uso la del local": no hay un valor mágico, es herencia real. */
export async function guardarReglasBarbero(perfil_id: string, r: {
  anticipacion?: number | null; ventana?: number | null; gracia?: number | null; umbral?: number | null
}) {
  const { error } = await supabase.rpc('turno_guardar_reglas_barbero', {
    p_perfil: perfil_id,
    p_anticipacion: r.anticipacion ?? null,
    p_ventana: r.ventana ?? null,
    p_gracia: r.gracia ?? null,
    p_umbral: r.umbral ?? null,
  })
  if (error) throw error
}

/** El dueño cambia la modalidad del LOCAL. Realinea a todo el equipo: dejar
 *  membresías con la modalidad vieja sería peor que no cambiar nada. */
export async function cambiarTipoNegocio(negocio_id: string, tipo: 'empleados' | 'espacios_rentados') {
  const { error } = await supabase.rpc('turno_cambiar_tipo_negocio', { p_negocio: negocio_id, p_tipo: tipo })
  if (error) throw error
}

/** El dueño cambia la modalidad de una persona de su equipo (local mixto:
 *  barbería de empleados que además alquila un asiento). Solo el dueño. */
export async function cambiarModalidad(perfil_id: string, rol: 'empleado' | 'barbero_renta') {
  const { error } = await supabase.rpc('turno_cambiar_modalidad', { p_perfil: perfil_id, p_rol: rol })
  if (error) throw error
}

/** El cliente se suma a un local para poder reservar allí. */
export async function seguirBarberoEnNegocio(negocio_id: string) {
  const { error } = await supabase.rpc('turno_agregar_negocio_cliente', { p_negocio: negocio_id })
  if (error) throw error
}

export async function getMiPerfil(usuario_id: string, negocio_id: string) {
  const { data, error } = await supabase.from(T('perfiles')).select('*').eq('usuario_id', usuario_id).eq('negocio_id', negocio_id).maybeSingle()
  if (error) throw error
  return data
}

export async function actualizarEstadoPerfil(perfil_id: string, estado: string) {
  const { error } = await supabase.from(T('perfiles')).update({ estado_actual: estado }).eq('id', perfil_id)
  if (error) throw error
}

/** Identidad pública y reglas del barbero. Solo columnas de personalización. */
export async function actualizarPerfil(perfil_id: string, patch: {
  bio?: string; especialidad?: string; mensaje_bienvenida?: string
  instagram?: string; whatsapp?: string; foto_url?: string
  domicilio_activo?: boolean; limite_cola?: number | null
  puntos_activos?: boolean; puntos_por_visita?: number | null; puntos_meta?: number | null
  revisita_dias?: number
  premio?: string
  /** ambos | solo_citas | solo_fila — por dónde acepta trabajo (migración 70). */
  modo_atencion?: string
}) {
  const { error } = await supabase.from(T('perfiles')).update(patch).eq('id', perfil_id)
  if (error) throw error
}

// SERVICIOS
export async function getServiciosPerfil(perfil_id: string, soloActivos = true) {
  let q = supabase.from(T('servicios')).select('*').eq('perfil_id', perfil_id)
  if (soloActivos) q = q.eq('activo', true)
  const { data, error } = await q.order('nombre')
  if (error) throw error
  return data || []
}
export async function crearServicio(s: { perfil_id: string; nombre: string; duracion_min: number; precio: number }) {
  const { error } = await supabase.from(T('servicios')).insert({ ...s, activo: true })
  if (error) throw error
}
export async function actualizarServicio(id: string, patch: Record<string, any>) {
  const { error } = await supabase.from(T('servicios')).update(patch).eq('id', id)
  if (error) throw error
}

// HORARIOS (barbero)
export async function getHorariosPerfil(perfil_id: string) {
  const { data, error } = await supabase.from(T('horarios')).select('*').eq('perfil_id', perfil_id).order('dia_semana')
  if (error) throw error
  return data || []
}
/**
 * Guarda la jornada de UN día. Es un upsert sobre (perfil_id, dia_semana), no
 * un insert-o-update decidido aquí.
 *
 * Antes elegía según si el objeto en memoria traía `id`: sin id, insertaba. Al
 * abrir un día que todavía no existía no había id, así que dos guardados
 * seguidos —dos toques, o volver a entrar antes de que recargara— creaban DOS
 * filas del mismo día. Pasó de verdad: un perfil del piloto acabó con dos lunes
 * idénticos, la lista enseñaba uno y el resumen contaba dos.
 *
 * Con el índice único de la migración 65, esto es idempotente: abrir el lunes
 * cien veces deja un lunes.
 */
export async function guardarHorario(h: { id?: string; perfil_id: string; dia_semana: number; hora_inicio: string; hora_fin: string; tiempo_entre_clientes?: number; activo: boolean }) {
  const { error } = await supabase.from(T('horarios')).upsert({
    perfil_id: h.perfil_id,
    dia_semana: h.dia_semana,
    hora_inicio: h.hora_inicio,
    hora_fin: h.hora_fin,
    activo: h.activo,
    tiempo_entre_clientes: h.tiempo_entre_clientes ?? 0,
  }, { onConflict: 'perfil_id,dia_semana' })
  if (error) throw error

  // LA JORNADA YA ES SUYA (migración 85). Al aprobarlo se le sembró una de
  // 09:00 a 18:00 para que no naciera con la fila cerrada, y la app lo avisa
  // mientras siga siendo la del sistema. En cuanto toca un día deja de serlo:
  // el aviso tiene que apagarse solo, porque un aviso que no se va se ignora.
  // Si esto falla no se rompe nada — solo se avisaría de más.
  await supabase.from(T('perfiles'))
    .update({ jornada_sembrada: false })
    .eq('id', h.perfil_id).eq('jornada_sembrada', true)
}

// BLOQUEOS (barbero bloquea una franja)
export async function crearBloqueo(b: { perfil_id: string; fecha: string; hora_inicio: string; hora_fin: string; motivo?: string }) {
  const { error } = await supabase.from(T('bloqueos')).insert(b)
  if (error) throw error
}

export async function getBloqueosFecha(perfil_id: string, fecha: string) {
  const { data, error } = await supabase.from(T('bloqueos')).select('*').eq('perfil_id', perfil_id).eq('fecha', fecha).order('hora_inicio')
  if (error) throw error
  return data || []
}

export async function borrarBloqueo(id: string) {
  const { error } = await supabase.from(T('bloqueos')).delete().eq('id', id)
  if (error) throw error
}

/**
 * SIN CITA: entra a la fila como todo el mundo, y ya sentado.
 *
 * Antes esto llamaba a `turno_ocupar_ahora`, que en vez de crear un turno metía
 * un BLOQUEO en la agenda con motivo "Cliente sin cita". Dos consecuencias, una
 * visible y otra cara:
 *   · el bloqueo no se borraba al terminar —liberarAhora solo le acortaba la
 *     hora de fin— así que el rato aparecía luego en "HORAS BLOQUEADAS" como si
 *     el barbero se lo hubiera cogido libre;
 *   · y como las visitas se registran con un trigger sobre turno_cola, ese
 *     corte NUNCA se contaba: ni dinero, ni estadísticas, ni punto de
 *     fidelidad. El barbero cobraba y el sistema no se enteraba.
 * Migración 66.
 */
export async function atenderSinCita(p: { negocio_id: string; perfil_id: string; servicio_id: string; nombre?: string; telefono?: string }) {
  const { data, error } = await supabase.rpc('turno_atender_sin_cita', {
    p_negocio: p.negocio_id, p_perfil: p.perfil_id, p_servicio: p.servicio_id,
    p_nombre: p.nombre ?? null, p_telefono: p.telefono ?? null,
  })
  if (error) throw error
  return data
}

/**
 * Terminó antes de la hora: acorta un bloqueo hasta ahora.
 *
 * Sigue haciendo falta aunque el walk-in ya no cree bloqueos: es para los que el
 * barbero pone a mano ("me voy de 3 a 5") y termina antes. Lo que ya no hace es
 * limpiar nada del sin-cita, porque el sin-cita ya no ensucia la agenda.
 */
export async function liberarAhora(bloqueo_id: string) {
  const { error } = await supabase.rpc('turno_liberar_ahora', { p_bloqueo: bloqueo_id })
  if (error) throw error
}

/** El cliente dice "estoy aquí": apaga la cuenta atrás de la ventana. */
export async function yaLlegue(cola_id: string) {
  const { data, error } = await supabase.rpc('turno_ya_llegue', { p_cola: cola_id })
  if (error) throw error
  return data
}

/** El barbero le da un rato más a quien ya llamó, en vez de marcarlo ausente. */
export async function darMasTiempo(cola_id: string, minutos = 5) {
  const { data, error } = await supabase.rpc('turno_dar_mas_tiempo', { p_cola: cola_id, p_min: minutos })
  if (error) throw error
  return data
}

// WALK-IN heredado (mete al cliente físico en la fila). La app ya no lo usa;
// se conserva porque la base y las pruebas lo siguen cubriendo.
export async function registrarFisico(p: { negocio_id: string; perfil_id: string; servicio_id: string; nombre: string; telefono?: string }) {
  const { data, error } = await supabase.rpc('turno_registrar_fisico', {
    p_negocio: p.negocio_id, p_perfil: p.perfil_id, p_servicio: p.servicio_id, p_nombre: p.nombre, p_telefono: p.telefono ?? '',
  })
  if (error) throw error
  return data
}

// CITAS
/** Citas del barbero en una fecha concreta (ISO local). */
export async function getCitasFecha(perfil_id: string, fecha: string) {
  const { data, error } = await supabase.from(T('citas')).select('*, turno_usuarios!cliente_id(nombre, telefono, no_shows, llegadas_tarde), turno_servicios!servicio_id(nombre, duracion_min, precio)').eq('perfil_id', perfil_id).eq('fecha', fecha).order('hora_inicio')
  if (error) throw error
  return data || []
}

export async function getCitasHoy(perfil_id: string) {
  return getCitasFecha(perfil_id, fechaISOLocal())
}

/**
 * LAS QUE SE QUEDARON SIN CERRAR.
 *
 * Reportado desde el teléfono: "las citas abandonadas de días anteriores no
 * desaparecen ni se gestionan". Cerrarlas solas ya lo hace el cron (y desde la
 * migración 75 vuelve a funcionar), pero eso tarda hasta un día entero, y
 * mientras tanto el barbero no las ve: la agenda enseña UN día, así que lo que
 * quedó abierto el martes solo existe si a alguien se le ocurre volver al
 * martes.
 *
 * Esto las trae todas juntas para poder cerrarlas donde se está mirando: hoy.
 */
export async function getCitasSinCerrar(perfil_id: string) {
  const { data, error } = await supabase.from(T('citas'))
    .select('*, turno_usuarios!cliente_id(nombre, telefono), turno_servicios!servicio_id(nombre, duracion_min, precio)')
    .eq('perfil_id', perfil_id)
    .lt('fecha', fechaISOLocal())
    .in('estado', ['creada', 'confirmada', 'no_confirmada', 'en_camino'])
    .order('fecha', { ascending: false })
    .limit(20)
  if (error) throw error
  return data || []
}

/** Cuántas citas vivas hay por día en un rango → { '2026-09-08': 3, … }.
 *  Alimenta los puntitos del selector de días: sin esto el barbero tiene que
 *  ir día por día a ciegas para saber dónde tiene trabajo. */
export async function getConteoCitasRango(perfil_id: string, desde: string, hasta: string) {
  const { data, error } = await supabase.from(T('citas')).select('fecha')
    .eq('perfil_id', perfil_id).gte('fecha', desde).lte('fecha', hasta)
    .in('estado', ['creada', 'confirmada', 'no_confirmada', 'en_camino'])
  if (error) throw error
  const map: Record<string, number> = {}
  for (const c of (data ?? []) as any[]) map[c.fecha] = (map[c.fecha] ?? 0) + 1
  return map
}

export async function actualizarEstadoCita(cita_id: string, estado: string, extra?: Record<string, any>) {
  const { error } = await supabase.from(T('citas')).update({ estado, ...extra }).eq('id', cita_id)
  if (error) throw error
}

// ── AGENDAR CITAS ────────────────────────────────────────────────
export async function slotsDisponibles(perfil_id: string, fecha: string, servicio_id: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('turno_slots_disponibles', {
    p_perfil: perfil_id, p_fecha: fecha, p_servicio: servicio_id,
  })
  if (error) throw error
  return (data ?? []) as string[]
}

export async function agendarCita(perfil_id: string, servicio_id: string, fecha: string, hora: string) {
  const { data, error } = await supabase.rpc('turno_agendar_cita', {
    p_perfil: perfil_id, p_servicio: servicio_id, p_fecha: fecha, p_hora: hora,
  })
  if (error) throw error
  return data
}

/** R5: reserva N espacios consecutivos con el mismo barbero (grupo). */
export async function agendarGrupo(perfil_id: string, servicio_id: string, fecha: string, hora: string, personas: number) {
  const { data, error } = await supabase.rpc('turno_agendar_grupo', {
    p_perfil: perfil_id, p_servicio: servicio_id, p_fecha: fecha, p_hora: hora, p_personas: personas,
  })
  if (error) throw error
  return data
}

/** Próximas citas del cliente (creada/confirmada/no_confirmada/en_camino). */
export async function getMisCitas(cliente_id: string, negocio_id: string) {
  const hoy = fechaISOLocal()
  const { data, error } = await supabase.from(T('citas'))
    .select('*, turno_servicios!servicio_id(nombre, precio), turno_perfiles!perfil_id(usuario_id, turno_usuarios(nombre))')
    .eq('cliente_id', cliente_id).eq('negocio_id', negocio_id)
    .in('estado', ['creada', 'confirmada', 'no_confirmada', 'en_camino'])
    .gte('fecha', hoy).order('fecha').order('hora_inicio')
  if (error) throw error
  return data || []
}

export async function confirmarCita(cita_id: string) {
  await actualizarEstadoCita(cita_id, 'confirmada', { confirmada_at: new Date().toISOString() })
}
export async function cancelarCita(cita_id: string) {
  await actualizarEstadoCita(cita_id, 'cancelada', { cancelada_by: 'cliente' })
}

// ── RESEÑAS ──────────────────────────────────────────────────────
export async function crearResena(r: { visita_id: string; perfil_id: string; rating: number; comentario?: string }) {
  const cliente = await getMiUsuario()
  const { error } = await supabase.from(T('resenas')).insert({
    visita_id: r.visita_id, perfil_id: r.perfil_id, cliente_id: cliente?.id,
    rating: r.rating, comentario: r.comentario || null,
  })
  if (error) throw error
}

/** visita_ids ya reseñadas por el cliente (para marcar "Calificado"). */
export async function getMisResenas(cliente_id: string): Promise<string[]> {
  const { data, error } = await supabase.from(T('resenas')).select('visita_id').eq('cliente_id', cliente_id)
  if (error) throw error
  return (data ?? []).map((x: any) => x.visita_id)
}

/** Rating por barbero del negocio → { [perfil_id]: { promedio, total } }. */
export async function getRatingsNegocio(negocio_id: string) {
  const { data, error } = await supabase.rpc('turno_ratings_negocio', { p_negocio: negocio_id })
  if (error) throw error
  const map: Record<string, { promedio: number; total: number }> = {}
  for (const r of (data ?? []) as any[]) map[r.perfil_id] = { promedio: Number(r.promedio), total: Number(r.total) }
  return map
}

export type ResumenResenas = {
  promedio: number; total: number
  cinco: number; cuatro: number; tres: number; dos: number; una: number
}

/** Promedio y reparto de estrellas de un barbero (migración 82). */
export async function getResumenResenas(perfil_id: string): Promise<ResumenResenas | null> {
  const { data, error } = await supabase.rpc('turno_resumen_resenas', { p_perfil: perfil_id })
  if (error) throw error
  const r = (data && data[0]) || null
  if (!r) return null
  return {
    promedio: Number(r.promedio ?? 0), total: Number(r.total ?? 0),
    cinco: Number(r.cinco ?? 0), cuatro: Number(r.cuatro ?? 0), tres: Number(r.tres ?? 0),
    dos: Number(r.dos ?? 0), una: Number(r.una ?? 0),
  }
}

/** Las reseñas con su comentario, que hasta ahora no se leían en ninguna parte. */
export async function getResenasDe(perfil_id: string, limite = 20) {
  const { data, error } = await supabase.rpc('turno_resenas_de', { p_perfil: perfil_id, p_limite: limite })
  if (error) throw error
  return data || []
}

export async function crearCita(cita: {
  perfil_id: string; cliente_id: string; negocio_id: string
  servicio_id: string; fecha: string; hora_inicio: string; hora_fin: string
}) {
  const { data, error } = await supabase.from(T('citas')).insert({ ...cita, estado: 'creada' }).select().single()
  if (error) throw error
  return data
}

// COLA
export async function getColaActiva(negocio_id: string, perfil_id?: string) {
  // El nombre del BARBERO asignado viaja con cada turno. Sin él, las dos
  // pantallas del dueño que lo enseñan —la cola del panel y "Cola del local"—
  // escribían "Sin asignar" en todas las filas, incluidas las que sí tenían
  // barbero: leían turno_perfiles y nadie lo estaba trayendo.
  let query = supabase.from(T('cola')).select('*, turno_usuarios(nombre, telefono), turno_servicios(nombre, duracion_min), turno_perfiles(usuario_id, turno_usuarios(nombre))').eq('negocio_id', negocio_id).in('estado', ['en_fila','llamado','en_camino','atendiendo']).order('prioridad').order('posicion')
  if (perfil_id) query = query.eq('perfil_id', perfil_id)
  const { data, error } = await query
  if (error) throw error
  return (data || []).sort(ordenDeAtencion)
}

/**
 * EL ORDEN EN QUE SE ATIENDE, que no es el orden de (prioridad, posicion).
 *
 * Reportado desde el panel del dueño: "arriba aparece el dos y el 1 abajo, que
 * realmente es el que va arriba". Con un walk-in en la silla pasa siempre: el
 * walk-in entra con prioridad 3 —la de quien llega sin avisar— y el cliente
 * digital con prioridad 2, así que ordenando por prioridad el que ESTÁ SIENDO
 * ATENDIDO cae al fondo de la lista y el que espera sale primero.
 *
 * La prioridad decide a quién se LLAMA antes, no quién está delante ahora
 * mismo. Quien ya está en la silla, o va en camino, va primero porque ya le
 * tocó; después la fila, y esa sí por prioridad y orden de llegada.
 */
const RANGO_ESTADO: Record<string, number> = { atendiendo: 0, en_camino: 1, llamado: 1, en_fila: 2 }
export function ordenDeAtencion(a: any, b: any) {
  const ra = RANGO_ESTADO[a?.estado] ?? 3
  const rb = RANGO_ESTADO[b?.estado] ?? 3
  if (ra !== rb) return ra - rb
  if ((a?.prioridad ?? 9) !== (b?.prioridad ?? 9)) return (a?.prioridad ?? 9) - (b?.prioridad ?? 9)
  return (a?.posicion ?? 0) - (b?.posicion ?? 0)
}

/** Entrar a la cola (RPC transaccional: posición atómica + anti-duplicado caso 18). */
export async function entrarACola(p: {
  negocio_id: string; servicio_id: string
  tipo_cola?: 'digital' | 'fisica'; perfil_id?: string
}) {
  const { data, error } = await supabase.rpc('turno_entrar_a_cola', {
    p_negocio: p.negocio_id, p_servicio: p.servicio_id,
    p_tipo_cola: p.tipo_cola ?? 'digital', p_perfil: p.perfil_id ?? null,
  })
  if (error) throw error
  return data
}

/** Llamar al siguiente (RPC: sin condición de carrera, respeta cita confirmada). */
export async function llamarSiguiente(negocio_id: string, perfil_id?: string) {
  const { data, error } = await supabase.rpc('turno_llamar_siguiente', {
    p_negocio: negocio_id, p_perfil: perfil_id ?? null,
  })
  if (error) throw error
  return data // fila de cola llamada, o null si no hay
}

/** Cliente confirma "voy en camino" (caso 6). Gating R2 lo valida el servidor. */
export async function confirmarCamino(cola_id: string) {
  const { data, error } = await supabase.rpc('turno_confirmar_camino', { p_cola: cola_id })
  if (error) throw error
  return data
}

/** R2: ¿ya puede confirmar "voy en camino"? (llamado, o <= umbral delante). */
export async function puedeConfirmar(cola_id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('turno_puede_confirmar', { p_cola: cola_id })
  if (error) throw error
  return !!data
}

/** El barbero marca que empezó el corte (el cliente pasa a la silla). */
export async function iniciarAtencion(cola_id: string) {
  const { data, error } = await supabase.rpc('turno_iniciar_atencion', { p_cola: cola_id })
  if (error) throw error
  return data
}

// ── GESTIÓN DE LA FILA (el barbero corrige la realidad) ──────────
/** Sube (-1) o baja (+1) un puesto en la fila. */
export async function moverEnCola(cola_id: string, delta: -1 | 1) {
  const { error } = await supabase.rpc('turno_mover_en_cola', { p_cola: cola_id, p_delta: delta })
  if (error) throw error
}

/** Llama a alguien concreto, saltando el orden. */
export async function llamarA(cola_id: string) {
  const { data, error } = await supabase.rpc('turno_llamar_a', { p_cola: cola_id })
  if (error) throw error
  return data
}

/** Lo saca de la fila (se fue, no llegó, se equivocó de silla). */
/**
 * "No está." El que no llega pierde el turno, y el siguiente entra sin haberse
 * saltado a nadie — que es la diferencia entre esto y adelantar a dedo.
 *
 * El motor ya expiraba a los ausentes solos, pero tarda la ventana de llegada
 * entera POR CADA UNO: con dos seguidos son veinte minutos de silla parada. El
 * barbero está mirando el local y ve en un segundo lo que el reloj tarda diez en
 * confirmar.
 *
 * La base exige haberlo llamado antes y que sea el turno que toca; sin esas dos
 * condiciones esto sería la puerta trasera de la regla de orden.
 */
export async function marcarNoEsta(cola_id: string) {
  const { data, error } = await supabase.rpc('turno_no_esta', { p_cola: cola_id })
  if (error) throw error
  return data
}

/**
 * El hueco del que no llegó lo ocupa alguien que SÍ está en el local.
 *
 * No es adelantar: el sustituto hereda el sitio exacto del ausente y NADIE por
 * detrás se mueve. Quien venía después conserva su posición y su ETA — probado:
 * Pedro sigue en el puesto 2 con sus 40 minutos antes y después.
 *
 * Existe porque la alternativa era marcar ausente al siguiente de la fila para
 * llegar al walk-in, y eso castiga a quien no ha faltado a nada: se le dijo que
 * viniera en 40 minutos y la fila corrió más rápido de lo prometido.
 *
 * Solo puede sustituir alguien de la fila física: esa la crea el barbero con la
 * persona delante. Un turno pedido desde el teléfono no prueba dónde está quien
 * lo pidió, que es justo lo que aquí importa.
 */
export async function sustituirAusente(ausente_id: string, sustituto_id: string) {
  const { data, error } = await supabase.rpc('turno_sustituir_ausente', {
    p_ausente: ausente_id, p_sustituto: sustituto_id,
  })
  if (error) throw error
  return data
}

/**
 * Quién se ha visto afectado por un cambio en la fila y hay que avisar.
 *
 * La misma llamada devuelve Y marca: si solo devolviera, un fallo al mandar el
 * push dejaría al cliente sin aviso o —peor— lo mandaría dos veces en la
 * siguiente consulta.
 *
 * El envío se hace desde aquí y no desde la base porque este proyecto de
 * Supabase no tiene pg_net: Postgres no puede hacer llamadas HTTP.
 */
export async function avisosDeEspera(negocio_id: string, umbral_min = 5) {
  const { data, error } = await supabase.rpc('turno_avisos_de_espera', {
    p_negocio: negocio_id, p_umbral_min: umbral_min,
  })
  if (error) throw error
  return (data || []) as { cola_id: string; cliente_id: string; nombre: string; minutos: number; se_adelanto: boolean }[]
}

export async function sacarDeCola(cola_id: string) {
  const { error } = await supabase.rpc('turno_sacar_de_cola', { p_cola: cola_id })
  if (error) throw error
}

/** Deshace un llamado: vuelve a esperar sin perder su puesto. */
export async function devolverAFila(cola_id: string) {
  const { data, error } = await supabase.rpc('turno_devolver_a_fila', { p_cola: cola_id })
  if (error) throw error
  return data
}

/** Corrige el servicio de un turno ya en la fila. */
export async function cambiarServicioCola(cola_id: string, servicio_id: string) {
  const { data, error } = await supabase.rpc('turno_cambiar_servicio', { p_cola: cola_id, p_servicio: servicio_id })
  if (error) throw error
  return data
}

/** ETA en minutos para un turno en cola (caso 10). */
export async function etaCola(cola_id: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('turno_eta', { p_cola: cola_id })
  if (error) throw error
  return data
}

export async function actualizarEstadoCola(cola_id: string, estado: string, extra?: Record<string, any>) {
  const { error } = await supabase.from(T('cola')).update({ estado, ...extra }).eq('id', cola_id)
  if (error) throw error
}

/** Turno activo del cliente en un negocio (o null). Incluye servicio y barbero. */
export async function getMiTurnoActivo(cliente_id: string, negocio_id: string) {
  const { data, error } = await supabase.from(T('cola'))
    .select('*, turno_servicios(nombre, duracion_min, precio), turno_perfiles(turno_usuarios(nombre))')
    .eq('cliente_id', cliente_id).eq('negocio_id', negocio_id)
    .in('estado', ['en_fila', 'llamado', 'en_camino', 'atendiendo'])
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data
}

/** Todos los turnos activos del cliente (uno por tipo de servicio, R1). */
export async function getMisTurnosActivos(cliente_id: string, negocio_id: string) {
  const { data, error } = await supabase.from(T('cola'))
    .select('*, turno_servicios(nombre, duracion_min, precio), turno_perfiles(turno_usuarios(nombre))')
    .eq('cliente_id', cliente_id).eq('negocio_id', negocio_id)
    .in('estado', ['en_fila', 'llamado', 'en_camino', 'atendiendo'])
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

/** Último turno del cliente si terminó en expirado (R9), para avisarle. */
export async function getTurnoExpirado(cliente_id: string, negocio_id: string) {
  const { data, error } = await supabase.from(T('cola'))
    .select('id, estado, expira_at, turno_servicios(nombre), turno_perfiles(turno_usuarios(nombre))')
    .eq('cliente_id', cliente_id).eq('negocio_id', negocio_id).eq('estado', 'expirado')
    .order('expira_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  // Solo relevante si expiró hace poco (última hora)
  if (data?.expira_at && Date.now() - new Date(data.expira_at).getTime() < 3600_000) return data
  return null
}

/**
 * QUÉ PUESTO OCUPA EN LA FILA (migración 78).
 *
 * No es `turno_cola.posicion`. Esa columna es el CONTADOR DE ENTRADA —
 * max(posicion)+1 sobre todo lo activo, incluido quien ya está en la silla— y
 * la pantalla la enseñaba tal cual: con un walk-in sentado, el siguiente en
 * llegar leía "posición 2" aunque delante no tuviera a nadie esperando.
 *
 * El puesto se cuenta contra los que ESPERAN y dentro de su propia cola. 0 es
 * "ya te toca".
 */
export async function getPuesto(cola_id: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('turno_puesto', { p_cola: cola_id })
  if (error) throw error
  return data == null ? null : Number(data)
}

/**
 * MI BARBERO (migración 83).
 *
 * Nadie dice "voy a cortarme", dice "voy donde Abel". Marcarlo hace dos cosas:
 * queda preseleccionado al reservar, y "cualquiera disponible" intenta ponerte
 * con él cuando puede atender. No da prioridad ninguna en la fila: decide QUIÉN
 * te atiende, no CUÁNDO.
 */
export async function marcarPreferido(negocio_id: string, perfil_id: string | null) {
  const { error } = await supabase.rpc('turno_marcar_preferido', { p_negocio: negocio_id, p_perfil: perfil_id })
  if (error) throw error
}

export async function getMiPreferido(negocio_id: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('turno_mi_preferido', { p_negocio: negocio_id })
  if (error) throw error
  return (data as string) ?? null
}

/** Resumen de la fila antes de entrar (R3): personas delante y espera estimada. */
export async function getResumenFila(negocio_id: string, perfil_id?: string): Promise<{ delante: number; espera_min: number }> {
  const { data, error } = await supabase.rpc('turno_resumen_fila', { p_negocio: negocio_id, p_perfil: perfil_id ?? null })
  if (error) throw error
  const r = (data && data[0]) || { delante: 0, espera_min: 0 }
  return { delante: Number(r.delante ?? 0), espera_min: Number(r.espera_min ?? 0) }
}

/** Cliente abandona la cola (caso 17). */
export async function salirDeCola(cola_id: string) {
  await actualizarEstadoCola(cola_id, 'abandonado')
}

// PREFERENCIAS
export async function getPreferenciasCliente(usuario_id: string, negocio_id: string) {
  const { data } = await supabase.from(T('preferencias_cliente')).select('*').eq('usuario_id', usuario_id).eq('negocio_id', negocio_id).maybeSingle()
  return data
}

export async function guardarPreferencias(prefs: Record<string, any>) {
  const { error } = await supabase.from(T('preferencias_cliente')).upsert(prefs, { onConflict: 'usuario_id,negocio_id' })
  if (error) throw error
}

// HISTORIAL
export async function getHistorialCliente(cliente_id: string, negocio_id: string) {
  const { data, error } = await supabase.from(T('historial_visitas')).select('*, turno_servicios(nombre, precio), turno_perfiles(turno_usuarios(nombre))').eq('cliente_id', cliente_id).eq('negocio_id', negocio_id).order('fecha', { ascending: false })
  if (error) throw error
  return data || []
}

/** Clientes únicos que ha atendido el barbero, con conteo y total. */
export async function getClientesBarbero(perfil_id: string) {
  const { data, error } = await supabase.from(T('historial_visitas'))
    .select('cliente_id, fecha, precio_cobrado, turno_usuarios(nombre, telefono)')
    .eq('perfil_id', perfil_id).order('fecha', { ascending: false })
  if (error) throw error
  const map = new Map<string, any>()
  for (const v of (data || []) as any[]) {
    if (!map.has(v.cliente_id)) map.set(v.cliente_id, { cliente_id: v.cliente_id, nombre: v.turno_usuarios?.nombre ?? 'Cliente', telefono: v.turno_usuarios?.telefono, visitas: 0, total: 0, ultima: v.fecha })
    const c = map.get(v.cliente_id); c.visitas++; c.total += Number(v.precio_cobrado || 0)
  }
  return Array.from(map.values())
}

// ── DATOS QUE SIGUEN AL BARBERO (agregados por persona, todos sus locales) ──
export async function getMisEstadisticas() {
  const [agg, vis] = await Promise.all([
    supabase.rpc('turno_mis_estadisticas'),
    supabase.rpc('turno_mis_visitas', { p_limit: 20 }),
  ])
  if (agg.error) throw agg.error
  if (vis.error) throw vis.error
  const a = (agg.data && agg.data[0]) || { total_ingresos: 0, clientes_unicos: 0, total_visitas: 0 }
  return {
    totalIngresos: Number(a.total_ingresos || 0),
    clientesUnicos: Number(a.clientes_unicos || 0),
    totalVisitas: Number(a.total_visitas || 0),
    visitas: (vis.data || []).map((v: any) => ({ fecha: v.fecha, origen: v.origen, precio_cobrado: v.precio_cobrado, turno_servicios: { nombre: v.servicio } })),
  }
}

/**
 * Todos los que se UNIERON al local, no solo los que ya vinieron.
 *
 * La versión anterior (turno_mis_clientes) se construía entera desde el historial
 * de visitas, así que
 * alguien que entró con el código y todavía no ha aparecido era invisible en la
 * app — y son justo los que más falta hace ver: se apuntaron y nadie les ha
 * dicho nada. En la base del piloto la diferencia era 2 frente a 3.
 *
 * Las visitas que trae son las TUYAS, no las del local: en una barbería de
 * asientos alquilados cada barbero tiene su clientela, y mezclarlas le daría a
 * uno los números del otro. La lista de personas es del local; los números son
 * tuyos.
 */
export async function getClientesDelLocal(negocio_id: string) {
  const { data, error } = await supabase.rpc('turno_clientes_del_local', { p_negocio: negocio_id })
  if (error) throw error
  return (data || []).map((c: any) => ({
    cliente_id: c.cliente_id, nombre: c.nombre, telefono: c.telefono,
    visitas: Number(c.visitas), total: Number(c.total), ultima: c.ultima, desde: c.desde,
  }))
}

// Notas privadas a nivel persona (siguen al barbero entre locales).
export async function getNotaBarbero(usuario_barbero_id: string, cliente_id: string) {
  const { data } = await supabase.from(T('notas_barbero')).select('nota').eq('usuario_barbero_id', usuario_barbero_id).eq('cliente_id', cliente_id).maybeSingle()
  return data?.nota || ''
}
export async function guardarNotaBarbero(usuario_barbero_id: string, cliente_id: string, nota: string) {
  if (!usuario_barbero_id || !cliente_id) throw new Error('falta saber de quién es la nota')
  const { error } = await supabase.from(T('notas_barbero')).upsert({ usuario_barbero_id, cliente_id, nota }, { onConflict: 'usuario_barbero_id,cliente_id' })
  if (error) throw error
}

/** Todas las notas de este barbero de una vez, para marcar la lista. Una nota
 *  guardada que no se ve en ningún sitio es indistinguible de una que no se
 *  guardó: esto es lo que hace visible que quedó escrita. */
export async function getNotasBarbero(usuario_barbero_id: string) {
  const { data, error } = await supabase.from(T('notas_barbero')).select('cliente_id, nota').eq('usuario_barbero_id', usuario_barbero_id)
  if (error) throw error
  const map: Record<string, string> = {}
  for (const n of (data ?? []) as any[]) if (n.nota) map[n.cliente_id] = n.nota
  return map
}

export async function getEstadisticasBarbero(perfil_id: string) {
  const { data, error } = await supabase.from(T('historial_visitas')).select('precio_cobrado, origen, fecha, cliente_id, turno_servicios(nombre)').eq('perfil_id', perfil_id)
  if (error) throw error
  const visitas = data || []
  const totalIngresos = visitas.reduce((s, v) => s + (v.precio_cobrado || 0), 0)
  const clientesUnicos = new Set(visitas.map(v => v.cliente_id)).size
  return { totalIngresos, clientesUnicos, totalVisitas: visitas.length, visitas }
}

// NOTAS PRIVADAS
export async function getNotaPrivada(perfil_id: string, cliente_id: string) {
  const { data } = await supabase.from(T('notas_privadas')).select('nota').eq('perfil_id', perfil_id).eq('cliente_id', cliente_id).maybeSingle()
  return data?.nota || ''
}

export async function guardarNotaPrivada(perfil_id: string, cliente_id: string, nota: string) {
  const { error } = await supabase.from(T('notas_privadas')).upsert({ perfil_id, cliente_id, nota }, { onConflict: 'perfil_id,cliente_id' })
  if (error) throw error
}

// PUNTOS
export type Tarjeta = {
  perfil_id: string | null
  barbero: string | null
  visitas: number
  meta: number
  premio: string
  ambito: 'negocio' | 'perfil'
}

/** Tarjetas de fidelidad del cliente en un local, con la regla ya resuelta.
 *  Puede haber más de una: donde se alquilan asientos, cada barbero lleva su
 *  propio programa, así que el cliente junta recortes por separado con cada uno. */
export async function getMisTarjetas(negocio_id: string): Promise<Tarjeta[]> {
  const { data, error } = await supabase.rpc('turno_mis_tarjetas', { p_negocio: negocio_id })
  if (error) throw error
  return (data ?? []) as Tarjeta[]
}

/** La tarjeta de un cliente concreto, para la ficha del barbero. */
export async function getTarjetaCliente(cliente_id: string, negocio_id: string, perfil_id?: string | null) {
  let q = supabase.from(T('puntos')).select('visitas_totales, visitas_canjeadas, perfil_id')
    .eq('usuario_id', cliente_id).eq('negocio_id', negocio_id)
  q = perfil_id ? q.eq('perfil_id', perfil_id) : q.is('perfil_id', null)
  const { data } = await q.maybeSingle()
  return data
}

/** Regla de fidelidad vigente para un barbero (o para el local si no manda él). */
export async function getFidelidad(negocio_id: string, perfil_id?: string | null) {
  const { data, error } = await supabase.rpc('turno_fidelidad', {
    p_perfil: perfil_id ?? null, p_negocio: negocio_id,
  })
  if (error) throw error
  const r = (data && data[0]) || null
  return r as { activo: boolean; meta: number; premio: string; ambito: string; perfil: string | null } | null
}

// ── F3 · CANJE DE PUNTOS (vales) ──────────────────────────────────────────────
/** Cliente emite un vale al llegar a la meta (descuenta puntos). */
export async function emitirCanje(negocio_id: string, perfil_id?: string | null) {
  const { data, error } = await supabase.rpc('turno_emitir_canje', { p_negocio: negocio_id, p_perfil: perfil_id ?? null })
  if (error) throw error
  return data
}
/** Barbero/dueño aplica el vale al cobrar. */
export async function aplicarCanje(canje_id: string) {
  const { error } = await supabase.rpc('turno_aplicar_canje', { p_canje: canje_id })
  if (error) throw error
}
/** Vales activos (sin usar) del cliente en un negocio. */
export async function getMisCanjesActivos(usuario_id: string, negocio_id: string) {
  const { data, error } = await supabase.from(T('canjes')).select('*')
    .eq('usuario_id', usuario_id).eq('negocio_id', negocio_id).eq('estado', 'vale')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}
/** Vale activo de un cliente (lo ve el barbero/dueño al cobrar). */
export async function getCanjeActivoCliente(cliente_id: string, negocio_id: string) {
  const { data } = await supabase.from(T('canjes')).select('*')
    .eq('usuario_id', cliente_id).eq('negocio_id', negocio_id).eq('estado', 'vale')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data
}

// ── F3 · ASIGNACIÓN POR DUEÑO ─────────────────────────────────────────────────
/** El dueño asigna una entrada de la cola a un barbero concreto. */
export async function asignarCola(cola_id: string, perfil_id: string) {
  const { error } = await supabase.rpc('turno_asignar_cola', { p_cola: cola_id, p_perfil: perfil_id })
  if (error) throw error
}

// ── F3 · R7 CLIENTES POR RECUPERAR ───────────────────────────────────────────
export async function getClientesPorRecuperar(perfil_id: string) {
  const { data, error } = await supabase.rpc('turno_clientes_por_recuperar', { p_perfil: perfil_id })
  if (error) throw error
  return (data || []).map((c: any) => ({ cliente_id: c.cliente_id, nombre: c.nombre, telefono: c.telefono, ultima: c.ultima, dias: Number(c.dias) }))
}

// ── F3 · STATS POR PERÍODO ───────────────────────────────────────────────────
export type StatsPeriodo = { ingresos: number; visitas: number; clientes: number; ticket: number }
function mapPeriodo(data: any): StatsPeriodo {
  const r = (data && data[0]) || {}
  return { ingresos: Number(r.ingresos ?? 0), visitas: Number(r.visitas ?? 0), clientes: Number(r.clientes ?? 0), ticket: Number(r.ticket ?? 0) }
}
export async function getStatsPeriodoNegocio(negocio_id: string, desde: string, hasta: string): Promise<StatsPeriodo> {
  const { data, error } = await supabase.rpc('turno_stats_periodo_negocio', { p_negocio: negocio_id, p_desde: desde, p_hasta: hasta })
  if (error) throw error
  return mapPeriodo(data)
}
export async function getStatsPeriodoPerfil(perfil_id: string, desde: string, hasta: string): Promise<StatsPeriodo> {
  const { data, error } = await supabase.rpc('turno_stats_periodo_perfil', { p_perfil: perfil_id, p_desde: desde, p_hasta: hasta })
  if (error) throw error
  return mapPeriodo(data)
}

// ── CICLO DE VIDA · bajas lógicas (nunca se borra historial) ──────────────────
/** Cliente sale de una barbería (conserva su historial). */
export async function salirLocal(negocio_id: string) {
  const { error } = await supabase.rpc('turno_salir_local', { p_negocio: negocio_id })
  if (error) throw error
}
/** Barbero deja su silla: cancela citas/cola futuras, desactiva perfil y membresía. */
export async function dejarLocal(perfil_id: string) {
  const { error } = await supabase.rpc('turno_dejar_local', { p_perfil: perfil_id })
  if (error) throw error
}
/** Dueño desvincula a un barbero de su local (mismo efecto, iniciado por el negocio). */
export async function desvincularBarbero(perfil_id: string) {
  const { error } = await supabase.rpc('turno_desvincular_barbero', { p_perfil: perfil_id })
  if (error) throw error
}
/** Dueño cierra el local (baja lógica + cancela lo futuro). */
export async function cerrarLocal(negocio_id: string) {
  const { error } = await supabase.rpc('turno_cerrar_local', { p_negocio: negocio_id })
  if (error) throw error
}
/** Eliminar la cuenta (requisito de tiendas): baja lógica + anonimización. */
export async function eliminarCuenta() {
  const { error } = await supabase.rpc('turno_eliminar_cuenta')
  if (error) throw error
}
