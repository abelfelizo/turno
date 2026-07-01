import * as ImagePicker from 'expo-image-picker'
import { supabase } from './supabase'

const BUCKET = 'turno-perfiles'

// En React Native, subir un Blob a Supabase Storage suele dar archivos de 0
// bytes. La vía fiable es pedir base64 a ImagePicker y decodificarlo a bytes.
function base64ABytes(b64: string): Uint8Array {
  const bin = globalThis.atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/**
 * Abre la galería, deja recortar en cuadrado y sube la imagen al bucket
 * turno-perfiles. Devuelve la URL pública, o null si el usuario cancela.
 * `carpeta` agrupa por tipo: 'barberos' | 'logos'.
 */
export async function elegirYSubirImagen(carpeta: string, id: string): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) throw new Error('Necesitamos permiso para acceder a tus fotos.')

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
    base64: true,
  })
  if (res.canceled || !res.assets?.[0]?.base64) return null

  const img = res.assets[0]
  const ext = (img.uri.split('.').pop() || 'jpg').toLowerCase().split('?')[0]
  const contentType = img.mimeType || (ext === 'png' ? 'image/png' : 'image/jpeg')
  const path = `${carpeta}/${id}/${Date.now()}.${ext}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, base64ABytes(img.base64!), { contentType, upsert: true })
  if (error) throw error

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
