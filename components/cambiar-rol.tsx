import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getSesion, guardarSesion } from '../lib/storage'
import { getMisRoles } from '../lib/db'
import { COLORS, FONTS } from '../constants'

const DESTINO: Record<string, string> = {
  cliente: '/(app)/cliente/home',
  dueno: '/(app)/dueno/dashboard',
  empleado: '/(app)/barbero/agenda',
  barbero_renta: '/(app)/barbero/agenda',
}

function etiqueta(r: Rol) {
  if (r.rol === 'cliente') return `Cliente · ${r.negocio}`
  if (r.rol === 'dueno') return `Barbería · ${r.negocio}`
  return `Mi silla · ${r.negocio}`
}
function icono(rol: string): keyof typeof Ionicons.glyphMap {
  return rol === 'cliente' ? 'person-outline' : rol === 'dueno' ? 'storefront-outline' : 'cut-outline'
}

type Rol = { rol: string; negocio_id: string; negocio: string; perfil_id?: string; aprobado: boolean }

/**
 * Conmutador de panel. Reemplaza los botones "(dev)" que estaban detrás de
 * DEV_LOGIN: lista los roles REALES del usuario y cambia de panel sin cerrar
 * sesión. Se oculta solo si la persona tiene un único rol.
 */
export default function CambiarRol() {
  const router = useRouter()
  const [roles, setRoles] = useState<Rol[]>([])
  const [actual, setActual] = useState<{ rol?: string; negocio_id?: string }>({})

  const cargar = useCallback(async () => {
    const ss = await getSesion()
    if (!ss?.usuario_id) return
    setActual({ rol: ss.rol, negocio_id: ss.negocio_id })
    setRoles(await getMisRoles(ss.usuario_id).catch(() => []))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  // Un profesional sin perfil en ese local no tiene panel al que entrar.
  const opciones = roles.filter(r => r.rol === 'cliente' || r.rol === 'dueno' || !!r.perfil_id)
  if (opciones.length < 2) return null

  async function cambiar(r: Rol) {
    const ss = await getSesion(); if (!ss) return
    await guardarSesion({
      ...ss,
      rol: r.rol as any,
      negocio_id: r.negocio_id,
      perfil_id: r.rol === 'cliente' ? undefined : r.perfil_id,
    })
    if (r.rol !== 'cliente' && r.rol !== 'dueno' && r.perfil_id && !r.aprobado) {
      router.replace('/(auth)/barbero-pendiente'); return
    }
    router.replace(DESTINO[r.rol] as any)
  }

  return (
    <>
      <Text style={s.sec}>CAMBIAR DE PANEL</Text>
      {opciones.map(r => {
        const esActual = r.rol === actual.rol && r.negocio_id === actual.negocio_id
        return (
          <TouchableOpacity key={`${r.rol}-${r.negocio_id}`} style={[s.fila, esActual && s.filaOn]}
            onPress={() => cambiar(r)} disabled={esActual}>
            <Ionicons name={icono(r.rol)} size={20} color={esActual ? COLORS.success : COLORS.textMid} />
            <View style={{ flex: 1 }}>
              <Text style={s.txt}>{etiqueta(r)}</Text>
              {!r.aprobado && r.rol !== 'cliente' && r.rol !== 'dueno' ? <Text style={s.pend}>Pendiente de aprobación</Text> : null}
            </View>
            {esActual
              ? <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
              : <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />}
          </TouchableOpacity>
        )
      })}
    </>
  )
}

const s = StyleSheet.create({
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginBottom: 12, marginTop: 18 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, marginBottom: 8 },
  filaOn: { borderColor: COLORS.success },
  txt: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  pend: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.warning, marginTop: 2 },
})
