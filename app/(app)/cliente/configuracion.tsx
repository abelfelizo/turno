/**
 * AJUSTES. LO QUE ES MÍO Y DE NADIE MÁS.
 *
 * Esta pantalla era «Perfil» y cargaba cinco cosas que no le tocaban: la
 * tarjeta de fidelidad, los vales, las visitas, el gasto y la lista de
 * locales. Todo eso es de un local concreto —cambias de barbería y cambia—,
 * así que vive en «Mi barbería» y en «Historial». Aquí queda lo que viaja
 * contigo: cómo te cortas, si este teléfono recibe avisos, y tu cuenta.
 *
 * Las preferencias se editan aquí mismo. Eran una pantalla aparte para cuatro
 * campos: un viaje de ida y vuelta por nada.
 */
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Alert, TextInput } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { useRecargaAlEnfocar } from '../../../lib/recarga'
import { Ionicons } from '@expo/vector-icons'
import { getSesion, limpiarSesion } from '../../../lib/storage'
import { getMiUsuario, getPreferenciasCliente, guardarPreferencias, eliminarCuenta } from '../../../lib/db'
import { cerrarSesion } from '../../../lib/auth'
import { estadoAvisos, registrarPush } from '../../../lib/notificaciones'
import { COLORS, FONTS } from '../../../constants'
import { Avatar, NoCargo } from '../../../components/ui'
import CambiarRol from '../../../components/cambiar-rol'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function Configuracion() {
  // El hueco de arriba lo dice el sistema, no un número: en un teléfono con
  // isla dinámica 72 px se quedaban cortos y en uno sin muesca sobraban.
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [usuario, setUsuario] = useState<any>(null)
  const [pTipo, setPTipo] = useState('')
  const [pBarba, setPBarba] = useState('')
  const [pAlergias, setPAlergias] = useState('')
  const [pNotas, setPNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [loading, setLoading] = useState(true)
  const [fallo, setFallo] = useState(false)

  // Sin `.catch` va `getMiUsuario`: es de quién es esta cuenta. Tapado con
  // `null`, la pantalla se pintaba entera con el nombre vacío, sin foto y sin
  // teléfono — parecía una cuenta recién hecha o a medio borrar. Las
  // preferencias sí lo llevan: son de un local, y no tenerlas no impide nada.
  const cargar = useCallback(async () => {
   try {
    setFallo(false)
    const ss = await getSesion()
    const u = await getMiUsuario()
    setUsuario(u)
    if (u && ss?.negocio_id) {
      const pr = await getPreferenciasCliente(u.id, ss.negocio_id).catch(() => null)
      if (pr) {
        setPTipo(pr.tipo_corte ?? ''); setPBarba(pr.barba ?? '')
        setPAlergias(pr.alergias ?? ''); setPNotas(pr.notas ?? '')
      }
    }
   } catch {
    setFallo(true)
   } finally {
    setLoading(false)
   }
  }, [])

  // Montaje y primer enfoque son el mismo instante: con los dos, cada
  // apertura pedía todo dos veces. Ver lib/recarga.
  useRecargaAlEnfocar(cargar)

  function salir() {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir? Necesitarás un código nuevo para volver a entrar.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: async () => {
        await cerrarSesion(); await limpiarSesion(); router.replace('/(auth)/login')
      } },
    ])
  }

  async function guardarPrefs() {
    const ss = await getSesion()
    if (!ss?.usuario_id || !ss?.negocio_id) return
    setGuardando(true)
    try {
      await guardarPreferencias({
        usuario_id: ss.usuario_id, negocio_id: ss.negocio_id,
        tipo_corte: pTipo.trim(), barba: pBarba.trim(),
        alergias: pAlergias.trim(), notas: pNotas.trim(),
      } as any)
      Alert.alert('Guardado', 'Tu barbero lo verá antes de empezar.')
    } catch (e: any) {
      Alert.alert('No se pudo guardar', e?.message ?? 'Intenta de nuevo.')
    } finally { setGuardando(false) }
  }

  function eliminarMiCuenta() {
    Alert.alert('Eliminar cuenta',
      'Esto borra tus datos personales y cancela tus turnos y citas futuras. No se puede deshacer.',
      [{ text: 'Cancelar' }, { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try { await eliminarCuenta(); await cerrarSesion(); await limpiarSesion(); router.replace('/(auth)/login') }
        catch (e: any) { Alert.alert('Error', e.message ?? 'Intenta de nuevo.') }
      } }])
  }

  // Los avisos viajan de teléfono a teléfono: si el que tiene que recibirlos
  // no registró el suyo, se mandan a nadie y no falla nada visible. Aquí se ve.
  const [avisosOn, setAvisosOn] = useState(false)
  useEffect(() => { estadoAvisos().then(e => setAvisosOn(e.permiso && e.registrado)) }, [])
  async function activarAvisos() {
    if (avisosOn) return
    const token = await registrarPush()
    setAvisosOn(!!token)
    if (!token) {
      Alert.alert('No se pudieron activar',
        'El teléfono no dio permiso para avisos. Actívalo en los ajustes del sistema, en la ficha de Turno.')
    }
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.ink} /></View>
  if (fallo) return (
    <View style={s.center}>
      <NoCargo que="tus ajustes" onReintentar={() => { setLoading(true); cargar() }} />
    </View>
  )

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 20, paddingTop: insets.top + 12 }} showsVerticalScrollIndicator={false}>
      {/* Alineada a la izquierda, como la cabecera de «Mi barbería». La foto
          centrada con el nombre debajo era la ficha de perfil de antes: aquí
          no se presenta a nadie, se ajustan cosas. */}
      <View style={s.head}>
        <Avatar name={usuario?.nombre} size={56} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.nombre} numberOfLines={2}>{usuario?.nombre ?? 'Cliente'}</Text>
          {!!usuario?.telefono && <Text style={s.tel}>{usuario.telefono}</Text>}
        </View>
      </View>

      <Text style={s.sec}>MIS PREFERENCIAS</Text>
      <Text style={s.prefNota}>Esto lo ve tu barbero antes de empezar.</Text>
      <Campo label="Tipo de corte" placeholder="Fade, clásico, a máquina…" value={pTipo} onChangeText={setPTipo} />
      <Campo label="Barba" placeholder="Perfilado, recorte…" value={pBarba} onChangeText={setPBarba} />
      <Campo label="Alergias" placeholder="Productos que debes evitar" value={pAlergias} onChangeText={setPAlergias} />
      <Campo label="Notas" placeholder="Algo más que deba saber" value={pNotas} onChangeText={setPNotas} multiline />
      <TouchableOpacity style={s.guardar} onPress={guardarPrefs} disabled={guardando}>
        {guardando ? <ActivityIndicator color="#fff" /> : <Text style={s.guardarT}>Guardar preferencias</Text>}
      </TouchableOpacity>

      <CambiarRol />

      {/* CUENTA, con la misma composición que en los paneles de barbero y
          dueño: icono, nombre y UNA LÍNEA QUE DICE QUÉ PASA. Eran dos textos
          sueltos, uno gris y otro rojo, sin decir consecuencias — y una de las
          dos borra la cuenta. */}
      <Text style={[s.sec, { marginTop: 18 }]}>CUENTA</Text>

      <TouchableOpacity style={s.cuentaFila} onPress={salir}>
        <View style={s.cuentaIcono}><Ionicons name="log-out-outline" size={18} color={COLORS.textMid} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.cuentaT}>Cerrar sesión</Text>
          <Text style={s.cuentaD}>Tus turnos, tus citas y tus recortes acumulados siguen ahí cuando vuelvas a entrar.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
      </TouchableOpacity>


      {/* AVISOS. Reportado: "aún no he recibido la primera notificación". En la
          base había UN solo push token en todo el sistema: los avisos van de
          teléfono a teléfono, así que si el que tiene que recibirlos no
          registró el suyo, se mandan a nadie y no falla nada visible. Aquí se
          ve y se arregla. */}
      <TouchableOpacity style={s.cuentaFila} onPress={activarAvisos}>
        <View style={s.cuentaIcono}>
          <Ionicons name={avisosOn ? 'notifications' : 'notifications-off-outline'} size={18}
            color={avisosOn ? COLORS.success : COLORS.textMid} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.cuentaT}>Avisos en este teléfono</Text>
          <Text style={s.cuentaD}>
            {avisosOn
              ? 'Activados. Aquí llegan los turnos, las citas y los avisos del local.'
              : 'Apagados: en este teléfono no vas a recibir nada. Toca para activarlos.'}
          </Text>
        </View>
        {!avisosOn && <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />}
      </TouchableOpacity>

      <Text style={[s.sec, { marginTop: 22 }]}>SIN VUELTA ATRÁS</Text>
      <TouchableOpacity style={s.cuentaBorrar} onPress={eliminarMiCuenta}>
        <Ionicons name="trash-outline" size={18} color={COLORS.redText} />
        <View style={{ flex: 1 }}>
          <Text style={s.cuentaBorrarT}>Eliminar mi cuenta</Text>
          <Text style={s.cuentaBorrarD}>Borra tus datos, cancela tus turnos y citas, y pierdes los recortes acumulados en cada local. No se puede deshacer.</Text>
        </View>
      </TouchableOpacity>
    </ScrollView>
  )
}

