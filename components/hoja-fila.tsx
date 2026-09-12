import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, Alert } from 'react-native'
import { useEffect, useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { entrarACola, getResumenFila, getConfiguracion, getMiUsuario } from '../lib/db'
import { avisos } from '../lib/notificaciones'
import { dinero } from '../lib/format'
import { COLORS, FONTS } from '../constants'
import { Display, Avatar } from './ui'

type Seleccion = {
  negocio: any
  perfil?: any       // barbero elegido (undefined = lo asigna el dueño / pool)
  servicio: any
}

/**
 * Hoja de confirmación antes de entrar a la fila (R3). Muestra info previa
 * —barbero, servicio, precio, duración, personas delante, espera estimada,
 * ventana de llegada— y recién ahí confirma. Sin esto, un toque te metía a la
 * cola sin saber nada.
 */
export default function HojaFila({ seleccion, visible, onClose, onEntrado }: {
  seleccion: Seleccion | null
  visible: boolean
  onClose: () => void
  onEntrado: () => void
}) {
  const [resumen, setResumen] = useState<{ delante: number; espera_min: number } | null>(null)
  const [ventana, setVentana] = useState<number>(10)
  const [cargando, setCargando] = useState(false)
  const [entrando, setEntrando] = useState(false)

  useEffect(() => {
    if (!visible || !seleccion) return
    setResumen(null); setCargando(true)
    Promise.all([
      getResumenFila(seleccion.negocio.id, seleccion.perfil?.id).catch(() => ({ delante: 0, espera_min: 0 })),
      getConfiguracion(seleccion.negocio.id).catch(() => null),
    ]).then(([r, cfg]) => {
      setResumen(r); setVentana(cfg?.ventana_llegada_min ?? 10); setCargando(false)
    })
  }, [visible, seleccion])

  async function entrar() {
    if (!seleccion) return
    setEntrando(true)
    try {
      await entrarACola({ negocio_id: seleccion.negocio.id, servicio_id: seleccion.servicio.id, tipo_cola: 'digital', perfil_id: seleccion.perfil?.id })
      // El barbero no se enteraba de que alguien había entrado a su fila:
      // tenía que estar mirando la app. El aviso sale de aquí porque la base
      // no puede llamar a nadie sin pg_net.
      const u = await getMiUsuario().catch(() => null)
      if (seleccion.perfil?.usuario_id) {
        avisos.barberoNuevoEnFila(seleccion.perfil.usuario_id, u?.nombre ?? 'Un cliente', seleccion.servicio.nombre)
      }
      onEntrado()
    } catch (e: any) {
      Alert.alert('No se pudo entrar', e.message ?? 'Intenta de nuevo.')
    } finally { setEntrando(false) }
  }

  if (!seleccion) return null
  const { negocio, perfil, servicio } = seleccion
  const espera = resumen?.espera_min ?? 0

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.bg}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <Display size={24} style={{ marginBottom: 4 }}>Entrar a la fila digital</Display>
          <Text style={s.sub}>Revisa antes de confirmar. Reservas un lugar en la fila digital.</Text>

          <View style={s.top}>
            <Avatar name={perfil?.turno_usuarios?.nombre ?? negocio?.nombre} uri={perfil?.turno_usuarios?.foto_url} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={s.barbero}>{perfil?.turno_usuarios?.nombre ?? 'Cualquiera disponible'}</Text>
              <Text style={s.serv}>{servicio.nombre} · {servicio.duracion_min} min</Text>
            </View>
            <Text style={s.precio}>{dinero(servicio.precio, negocio?.moneda)}</Text>
          </View>

          <View style={s.info}>
            {cargando ? <ActivityIndicator color={COLORS.red} /> : (
              <>
                <View style={s.infoCol}>
                  <Text style={s.infoNum}>{resumen?.delante ?? 0}</Text>
                  <Text style={s.infoLbl}>{(resumen?.delante ?? 0) === 1 ? 'persona delante' : 'personas delante'}</Text>
                </View>
                <View style={s.divisor} />
                <View style={s.infoCol}>
                  <Text style={s.infoNum}>≈ {espera}</Text>
                  <Text style={s.infoLbl}>min de espera</Text>
                </View>
              </>
            )}
          </View>

          <View style={s.aviso}>
            <Ionicons name="alarm-outline" size={16} color={COLORS.textMid} />
            <Text style={s.avisoT}>Cuando te llamen tendrás {ventana} min para llegar. Te avisaremos por notificación.</Text>
          </View>

          <TouchableOpacity style={s.cta} onPress={entrar} disabled={entrando || cargando}>
            {entrando ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaT}>Entrar a la fila digital</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} disabled={entrando}><Text style={s.cancel}>Cancelar</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, marginBottom: 16 },
  sub: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textLight, marginBottom: 18 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: 14, marginBottom: 12 },
  barbero: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.ink },
  serv: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.textLight, marginTop: 2 },
  precio: { fontFamily: FONTS.display, fontSize: 22, color: COLORS.red },
  info: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.carbon, borderRadius: 16, padding: 18, marginBottom: 12, minHeight: 84 },
  infoCol: { flex: 1, alignItems: 'center' },
  infoNum: { fontFamily: FONTS.display, fontSize: 34, color: '#fff' },
  infoLbl: { fontFamily: FONTS.medium, fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  divisor: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.15)' },
  aviso: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surfaceAlt, borderRadius: 12, padding: 12, marginBottom: 18 },
  avisoT: { flex: 1, fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textMid },
  cta: { backgroundColor: COLORS.red, borderRadius: 14, padding: 17, alignItems: 'center' },
  ctaT: { fontFamily: FONTS.bold, fontSize: 16, color: '#fff' },
  cancel: { fontFamily: FONTS.semibold, textAlign: 'center', color: COLORS.textLight, fontSize: 14, marginTop: 14 },
})
