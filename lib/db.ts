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
export async function getNegocioPorCodigo(codigo: string) {
  const { data, error } = await supabase.from(T('negocios')).select('*').eq('codigo_acceso', codigoCanonico(codigo)).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('No encontramos un local con ese código. Revísalo e intenta de nuevo.')
  return data
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

/** Stats del negocio con ingresos propios (empleados + silla del dueño)
 * separados del volumen de rentas (informativo, no es ingreso del dueño). */
export async function getEstadisticasNegocio(negocio_id: string) {
  const { data, error } = await supabase.rpc('turno_estadisticas_negocio', { p_negocio: negocio_id })
  if (error) throw error
  const r = (data && data[0]) || ({} as any)
  const propios = Number(r.ingresos_propios ?? 0)
  return {
    ingresosPropios: propios,
    ingresosRenta: Number(r.ingresos_renta ?? 0),
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
export async function getPerfilesNegocio(negocio_id: string) {
  const { data, error } = await supabase.from(T('perfiles')).select('*, turno_usuarios(nombre, telefono, codigo_barbero, foto_url, bio, especialidad, instagram, whatsapp), turno_servicios(*)').eq('negocio_id', negocio_id).eq('aprobado', true).eq('activo', true)
  if (error) throw error
  return data || []
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
export async function guardarHorario(h: { id?: string; perfil_id: string; dia_semana: number; hora_inicio: string; hora_fin: string; tiempo_entre_clientes?: number; activo: boolean }) {
  if (h.id) {
    const { error } = await supabase.from(T('horarios')).update({ hora_inicio: h.hora_inicio, hora_fin: h.hora_fin, activo: h.activo, tiempo_entre_clientes: h.tiempo_entre_clientes ?? 10 }).eq('id', h.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from(T('horarios')).insert({ perfil_id: h.perfil_id, dia_semana: h.dia_semana, hora_inicio: h.hora_inicio, hora_fin: h.hora_fin, activo: h.activo, tiempo_entre_clientes: h.tiempo_entre_clientes ?? 10 })
    if (error) throw error
  }
}

// BLOQUEOS (barbero bloquea una franja)
export async function crearBloqueo(b: { perfil_id: string; fecha: string; hora_inicio: string; hora_fin: string; motivo?: string }) {
  const { error } = await supabase.from(T('bloqueos')).insert(b)
  if (error) throw error
}

// WALK-IN (cliente físico sin app)
export async function registrarFisico(p: { negocio_id: string; perfil_id: string; servicio_id: string; nombre: string; telefono?: string }) {
  const { data, error } = await supabase.rpc('turno_registrar_fisico', {
    p_negocio: p.negocio_id, p_perfil: p.perfil_id, p_servicio: p.servicio_id, p_nombre: p.nombre, p_telefono: p.telefono ?? '',
  })
  if (error) throw error
  return data
}

// CITAS
export async function getCitasHoy(perfil_id: string) {
  const hoy = fechaISOLocal()
  const { data, error } = await supabase.from(T('citas')).select('*, turno_usuarios!cliente_id(nombre, telefono, no_shows, llegadas_tarde), turno_servicios!servicio_id(nombre, duracion_min, precio)').eq('perfil_id', perfil_id).eq('fecha', hoy).order('hora_inicio')
  if (error) throw error
  return data || []
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
    .select('*, turno_servicios!servicio_id(nombre, precio), turno_perfiles!perfil_id(turno_usuarios(nombre))')
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
  let query = supabase.from(T('cola')).select('*, turno_usuarios(nombre, telefono), turno_servicios(nombre, duracion_min)').eq('negocio_id', negocio_id).in('estado', ['en_fila','llamado','en_camino']).order('prioridad').order('posicion')
  if (perfil_id) query = query.eq('perfil_id', perfil_id)
  const { data, error } = await query
  if (error) throw error
  return data || []
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
    .in('estado', ['en_fila', 'llamado', 'en_camino'])
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data
}

/** Todos los turnos activos del cliente (uno por tipo de servicio, R1). */
export async function getMisTurnosActivos(cliente_id: string, negocio_id: string) {
  const { data, error } = await supabase.from(T('cola'))
    .select('*, turno_servicios(nombre, duracion_min, precio), turno_perfiles(turno_usuarios(nombre))')
    .eq('cliente_id', cliente_id).eq('negocio_id', negocio_id)
    .in('estado', ['en_fila', 'llamado', 'en_camino'])
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

export async function getMisClientes() {
  const { data, error } = await supabase.rpc('turno_mis_clientes')
  if (error) throw error
  return (data || []).map((c: any) => ({ cliente_id: c.cliente_id, nombre: c.nombre, telefono: c.telefono, visitas: Number(c.visitas), total: Number(c.total), ultima: c.ultima }))
}

// Notas privadas a nivel persona (siguen al barbero entre locales).
export async function getNotaBarbero(usuario_barbero_id: string, cliente_id: string) {
  const { data } = await supabase.from(T('notas_barbero')).select('nota').eq('usuario_barbero_id', usuario_barbero_id).eq('cliente_id', cliente_id).maybeSingle()
  return data?.nota || ''
}
export async function guardarNotaBarbero(usuario_barbero_id: string, cliente_id: string, nota: string) {
  const { error } = await supabase.from(T('notas_barbero')).upsert({ usuario_barbero_id, cliente_id, nota }, { onConflict: 'usuario_barbero_id,cliente_id' })
  if (error) throw error
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
export async function getPuntos(usuario_id: string, negocio_id: string) {
  const { data } = await supabase.from(T('puntos')).select('puntos_totales, puntos_canjeados').eq('usuario_id', usuario_id).eq('negocio_id', negocio_id).maybeSingle()
  return data
}

// ── F3 · CANJE DE PUNTOS (vales) ──────────────────────────────────────────────
/** Cliente emite un vale al llegar a la meta (descuenta puntos). */
export async function emitirCanje(negocio_id: string) {
  const { data, error } = await supabase.rpc('turno_emitir_canje', { p_negocio: negocio_id })
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
