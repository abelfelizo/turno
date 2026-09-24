/**
 * LA SESIÓN, EN MEMORIA Y CON AVISO.
 *
 * Antes cada lectura iba a AsyncStorage y parseaba el JSON entero: 44 sitios
 * de la app llaman a `getSesion()`, varios en cada carga de pantalla, así que
 * abrir una pestaña eran cuatro o cinco viajes al disco para leer lo mismo.
 * En Android cada uno cuesta lo suyo y se suman a la espera de la red.
 *
 * Ahora se lee del disco UNA vez y después se sirve de memoria. Es seguro
 * porque este fichero es el único que toca la clave: si algún día alguien la
 * escribe por su cuenta, esta caché mentiría — no lo hagas, pasa por aquí.
 *
 * Y AVISA CUANDO CAMBIA. Cambiar de barbería escribía la sesión nueva y
 * navegaba, pero las pestañas que ya estaban montadas seguían enseñando el
 * local anterior hasta que cada una se volviera a enfocar: se veía un tipo de
 * barbería en una pestaña y el otro en la de al lado. Con el aviso, quien
 * pinta el panel se entera en el acto y lo rehace entero.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { KEYS } from '../constants'
import { SesionLocal } from '../types'

const CLAVE = 'turno_sesion'

// `undefined` = todavía no se leyó del disco. `null` = se leyó y no hay.
// No son lo mismo: con `null` no hay que volver a preguntar.
let enMemoria: SesionLocal | null | undefined
const oyentes = new Set<(s: SesionLocal | null) => void>()

function avisar(s: SesionLocal | null) {
  // Un oyente que revienta no puede dejar a los demás sin enterarse.
  oyentes.forEach(fn => { try { fn(s) } catch {} })
}

export async function guardarSesion(sesion: SesionLocal) {
  enMemoria = sesion
  await AsyncStorage.setItem(CLAVE, JSON.stringify(sesion))
  avisar(sesion)
}

export async function getSesion(): Promise<SesionLocal | null> {
  if (enMemoria !== undefined) return enMemoria
  const s = await AsyncStorage.getItem(CLAVE)
  // Otro `getSesion` pudo terminar antes —o un `guardarSesion` colarse
  // mientras el disco contestaba—: lo que ya está en memoria es más nuevo
  // que lo que acabamos de leer, así que manda.
  if (enMemoria === undefined) enMemoria = s ? JSON.parse(s) : null
  return enMemoria ?? null
}

export async function limpiarSesion() {
  enMemoria = null
  await AsyncStorage.removeItem(CLAVE)
  avisar(null)
}

/** Se entera de cada cambio de sesión. Devuelve cómo dejar de escuchar. */
export function alCambiarSesion(fn: (s: SesionLocal | null) => void): () => void {
  oyentes.add(fn)
  return () => { oyentes.delete(fn) }
}

export const guardarUserId = (id: string) => AsyncStorage.setItem(KEYS.USER_ID, id)
export const getUserId = () => AsyncStorage.getItem(KEYS.USER_ID)
