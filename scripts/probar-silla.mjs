/**
 * LOS 20 MODOS DE MI SILLA, COMPROBADOS SIN TELÉFONO.
 *
 * `lib/silla.ts` decide qué modo enseña la tarjeta a partir de los datos, y
 * es una función pura precisamente para poder hacer esto: darle un caso de
 * ejemplo por cada modo del tablero «D2B · los 20 modos» y mirar que elige el
 * que toca. Si alguien cambia el orden de prioridad o una condición, aquí se
 * ve antes de que llegue a la silla de nadie.
 *
 * No hay ejecutor de TypeScript en el repo, así que el fichero se transpila en
 * memoria con el compilador que ya está (typescript) y se ejecuta tal cual.
 *
 *   node scripts/probar-silla.mjs
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ts = require('typescript')

// SILLA_FUENTE permite probar la batería contra una copia estropeada a
// propósito: una prueba que nunca ha fallado no demuestra nada.
const fuente = readFileSync(process.env.SILLA_FUENTE ?? new URL('../lib/silla.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText
const mod = { exports: {} }
new Function('module', 'exports', 'require', js)(mod, mod.exports, require)
const S = mod.exports

// ── el reloj de las pruebas: hoy a las 15:00 ─────────────────────────────
const HOY = '2026-09-22'
const ms = (hhmm) => new Date(`${HOY}T${hhmm}:00`).getTime()
const AHORA = '15:00:00'
const T = ms('15:00')
const hace = (min) => new Date(T - min * 60000).toISOString()
const dentro = (min) => new Date(T + min * 60000).toISOString()

const persona = (nombre, extra = {}) => ({
  id: nombre, estado: 'en_fila', tipo_cola: 'digital', created_at: hace(12), prioridad: 2,
  turno_usuarios: { nombre, telefono: '8095550000' }, turno_servicios: { nombre: 'Fade', duracion_min: 30 }, ...extra,
})
const base = (extra = {}) => ({
  ahora: AHORA, ahoraMs: T, cola: [], citas: [], bloqueos: [],
  estado: { estado: 'libre', acepta: true, acepta_citas: true, acepta_fila: true, fila_abierta: true },
  captaSolo: true, suscripcion: { al_dia: true, quien: 'silla' },
  jornada: { hora_inicio: '09:00:00', hora_fin: '19:00:00' }, enJornada: true, ...extra,
})
const cita = (hora, estado = 'confirmada', extra = {}) => ({
  id: 'cita-' + hora, hora_inicio: hora + ':00', estado,
  turno_usuarios: { nombre: 'Carlos Abreu', telefono: '8095551111' }, turno_servicios: { nombre: 'Fade y barba', duracion_min: 45 }, ...extra,
})

const casos = [
  ['S1', 'nadie esperando', base()],
  ['S2', 'hay fila', base({ cola: [persona('Pedro Núñez'), persona('Luis Peña')] })],
  ['S3', 'solo con cita', base({ estado: { estado: 'libre', acepta: true, acepta_fila: false }, citas: [cita('16:15')] })],
  ['S4', 'fila cerrada: aún no abre', base({ enJornada: false, ahora: '07:00:00', jornada: { hora_inicio: '09:00:00', hora_fin: '19:00:00' } })],
  ['S5', 'llamado', base({ cola: [persona('Pedro Núñez', { estado: 'llamado', llamado_at: hace(1), expira_at: dentro(4) })] })],
  ['S6', 'viene en camino', base({ cola: [persona('Pedro Núñez', { estado: 'en_camino', llamado_at: hace(2), expira_at: dentro(3) })] })],
  ['S7', 'ya llegó', base({ cola: [persona('Pedro Núñez', { estado: 'en_camino', llego_at: hace(0), expira_at: null })] })],
  ['S8', 'se le pasó el tiempo', base({ cola: [persona('Pedro Núñez', { estado: 'llamado', llamado_at: hace(10), expira_at: hace(1) })] })],
  ['S9', 'atendiendo', base({ cola: [persona('Pedro Núñez', { estado: 'atendiendo', atendiendo_at: hace(18) })] })],
  ['S10', 'pasado de tiempo', base({ cola: [persona('Pedro Núñez', { estado: 'atendiendo', atendiendo_at: hace(38) }), persona('Luis Peña')] })],
  ['S11', 'cita de ahora', base({ citas: [cita('15:05')] })],
  ['S12', 'cita sin confirmar', base({ citas: [cita('15:05', 'no_confirmada')] })],
  ['S13', 'pausa con hora', base({ estado: { estado: 'descanso', acepta: false }, bloqueos: [{ motivo: S.MOTIVO_PAUSA, hora_inicio: '14:55:00', hora_fin: '15:15:00' }] })],
  ['S14', 'pausa sin hora', base({ estado: { estado: 'descanso', acepta: false } })],
  ['S15', 'se acabó la pausa', base({ estado: { estado: 'descanso', acepta: false }, bloqueos: [{ motivo: S.MOTIVO_PAUSA, hora_inicio: '14:30:00', hora_fin: '14:45:00' }] })],
  ['S16', 'hora bloqueada', base({ bloqueos: [{ motivo: 'Almuerzo', hora_inicio: '14:30:00', hora_fin: '15:30:00' }] })],
  ['S17', 'hoy no trabajas', base({ enJornada: false, jornada: null })],
  ['S18', 'silla sin pagar', base({ suscripcion: { al_dia: false, quien: 'silla' } })],
  ['S1+S19', 'sin conexión (sobre S1)', base({ desconectado: true, desdeMin: 3 })],
  // ── las prioridades, que es donde se equivoca uno ─────────────────────
  ['S9', 'sentado manda sobre la cita de ahora', base({ cola: [persona('Pedro', { estado: 'atendiendo', atendiendo_at: hace(5) })], citas: [cita('15:05')] })],
  ['S9', 'sentado manda sobre la silla sin pagar', base({ cola: [persona('Pedro', { estado: 'atendiendo', atendiendo_at: hace(5) })], suscripcion: { al_dia: false, quien: 'silla' } })],
  ['S11', 'la cita manda sobre la pausa', base({ estado: { estado: 'descanso', acepta: false }, citas: [cita('15:05')] })],
  ['S13', 'la pausa manda sobre la fila', base({ estado: { estado: 'descanso', acepta: false }, cola: [persona('Pedro')], bloqueos: [{ motivo: S.MOTIVO_PAUSA, hora_inicio: '14:55:00', hora_fin: '15:15:00' }] })],
  ['S2', 'el doble servicio no cuenta para llamar', base({ cola: [persona('Luis'), persona('María', { espera_a_id: 'otro' })] })],
  ['S1', 'solo un doble servicio en espera: no hay a quién llamar', base({ cola: [persona('María', { espera_a_id: 'otro' })] })],
]

let mal = 0
for (const [esperado, que, datos] of casos) {
  const m = S.modoDeSilla(datos)
  const ok = m.codigo === esperado
  if (!ok) mal++
  console.log(`${ok ? '  ok ' : ' MAL '} ${esperado.padEnd(7)} ${que.padEnd(52)} ${ok ? '' : '→ salió ' + m.codigo}`)
}

// ── la regla del que entra sin cita ─────────────────────────────────────
console.log('\n  El que entra sin cita:')
const reglas = [
  ['regla de hoy: nadie esperando → sí', base(), 'nadie_esperando', true],
  ['regla de hoy: uno esperando en la app → no', base({ cola: [persona('Pedro')] }), 'nadie_esperando', false],
  ['regla de hoy: solo un doble servicio en espera → no (el servidor lo cuenta)', base({ cola: [persona('María', { espera_a_id: 'otro' })] }), 'nadie_esperando', false],
  ['regla 118: esperan en la app, sin llegar → sí', base({ cola: [persona('Pedro'), persona('Luis')] }), 'nadie_presente', true],
  ['regla 118: uno ya está en el local → no', base({ cola: [persona('Pedro'), persona('Ramón', { tipo_cola: 'fisica' })] }), 'nadie_presente', false],
  ['regla 118: uno de la app dijo «ya llegué» → no', base({ cola: [persona('Pedro', { llego_at: hace(1) })] }), 'nadie_presente', false],
  ['regla 118: un doble servicio viene de la otra silla → no', base({ cola: [persona('María', { espera_a_id: 'otro' })] }), 'nadie_presente', false],
  ['sin permiso para captar → nunca', base({ captaSolo: false }), 'nadie_presente', false],
]
for (const [que, d, regla, esperado] of reglas) {
  const r = S.walkIn({ ...d, regla })
  const ok = r.puede === esperado
  if (!ok) mal++
  console.log(`${ok ? '  ok ' : ' MAL '} ${que.padEnd(58)} ${r.porQue ? '«' + r.porQue + '»' : ''}`)
}

// ── «si tiene el tiempo» ────────────────────────────────────────────────
console.log('\n  ¿Cabe antes de la próxima cita (16:00)?')
const conCita = base({ citas: [cita('16:00')] })
for (const [min, esperado] of [[30, true], [60, true], [61, false]]) {
  const r = S.cabeAntesDeLaCita(conCita, min)
  const ok = r.cabe === esperado
  if (!ok) mal++
  console.log(`${ok ? '  ok ' : ' MAL '} ${String(min).padStart(3)} min → ${r.cabe ? 'cabe' : 'no cabe'}`)
}

console.log(mal ? `\n${mal} fallan.` : '\nTodo en orden.')
process.exit(mal ? 1 : 0)
