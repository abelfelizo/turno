import AsyncStorage from '@react-native-async-storage/async-storage'
import { KEYS } from '../constants'
import { SesionLocal } from '../types'

export const guardarSesion = (sesion: SesionLocal) => AsyncStorage.setItem('turno_sesion', JSON.stringify(sesion))
export const getSesion = async (): Promise<SesionLocal | null> => {
  const s = await AsyncStorage.getItem('turno_sesion')
  return s ? JSON.parse(s) : null
}
export const limpiarSesion = () => AsyncStorage.removeItem('turno_sesion')
export const guardarUserId = (id: string) => AsyncStorage.setItem(KEYS.USER_ID, id)
export const getUserId = () => AsyncStorage.getItem(KEYS.USER_ID)