function Campo({ label, ...props }: any) {
  return (
    <View style={{ marginTop: 13 }}>
      <Text style={s.campoLbl}>{String(label).toUpperCase()}</Text>
      <TextInput
        style={[s.campo, props.multiline && { minHeight: 76, textAlignVertical: 'top' }]}
        placeholderTextColor={COLORS.textLight}
        {...props} />
    </View>
  )
}

const s = StyleSheet.create({
  prefNota: { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textMid, marginTop: 10, lineHeight: 18 },
  campoLbl: { fontFamily: FONTS.bold, fontSize: 10, letterSpacing: 1.5, color: COLORS.textMid },
  campo: { marginTop: 6, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 13, paddingVertical: 12,
    fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink },
  guardar: { height: 52, backgroundColor: COLORS.ink, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  guardarT: { fontFamily: FONTS.semibold, fontSize: 16, color: '#fff', letterSpacing: 0 },
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 8 },
  nombre: { fontFamily: FONTS.bold, letterSpacing: -0.6, fontSize: 28, lineHeight: 30, color: COLORS.ink },
  tel: { fontFamily: FONTS.semibold, fontSize: 12.5, color: COLORS.textMid, marginTop: 3 },
  cuentaFila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15,
    borderBottomWidth: 1, borderBottomColor: COLORS.border },
  cuentaIcono: { width: 34, height: 34, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  cuentaT: { fontFamily: FONTS.semibold, fontSize: 17, color: COLORS.ink },
  cuentaD: { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textMid, marginTop: 3, lineHeight: 17 },
  cuentaBorrar: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'transparent', padding: 14, marginBottom: 24, borderWidth: 1, borderColor: COLORS.border },
  cuentaBorrarT: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.redText },
  cuentaBorrarD: { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textLight, marginTop: 3, lineHeight: 17 },
  // La misma sección que el resto de la app: rótulo con filete negro debajo.
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 1, textTransform: 'uppercase', marginTop: 22, marginBottom: 2 },
})
