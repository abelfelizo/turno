import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, Alert, ScrollView, Animated } from 'react-native'
import { useEffect, useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { entrarACola, entrarAColaDoble, getResumenFila, getConfiguracion, getMiUsuario } from '../lib/db'
import { avisos } from '../lib/notificaciones'
import { dinero } from '../lib/format'
import { COLORS, FONTS, GLASS } from '../constants'
import { Display, Avatar } from './ui'
import { useArrastrarParaCerrar, Agarre } from './gestos'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

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
 *
 * Y desde aquí se pide el DOBLE SERVICIO: dos servicios en la misma visita,
 * uno detrás del otro, con dos personas distintas —un barbero y después una
 * manicurista—. La base lo sabe hacer desde la migración 114 y nadie podía
 * pedirlo: el cliente entraba dos veces a mano y las dos filas corrían por su
 * cuenta, así que lo llamaban a la vez desde dos sillas.
 */
export default function HojaFila({ seleccion, visible, onClose, onEntrado, abiertos = [], dobleActivo = false }: {
  seleccion: Seleccion | null
  visible: boolean
  onClose: () => void
  onEntrado: () => void
  /** Los profesionales con la fila abierta AHORA. De aquí sale el segundo. */
  abiertos?: any[]
  /** El local puede apagar el doble servicio (`doble_servicio_activo`). */
  dobleActivo?: boolean
}) {
  const [resumen, setResumen] = useState<{ delante: number; espera_min: number } | null>(null)
  const [ventana, setVentana] = useState<number>(10)
  const [cargando, setCargando] = useState(false)
  const [entrando, setEntrando] = useState(false)
  // El segundo servicio de la visita, si lo pide.
  const [segundo, setSegundo] = useState<{ perfil: any; servicio: any } | null>(null)
  const [eligiendo, setEligiendo] = useState(false)

  useEffect(() => {
    if (!visible || !seleccion) return
    setResumen(null); setCargando(true)
    // La hoja se reutiliza para cada selección: sin esto, el segundo servicio
    // elegido y descartado volvía a aparecer en la siguiente.
    setSegundo(null); setEligiendo(false)
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
      const u = await getMiUsuario().catch(() => null)
      const yo = u?.nombre ?? 'Un cliente'
      if (segundo) {
        await entrarAColaDoble(seleccion.negocio.id, seleccion.servicio.id, segundo.servicio.id, {
          tipo_cola: 'digital',
          perfil_1: seleccion.perfil?.id ?? null,
          perfil_2: segundo.perfil.id,
        })
        if (seleccion.perfil?.usuario_id) avisos.barberoNuevoEnFila(seleccion.perfil.usuario_id, yo, seleccion.servicio.nombre)
        if (segundo.perfil?.usuario_id) avisos.barberoNuevoEnFila(segundo.perfil.usuario_id, yo, segundo.servicio.nombre)
      } else {
        await entrarACola({ negocio_id: seleccion.negocio.id, servicio_id: seleccion.servicio.id, tipo_cola: 'digital', perfil_id: seleccion.perfil?.id })
        // El barbero no se enteraba de que alguien había entrado a su fila:
        // tenía que estar mirando la app. El aviso sale de aquí porque la base
        // no puede llamar a nadie sin pg_net.
        if (seleccion.perfil?.usuario_id) {
          avisos.barberoNuevoEnFila(seleccion.perfil.usuario_id, yo, seleccion.servicio.nombre)
        }
      }
      onEntrado()
    } catch (e: any) {
      Alert.alert('No se pudo entrar', e.message ?? 'Intenta de nuevo.')
    } finally { setEntrando(false) }
  }

  // Se arrastra hacia abajo para cerrarla, igual que la hoja compartida: el
  // gesto vive en `components/gestos.tsx` para que las dos se sientan iguales.
  //
  // ANTES DEL `return null`, y aquí era el caso más grave de los cuatro: la
  // hoja arranca con `seleccion` en nulo —se monta con la pantalla, vacía— así
  // que el hook no se llamaba nunca hasta que el cliente tocaba un servicio, y
  // justo en ese render aparecía uno de más. O sea que la hoja de entrar a la
  // fila reventaba EN EL MOMENTO de usarla, no al abrir la pantalla.
  const { y, panHandlers } = useArrastrarParaCerrar(onClose)
  /**
   * LA BARRA DE ANDROID NO ES PARTE DE LA HOJA.
   *
   * La hoja se ancla al borde de abajo de la pantalla, y en Android ese borde
   * está DEBAJO de la barra de navegación (atrás, inicio, recientes): el botón
   * de confirmar quedaba tapado por ella, o medio tapado, justo donde va el
   * pulgar. Lo que mide esa barra lo da el sistema —cambia entre botones y
   * gestos, y de un teléfono a otro— así que se suma, no se adivina.
   */
  // Antes del `return null`, igual que el gesto: un hook nunca va detrás de
  // una salida temprana.
  const abajo = useSafeAreaInsets().bottom

  if (!seleccion) return null
  const { negocio, perfil, servicio } = seleccion
  const espera = resumen?.espera_min ?? 0

  /**
   * QUIÉN PUEDE HACER EL SEGUNDO SERVICIO.
   *
   * Las mismas dos condiciones que comprueba `turno_entrar_a_cola_doble`: otra
   * persona y OTRO OFICIO. Se filtran aquí para no ofrecer lo que el servidor
   * va a rechazar —no para sustituirlo: la regla sigue viviendo en la base, y
   * si esta lista se equivoca, el que dice que no es él.
   *
   * Solo se ofrece con un profesional elegido. Con "cualquiera disponible" no
   * sabemos todavía quién atiende el primero, así que tampoco sabemos quién
   * puede hacer el segundo sin repetir persona.
   */
  const candidatos = (perfil && dobleActivo)
    ? abiertos.filter((p: any) => p.id !== perfil.id && p.tipo_servicio !== perfil.tipo_servicio)
    : []
  const total = (servicio?.precio ?? 0) + (segundo?.servicio?.precio ?? 0)

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.bg}>
        <Animated.View style={[s.sheet, { paddingBottom: 24 + abajo, transform: [{ translateY: y }] }]}>
          <View {...panHandlers}><Agarre /></View>
          <Display size={24} style={{ marginBottom: 4 }}>Entrar a la fila digital</Display>
          <Text style={s.sub}>Revisa antes de confirmar. Reservas un lugar en la fila digital.</Text>

          <View style={s.top}>
            {segundo && <Text style={s.orden}>1º</Text>}
            <Avatar name={perfil?.turno_usuarios?.nombre ?? negocio?.nombre} uri={perfil?.turno_usuarios?.foto_url} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={s.barbero}>{perfil?.turno_usuarios?.nombre ?? 'Cualquiera disponible'}</Text>
              <Text style={s.serv}>{servicio.nombre} · {servicio.duracion_min} min</Text>
            </View>
            <Text style={s.precio}>{dinero(servicio.precio, negocio?.moneda)}</Text>
          </View>

          {/* EL SEGUNDO SERVICIO. Elegido, se enseña igual que el primero y
              numerado, porque el orden es lo único que hay que entender aquí:
              no son dos turnos sueltos, es uno detrás del otro. */}
          {segundo && (
            <>
              <View style={s.top}>
                <Text style={s.orden}>2º</Text>
                <Avatar name={segundo.perfil?.turno_usuarios?.nombre} uri={segundo.perfil?.turno_usuarios?.foto_url} size={52} />
                <View style={{ flex: 1 }}>
                  <Text style={s.barbero}>{segundo.perfil?.turno_usuarios?.nombre ?? 'Profesional'}</Text>
                  <Text style={s.serv}>{segundo.servicio.nombre} · {segundo.servicio.duracion_min} min</Text>
                </View>
                <Text style={s.precio}>{dinero(segundo.servicio.precio, negocio?.moneda)}</Text>
              </View>
              <View style={s.totalRow}>
                <Text style={s.totalL}>Total de la visita</Text>
                <Text style={s.totalN}>{dinero(total, negocio?.moneda)}</Text>
              </View>
              <TouchableOpacity onPress={() => setSegundo(null)} disabled={entrando}>
                <Text style={s.quitar}>Quitar el segundo servicio</Text>
              </TouchableOpacity>
            </>
          )}

          {/* PEDIR EL SEGUNDO. Solo si el local lo permite y hay alguien de
              otro oficio con la fila abierta; si no, ni se nombra: ofrecer algo
              que hoy no se puede dar es peor que no ofrecerlo. */}
          {!segundo && candidatos.length > 0 && !eligiendo && (
            <TouchableOpacity style={s.anadir} onPress={() => setEligiendo(true)} disabled={entrando}>
              <Ionicons name="add-circle-outline" size={20} color={COLORS.ink} />
              <View style={{ flex: 1 }}>
                <Text style={s.anadirT}>Añadir otro servicio a esta visita</Text>
                <Text style={s.anadirD}>Con otra persona, justo después. Una sola ida al local.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
            </TouchableOpacity>
          )}

          {!segundo && eligiendo && (
            <View style={s.elegir}>
              <View style={s.elegirHead}>
                <Text style={s.elegirT}>¿Qué te haces después?</Text>
                <TouchableOpacity onPress={() => setEligiendo(false)}><Text style={s.elegirX}>Cancelar</Text></TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 220 }}>
                {candidatos.map((p: any) => (
                  <View key={p.id} style={{ marginBottom: 10 }}>
                    <View style={s.candHead}>
                      <Avatar name={p.turno_usuarios?.nombre} uri={p.turno_usuarios?.foto_url} size={30} />
                      <Text style={s.candN}>{p.turno_usuarios?.nombre ?? 'Profesional'}</Text>
                    </View>
                    {(p.turno_servicios ?? []).filter((sv: any) => sv.activo).map((sv: any) => (
                      <TouchableOpacity key={sv.id} style={s.candServ}
                        onPress={() => { setSegundo({ perfil: p, servicio: sv }); setEligiendo(false) }}>
                        <Text style={s.candServN}>{sv.nombre} · {sv.duracion_min} min</Text>
                        <Text style={s.candServP}>{dinero(sv.precio, negocio?.moneda)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={s.aviso}>
            <Ionicons name="alarm-outline" size={16} color={COLORS.textMid} />
            <Text style={s.avisoT}>Cuando te llamen tendrás {ventana} min para llegar. Te avisaremos por notificación.</Text>
          </View>

          {/* LO QUE HAY QUE SABER DEL DOBLE SERVICIO, dicho antes de confirmar:
              que el segundo no se adelanta. Es la diferencia con entrar dos
              veces a mano, que es lo que la gente hacía y por lo que acababa
              llamada desde dos sillas a la vez. Y que el puesto del pie es el
              del primero: contar los dos sería prometer una hora inventada. */}
          {segundo && (
            <View style={s.aviso}>
              <Ionicons name="swap-vertical-outline" size={16} color={COLORS.textMid} />
              <Text style={s.avisoT}>
                Primero {perfil?.turno_usuarios?.nombre ?? 'el primero'} y después {segundo.perfil?.turno_usuarios?.nombre ?? 'el segundo'}.
                  No te llaman para el segundo hasta que termines el primero, y el puesto de abajo es el del primero.
              </Text>
            </View>
          )}

          {/* EL RECUENTO VA PEGADO AL BOTÓN, no en un bloque aparte arriba.
              Estaba en un rectángulo oscuro con las cifras en grande, y
              competía con la decisión: lo que se lee justo antes de tocar es
              en qué puesto entras, cuánto esperas y cuánto cuesta. Los tres
              datos en una línea, al alcance del pulgar que va a confirmar. */}
          <View style={s.pie}>
            <View style={s.recuento}>
              <Text style={s.recuentoT}>
                {cargando ? 'Consultando la fila…'
                  : `Entras ${(resumen?.delante ?? 0) + 1}º · unos ${espera} min`}
              </Text>
              <Text style={s.recuentoP}>{dinero(total, negocio?.moneda)}</Text>
            </View>
            <TouchableOpacity style={s.cta} onPress={entrar} disabled={entrando || cargando}>
              {entrando ? <ActivityIndicator color="#fff" /> : (
                <Text style={s.ctaT}>{segundo ? 'Entrar a las dos filas' : 'Entrar a la fila'}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} disabled={entrando}><Text style={s.cancel}>Cancelar</Text></TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: GLASS.fill, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 24, borderRadius: GLASS.radioCard, borderWidth: 1, borderColor: GLASS.border },
  sub: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textMid, marginBottom: 18 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: GLASS.fill, borderWidth: 1, borderColor: GLASS.border, borderRadius: GLASS.radioCard, padding: 14, marginBottom: 10 },
  barbero: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.ink },
  serv: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textLight, marginTop: 2 },
  precio: { fontFamily: FONTS.monoBold, fontSize: 16, color: COLORS.ink },
  orden: { fontFamily: FONTS.monoBold, fontSize: 15, color: COLORS.textLight, width: 18 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 4 },
  totalL: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textMid },
  totalN: { fontFamily: FONTS.monoBold, fontSize: 20, color: COLORS.ink },
  quitar: { fontFamily: FONTS.semibold, fontSize: 12.5, color: COLORS.textLight, paddingVertical: 8, marginBottom: 4 },
  anadir: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: GLASS.border, padding: 13, marginBottom: 12, borderRadius: GLASS.radioCard, backgroundColor: GLASS.fill },
  anadirT: { fontFamily: FONTS.semibold, fontSize: 14.5, color: COLORS.ink },
  anadirD: { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textMid, marginTop: 2 },
  elegir: { borderWidth: 1, borderColor: GLASS.border, padding: 13, marginBottom: 12, borderRadius: GLASS.radioCard, backgroundColor: GLASS.fill },
  elegirHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  elegirT: { fontFamily: FONTS.semibold, fontSize: 14.5, color: COLORS.ink },
  elegirX: { fontFamily: FONTS.semibold, fontSize: 12.5, color: COLORS.textLight },
  candHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  candN: { fontFamily: FONTS.semibold, fontSize: 13.5, color: COLORS.ink },
  candServ: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, backgroundColor: GLASS.fill, borderWidth: 1, borderColor: GLASS.border, borderRadius: GLASS.radioFila, paddingHorizontal: 14, marginBottom: 8 },
  candServN: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textMid },
  candServP: { fontFamily: FONTS.monoBold, fontSize: 16, color: COLORS.ink },
  aviso: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: GLASS.fillStrong, borderRadius: 16, padding: 12, marginBottom: 18 },
  avisoT: { flex: 1, fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textMid },
  cta: { height: 54, backgroundColor: COLORS.red, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  ctaT: { fontFamily: FONTS.semibold, fontSize: 16, color: '#FFFFFF' },
  pie: { borderTopWidth: 1, borderTopColor: GLASS.hairline, paddingTop: 14, marginTop: 4 },
  recuento: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 11 },
  recuentoT: { fontFamily: FONTS.semibold, fontSize: 12.5, color: COLORS.textMid, flexShrink: 1 },
  recuentoP: { fontFamily: FONTS.monoBold, fontSize: 20, color: COLORS.ink },
  cancel: { fontFamily: FONTS.semibold, textAlign: 'center', color: COLORS.textLight, fontSize: 14, marginTop: 14 },
})
