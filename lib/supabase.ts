import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

/**
 * Si estas variables faltan, createClient lanza AQUÍ MISMO — a nivel de módulo,
 * antes de que exista el ErrorBoundary y antes de la primera petición. La app se
 * cierra sola al abrir, sin mensaje en pantalla y sin dejar una sola línea en
 * los logs del servidor. Es el peor modo de fallo posible: indistinguible de un
 * crash nativo, e imposible de diagnosticar sin un cable y una computadora.
 *
 * Pasó de verdad: el workflow de actualizaciones por aire publicaba sin el `env`
 * de eas.json —que solo aplica `eas build`, no `eas update`— y la primera
 * publicación dejó el teléfono de pruebas inservible.
 *
 * El arreglo de raíz está en el workflow, que ahora aborta si faltan. Esto es la
 * segunda línea: con un placeholder la app ARRANCA y falla al hablar con el
 * servidor, que es un error que se ve y se puede contar.
 */
export const faltaConfiguracion = !url || !key

export const supabase = createClient(
  url || 'https://configuracion-ausente.invalid',
  key || 'configuracion-ausente',
  { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } }
)
