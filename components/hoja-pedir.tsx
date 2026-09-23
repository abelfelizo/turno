/**
 * LA PUERTA ÚNICA: ELEGIR CON QUIÉN Y QUÉ.
 *
 * Antes la pantalla principal llevaba la lista entera de barberos con sus
 * servicios colgando debajo del turno, y encima dos botones —«pedir turno» y
 * «agendar»— que abrían la misma ventana y volvían a enseñar la misma lista.
 * Dos veces lo mismo en la misma pantalla, y la lista ganándole el sitio a lo
 * único que el cliente viene a mirar: su turno.
 *
 * Aquí la elección es una hoja, y la misma hoja sirve para las dos vías. Lo
 * que cambia entre fila y cita no es el aspecto: es QUIÉN PUEDE SALIR.
 *
 *   fila   quien trabaja por orden de llegada (aceptaFila)
 *   cita   quien acepta reservas (aceptaCitas)
 *
 * NINGÚN BOTÓN NOMBRA A UNA PERSONA. «Fila con Ana» se lee bien con dos
 * barberos y se rompe con cuatro, y sobre todo elegir por el cliente es
 * recomendar — y recomendar no le toca a la app. Se elige tocando el servicio
 * de quien uno quiera; el nombre está arriba, en su bloque.
 *
 * EL QUE ESTÁ EN PAUSA SALE, APAGADO Y CON LA HORA. Esconderlo sería mentir a
 * quien viene justo a buscarlo: leería que su barbero no trabaja aquí. Y
 * dejarlo encendido sería mandarlo a un error, porque el servidor lo rechaza.
 * El motivo lo escribe el servidor (migración 74) con las mismas palabras con
 * las que rechazaría el turno: el letrero y la puerta dicen lo mismo.
 */
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Animated } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { dinero } from '../lib/format'
import { aceptaFila, aceptaCitas, filaAbierta, fraseFila, porQueNo } from '../lib/atencion'
import { COLORS, FONTS, GLASS } from '../constants'
import { Display, Avatar } from './ui'
import { useArrastrarParaCerrar, Agarre } from './gestos'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export type Via = 'fila' | 'cita'

