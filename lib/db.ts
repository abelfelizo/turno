import { supabase } from './supabase'

const T = (tabla: string) => `turno_${tabla}`

// NEGOCIOS
export async function getNegocioPorCodigo(codigo: string) {
  const { data, error } = await supabase.from(T('negocios')).select('*').eq('codigo_acceso', codigo.toUpperCase()).single()
  if (error) throw error
  return data
}

export async function getConfiguracion(negocio_id: string) {
  const { data, error } = await supabase.from(T('configuracion_negocio')).select('*').eq('negocio_id', negocio_id).single()
  if (error) throw error
  return data
}

// USUARIOS
export async function crearUsuario(nombre: string, telefono: string, tipo: 'profesional' | 'cliente') {
  const { data, error } = await supabase.from(T('usuarios')).insert({ nombre, telefono, tipo_usuario: tipo }).select().single()
  if (error) throw error
  return data
}

export async function getUsuario(id: string) {
  const { data, error } = await supabase.from(T('usuarios')).select('*').eq('id', id).single()
  if (error) throw error
  return data
}

// PERFILES
export async function getPerfilesNegocio(negocio_id: string) {
  const { data, error } = await supabase.from(T('perfiles')).select('*, turno_usuarios(nombre, telefono), turno_servicios(*)').eq('negocio_id', negocio_id).eq('aprobado', true).eq('activo', true)
  if (error) throw error
  return data || []
}

export async function getMiPerfil(usuario_id: string, negocio_id: string) {
  const { data, error } = await supabase.from(T('perfiles')).select('*').eq('usuario_id', usuario_id).eq('negocio_id', negocio_id).single()
  if (error) throw error
  return data
}

export async function actualizarEstadoPerfil(perfil_id: string, estado: string) {
  const { error } = await supabase.from(T('perfiles')).update({ estado_actual: estado }).eq('id', perfil_id)
  if (error) throw error
}

// SERVICIOS
export async function getServiciosPerfil(perfil_id: string) {
  const { data, error } = await supabase.from(T('servicios')).select('*').eq('perfil_id', perfil_id).eq('activo', true)
  if (error) throw error
  return data || []
}

// CITAS
export async function getCitasHoy(perfil_id: string) {
  const hoy = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase.from(T('citas')).select('*, turno_usuarios(nombre, telefono, no_shows, llegadas_tarde), turno_servicios(nombre, duracion_min, precio)').eq('perfil_id', perfil_id).eq('fecha', hoy).order('hora_inicio')
  if (error) throw error
  return data || []
}

export async function actualizarEstadoCita(cita_id: string, estado: string, extra?: Record<string, any>) {
  const { error } = await supabase.from(T('citas')).update({ estado, ...extra }).eq('id', cita_id)
  if (error) throw error
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

export async function entrarACola(cola: {
  negocio_id: string; cliente_id: string; servicio_id: string
  tipo_cola: 'digital' | 'fisica'; perfil_id?: string; posicion: number
}) {
  const { data, error } = await supabase.from(T('cola')).insert({ ...cola, estado: 'en_fila', prioridad: cola.tipo_cola === 'digital' ? 2 : 3 }).select().single()
  if (error) throw error
  return data
}

export async function actualizarEstadoCola(cola_id: string, estado: string, extra?: Record<string, any>) {
  const { error } = await supabase.from(T('cola')).update({ estado, ...extra }).eq('id', cola_id)
  if (error) throw error
}

// PREFERENCIAS
export async function getPreferenciasCliente(usuario_id: string, negocio_id: string) {
  const { data } = await supabase.from(T('preferencias_cliente')).select('*').eq('usuario_id', usuario_id).eq('negocio_id', negocio_id).single()
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
  const { data } = await supabase.from(T('notas_privadas')).select('nota').eq('perfil_id', perfil_id).eq('cliente_id', cliente_id).single()
  return data?.nota || ''
}

export async function guardarNotaPrivada(perfil_id: string, cliente_id: string, nota: string) {
  const { error } = await supabase.from(T('notas_privadas')).upsert({ perfil_id, cliente_id, nota }, { onConflict: 'perfil_id,cliente_id' })
  if (error) throw error
}

// PUNTOS
export async function getPuntos(usuario_id: string, negocio_id: string) {
  const { data } = await supabase.from(T('puntos')).select('puntos_totales, puntos_canjeados').eq('usuario_id', usuario_id).eq('negocio_id', negocio_id).single()
  return data
}