export default function HojaPedir({
  via, visible, onClose, negocio, perfiles, ratings = {}, preferido, onElegir, onCualquiera, soloPerfil,
}: {
  via: Via
  visible: boolean
  onClose: () => void
  negocio: any
  perfiles: any[]
  ratings?: Record<string, { promedio: number; total: number }>
  preferido?: string | null
  /** Barbero y servicio elegidos. La hoja no entra a la fila ni reserva: avisa. */
  onElegir: (perfil: any, servicio: any) => void
  /** Solo en fila: entrar sin barbero asignado. */
  onCualquiera?: () => void
  /**
   * Un solo barbero, cuando se llegó desde SU ficha en «Mi barbería».
   *
   * Ahí el cliente ya eligió persona; volver a enseñarle el local entero es
   * deshacerle la decisión y hacerle buscar otra vez el nombre que acababa de
   * tocar. Lo que queda por decidir es el servicio, y eso es lo que sale.
   */
  soloPerfil?: string | null
}) {
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
  const abajo = useSafeAreaInsets().bottom

  const esFila = via === 'fila'
  // Quien no trabaja por esta vía no sale: no es que esté cerrado hoy, es que
  // esa puerta no existe para él, y enseñarla apagada da a entender que
  // mañana sí.
  const elegibles = perfiles
    .filter((p: any) => (esFila ? aceptaFila(p) : aceptaCitas(p)))
    .filter((p: any) => !soloPerfil || p.id === soloPerfil)
  // Tu barbero primero. Es lo que se busca al abrir, y hacerlo bajar hasta él
  // cada vez es cobrarle un peaje por tener uno.
  const lista = [...elegibles].sort((a: any, b: any) =>
    (b.id === preferido ? 1 : 0) - (a.id === preferido ? 1 : 0))
  const abiertos = esFila ? lista.filter((p: any) => filaAbierta(p)) : lista

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={s.fondo}>
        <Animated.View style={[s.hoja, { paddingBottom: 18 + abajo, transform: [{ translateY: y }] }]}>
          <View {...panHandlers}><Agarre /></View>

          <View style={s.cab}>
            <View style={{ flex: 1 }}>
              <Display size={24}>{esFila ? 'Entrar a la fila' : 'Reservar cita'}</Display>
              <Text style={s.sub}>
                {esFila
                  ? 'Eliges el servicio y entras por orden de llegada.'
                  : 'Eliges el servicio y después el día y la hora.'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={s.cerrar}>
              <Ionicons name="close" size={22} color={COLORS.ink} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ paddingBottom: 26 }}
            showsVerticalScrollIndicator={false}>

            {lista.length === 0 && (
              <Text style={s.vacio}>
                {esFila
                  ? 'Nadie de este local está atendiendo por fila. Puedes reservar una cita.'
                  : 'Nadie de este local está tomando reservas ahora mismo.'}
              </Text>
            )}

            {/* CUALQUIERA DISPONIBLE, solo en fila y solo si hay alguien abierto.
                Con la puerta cerrada esto no es una opción cómoda: es un botón
                que va a dar error. */}
            {esFila && onCualquiera && !soloPerfil && lista.length > 0 && (
              <TouchableOpacity style={[s.cualquiera, !abiertos.length && s.apagado]}
                onPress={onCualquiera} disabled={!abiertos.length} activeOpacity={0.8}>
                <View style={s.cualquieraIco}>
                  <Ionicons name="people-outline" size={19} color={COLORS.ink} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cualquieraT}>Cualquiera disponible</Text>
                  <Text style={s.cualquieraD}>
                    {!abiertos.length
                      ? 'Ahora mismo no hay nadie abierto en el local'
                      : preferido && abiertos.some((p: any) => p.id === preferido)
                        ? 'Te ponemos con tu barbero si se desocupa a tiempo'
                        : 'Te atiende el primero que se desocupe'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
              </TouchableOpacity>
            )}

            {lista.map((p: any) => {
              // En fila el horario cuenta; en cita no: se reserva justamente
              // para cuando el barbero vuelva a estar.
              const abierta = esFila ? filaAbierta(p) : true
              const motivo = esFila ? fraseFila(p) : porQueNo(p)
              const r = ratings[p.id]
              const servicios = (p.turno_servicios ?? []).filter((sv: any) => sv.activo)
              const mio = preferido === p.id
              return (
                <View key={p.id} style={[s.barbero, mio && s.barberoMio, !abierta && s.apagado]}>
                  <View style={s.barberoHead}>
                    <Avatar name={p.turno_usuarios?.nombre} uri={p.turno_usuarios?.foto_url} size={40} />
                    <View style={{ flex: 1 }}>
                      <View style={s.nombreFila}>
                        <Text style={s.barberoN} numberOfLines={1}>{p.turno_usuarios?.nombre ?? 'Profesional'}</Text>
                        {mio && <Text style={s.mio}>TU BARBERO</Text>}
                      </View>
                      <Text style={s.barberoMeta} numberOfLines={1}>
                        {[p.turno_usuarios?.especialidad, r ? `★ ${r.promedio} (${r.total})` : null]
                          .filter(Boolean).join(' · ') || 'Sin reseñas todavía'}
                      </Text>
                    </View>
                  </View>

                  {/* LA PAUSA SE DICE ENTERA. «No disponible» deja al cliente
                      sin saber si son diez minutos o el día entero. */}
                  {!abierta && !!motivo && (
                    <View style={s.pausa}>
                      <Ionicons name="pause-circle-outline" size={15} color={COLORS.warning} />
                      <Text style={s.pausaT}>{motivo}</Text>
                    </View>
                  )}

                  {servicios.length === 0
                    ? <Text style={s.sinServ}>Todavía no publicó sus servicios.</Text>
                    : servicios.map((sv: any) => (
                      <TouchableOpacity key={sv.id} style={s.serv} disabled={!abierta}
                        onPress={() => onElegir(p, sv)} activeOpacity={0.7}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.servN}>{sv.nombre}</Text>
                          <Text style={s.servD}>{sv.duracion_min} min</Text>
                        </View>
                        <Text style={s.servP}>{dinero(sv.precio, negocio?.moneda)}</Text>
                        {abierta && <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />}
                      </TouchableOpacity>
                    ))}
                </View>
              )
            })}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  hoja: { backgroundColor: GLASS.fill, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 18, paddingBottom: 18, borderWidth: 1, borderColor: GLASS.border, borderRadius: GLASS.radioCard },
  cab: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  sub: { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textMid, marginTop: 4, lineHeight: 18 },
  cerrar: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: GLASS.border, borderRadius: 17, backgroundColor: GLASS.fill },
  vacio: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textMid, lineHeight: 20, paddingVertical: 14 },

  cualquiera: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: 1, borderTopColor: GLASS.hairline, backgroundColor: GLASS.fill, borderWidth: 1, borderColor: GLASS.border, borderRadius: GLASS.radioFila, paddingHorizontal: 14, marginBottom: 8 },
  cualquieraIco: { width: 38, height: 38, borderWidth: 1, borderColor: GLASS.border, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: GLASS.fill },
  cualquieraT: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  cualquieraD: { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textMid, marginTop: 2 },

  // El apagado se ve, no se esconde: el que viene a buscar a su barbero tiene
  // que poder leer a qué hora vuelve sin salir de aquí.
  apagado: { opacity: 0.5 },
  barbero: { marginTop: 16 },
  barberoMio: {  },
  barberoHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  nombreFila: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  barberoN: { fontFamily: FONTS.semibold, letterSpacing: -0.3, fontSize: 19, color: COLORS.ink, flexShrink: 1 },
  mio: { fontFamily: FONTS.bold, fontSize: 8.5, letterSpacing: 0.5, color: '#fff', backgroundColor: COLORS.ink, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden', borderRadius: 999 },
  barberoMeta: { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textMid, marginTop: 2 },
  pausa: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9 },
  pausaT: { fontFamily: FONTS.semibold, fontSize: 12.5, color: COLORS.textMid, flexShrink: 1 },
  sinServ: { fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.textLight, marginTop: 10 },

  serv: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, marginTop: 1, backgroundColor: GLASS.fill, borderWidth: 1, borderColor: GLASS.border, borderRadius: GLASS.radioFila, paddingHorizontal: 14, marginBottom: 8 },
  servN: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink },
  servD: { fontFamily: FONTS.regular, fontSize: 11.5, color: COLORS.textMid, marginTop: 1 },
  servP: { fontFamily: FONTS.monoBold, fontSize: 18, color: COLORS.ink },
})
