import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getServiciosPerfil, getHorariosPerfil, crearServicio, actualizarServicio, guardarHorario, cambiarModalidad, getRolDePerfil, getPerfilPorId, suspenderBarbero, desvincularBarbero, getNegocioById, permitirCaptarSolo } from '../../../lib/db'
import { getSesion } from '../../../lib/storage'
import { enviarPush } from '../../../lib/notificaciones'
import { hora12, dinero } from '../../../lib/format'
import { COLORS, FONTS } from '../../../constants'
import { NoCargo } from '../../../components/ui'
import Hoja from '../../../components/hoja'
import Resenas from '../../../components/resenas'
import { useGestoVolver } from '../../../components/gestos'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Rotulo } from '../../../components/d2'
import { Titulo, AhoraNo } from '../../../components/hoja-piezas'
import { Fila, Iniciales, Estado, Flecha, Boton, Chip, Nota, Interruptor, Etiqueta, Campo, Paso, IconoFila, t } from '../../../components/turno-ui'

const DIAS = [
  { n: 1, l: 'Lunes' }, { n: 2, l: 'Martes' }, { n: 3, l: 'Miércoles' }, { n: 4, l: 'Jueves' },
  { n: 5, l: 'Viernes' }, { n: 6, l: 'Sábado' }, { n: 0, l: 'Domingo' },
]

/**
 * Panel BARBERÍA · servicios y horario de UN empleado.
 *
 * Existe por la regla de producto: el barbero es autónomo salvo que sea
 * empleado, y en ese caso manda la barbería. Sin esta pantalla la regla dejaba
 * al local sin forma de poner precios ni jornada a su propia gente.
 *
 * Escribe sobre el perfil del empleado; RLS lo permite por ser dueño del local
 * (`turno_perfil_admin`), no por ser el perfil.
 */
export default function BarberoDelLocal() {
  // El hueco de arriba lo dice el sistema, no un número: en un teléfono con
  // isla dinámica 72 px se quedaban cortos y en uno sin muesca sobraban.
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { perfil, nombre, rol } = useLocalSearchParams<{ perfil: string; nombre?: string; rol?: string }>()
  // El parámetro solo sirve para pintar algo mientras carga; la verdad se
  // pregunta a la base en `cargar()`. Si no llega ninguna de las dos se queda
  // en NULL A PROPÓSITO: "no lo sé" no es "es un empleado". El valor por
  // defecto era 'empleado', que es justo el que abre los controles de edición,
  // así que un fallo de red le ofrecía al administrador tocarle los servicios
  // y el horario a alguien que le paga por el asiento. Ver `puedoEditarle`.
  const [modalidad, setModalidad] = useState<string | null>(rol ?? null)
  const [servicios, setServicios] = useState<any[]>([])
  const [horarios, setHorarios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [fallo, setFallo] = useState(false)

  const [svModal, setSvModal] = useState<null | 'nuevo' | any>(null)
  const [svNombre, setSvNombre] = useState(''); const [svDur, setSvDur] = useState('30'); const [svPrecio, setSvPrecio] = useState('')
  const [svBusy, setSvBusy] = useState(false)

  const [hrModal, setHrModal] = useState<null | { n: number; h?: any }>(null)
  const [hrIni, setHrIni] = useState(9); const [hrFin, setHrFin] = useState(19); const [hrBuf, setHrBuf] = useState(10)
  const [hrBusy, setHrBusy] = useState(false)
  const [modBusy, setModBusy] = useState(false)
  // Suspensión y baja: las dos decisiones sobre ESTA persona, aquí y no en la
  // lista del panel, donde el botón rojo estaba a un toque de distancia.
  const [perfilRow, setPerfilRow] = useState<any>(null)
  const [suspBusy, setSuspBusy] = useState(false)
  const [captaBusy, setCaptaBusy] = useState(false)
  const [verResenas, setVerResenas] = useState(false)
  // La modalidad del LOCAL, que desde la migración 98 decide si aquí se puede
  // nombrar empleado a alguien. Donde alquilas asientos no hay suscripción del
  // local de la que salga el aporte de un empleado, así que nombrarlo sería
  // dirigirlo gratis — y el servidor lo rechaza.
  const [tipoLocal, setTipoLocal] = useState<string | null>(null)

  async function aplicarModalidad(nuevo: 'empleado' | 'barbero_renta') {
    if (nuevo === modalidad) return
    setModBusy(true)
    try { await cambiarModalidad(perfil, nuevo); setModalidad(nuevo) }
    catch (e: any) { Alert.alert('No se pudo cambiar', e.message ?? 'Intenta de nuevo.') }
    finally { setModBusy(false) }
  }

  // Aquí NINGUNA lleva `.catch`, y es la única pantalla de la app donde se
  // decide así. Esta es la mesa desde la que el administrador le toca los
  // precios y la jornada a otra persona: media pantalla cargada es media
  // pantalla inventada. Sin servicios parece que el barbero no ofrece nada;
  // sin el rol, que no lo sabemos —lo que ya cierra la edición, pero dejando
  // los controles a la vista y sin explicar por qué no responden—; sin el tipo
  // de local, que aquí se puede nombrar empleado donde no se puede. Si falta
  // cualquiera de las cinco, se dice que no cargó y se ofrece reintentar.
  const cargar = useCallback(async () => {
    try {
      setFallo(false)
      if (!perfil) return
      const ss = await getSesion()
      const [sv, hr, rl, pf, neg] = await Promise.all([
        getServiciosPerfil(perfil, false),
        getHorariosPerfil(perfil),
        getRolDePerfil(perfil),
        getPerfilPorId(perfil),
        ss?.negocio_id ? getNegocioById(ss.negocio_id) : Promise.resolve(null),
      ])
      if (rl) setModalidad(rl)
      setServicios(sv as any[]); setHorarios(hr as any[]); setPerfilRow(pf)
      setTipoLocal((neg as any)?.tipo ?? null)
    } catch {
      setFallo(true)
    } finally {
      setLoading(false)
    }
  }, [perfil])
  useEffect(() => { cargar() }, [cargar])

  function abrirServicio(sv?: any) {
    setSvNombre(sv?.nombre ?? ''); setSvDur(String(sv?.duracion_min ?? 30)); setSvPrecio(String(sv?.precio ?? ''))
    setSvModal(sv ?? 'nuevo')
  }
  async function guardarServicio() {
    if (!svNombre.trim()) { Alert.alert('Falta el nombre', 'Ponle nombre al servicio.'); return }
    setSvBusy(true)
    try {
      const datos = { nombre: svNombre.trim(), duracion_min: Number(svDur) || 30, precio: Number(svPrecio) || 0 }
      if (svModal === 'nuevo') await crearServicio({ perfil_id: perfil, ...datos })
      else await actualizarServicio(svModal.id, datos)
      setSvModal(null); cargar()
    } catch (e: any) { Alert.alert('No se pudo guardar', e.message ?? 'Intenta de nuevo.') }
    finally { setSvBusy(false) }
  }
  async function toggleSv(sv: any) {
    try {
      await actualizarServicio(sv.id, { activo: !sv.activo })
      setServicios(prev => prev.map(x => x.id === sv.id ? { ...x, activo: !x.activo } : x))
    } catch (e: any) { Alert.alert('No se pudo cambiar', e.message ?? 'Intenta de nuevo.') }
  }

  function horarioDe(n: number) { return horarios.find(h => h.dia_semana === n) }
  function abrirHorario(n: number) {
    const h = horarioDe(n)
    setHrIni(h ? Number(String(h.hora_inicio).slice(0, 2)) : 9)
    setHrFin(h ? Number(String(h.hora_fin).slice(0, 2)) : 19)
    setHrBuf(h?.tiempo_entre_clientes ?? 0)
    setHrModal({ n, h })
  }
  async function aplicarHorario(activo: boolean) {
    if (!hrModal) return
    setHrBusy(true)
    try {
      await guardarHorario({
        id: hrModal.h?.id, perfil_id: perfil, dia_semana: hrModal.n,
        hora_inicio: `${String(hrIni).padStart(2, '0')}:00`, hora_fin: `${String(hrFin).padStart(2, '0')}:00`,
        tiempo_entre_clientes: hrBuf, activo,
      })
      setHrModal(null); cargar()
    } catch (e: any) { Alert.alert('No se pudo guardar', e.message ?? 'Intenta de nuevo.') }
    finally { setHrBusy(false) }
  }

  /**
   * SUSPENDER: parar unos días sin echar a nadie.
   *
   * Antes solo existía desvincular, que cancela sus citas futuras y lo saca del
   * local. Para el empleado que no viene esta semana la única salida era echarlo
   * y volver a aprobarlo, así que no se usaba ninguna de las dos y el barbero
   * seguía saliendo disponible en la app mientras no estaba.
   */
  function cambiarSuspension() {
    const activa = !!perfilRow?.suspendido
    if (activa) {
      Alert.alert('Reanudar', `${nombre || 'Este barbero'} vuelve a recibir turnos y citas desde ahora.`, [
        { text: 'Ahora no' },
        { text: 'Reanudar', onPress: async () => {
          setSuspBusy(true)
          try { await suspenderBarbero(perfil, false); await cargar() }
          catch (e: any) { Alert.alert('No se pudo', e.message ?? 'Intenta de nuevo.') }
          finally { setSuspBusy(false) }
        } },
      ])
      return
    }
    // LO QUE SUSPENDER HACE DE VERDAD DEPENDE DE A QUIÉN (migración 92).
    //
    // Este texto decía «él no podrá llamar ni atender» para todo el mundo, y
    // para un AUTÓNOMO es falso desde la 92: al que te paga renta le quitas la
    // fila y la fachada del local, no su negocio. Sigue atendiendo a quien tenga
    // delante, con su agenda y su dinero. Si pudieras apagarle la app no serías
    // su casero, serías su jefe — y entonces no es un alquiler.
    //
    // Prometerle al dueño un poder que el servidor le va a negar es la forma más
    // rápida de que deje de creerse los avisos que sí son ciertos.
    const esAutonomo = modalidad === 'barbero_renta'
    Alert.alert('Suspender temporalmente',
      esAutonomo
        ? `Sale de la fila y de la fachada del local: nadie podrá pedirle turno ni reservarle cita por la app. Paga su asiento, así que su agenda y sus clientes siguen siendo suyos y puede seguir atendiendo a quien tenga delante. Para sacarlo del local, desvincular.`
        : `Deja de entrarle trabajo: nadie podrá pedirle turno ni reservarle cita, y él no podrá llamar ni atender. Sus citas ya reservadas y su fila NO se tocan — para eso está desvincular.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Suspender', style: 'destructive', onPress: async () => {
          setSuspBusy(true)
          try {
            await suspenderBarbero(perfil, true, 'no está atendiendo por ahora')
            if (perfilRow?.usuario_id) {
              enviarPush(perfilRow.usuario_id, 'Te suspendieron temporalmente',
                esAutonomo
                  ? 'Saliste de la fila del local. Tu agenda y tus clientes siguen siendo tuyos.'
                  : 'No te entrarán turnos ni citas hasta que el local te reanude.', { tipo: 'agenda' })
            }
            await cargar()
          }
          catch (e: any) { Alert.alert('No se pudo', e.message ?? 'Intenta de nuevo.') }
          finally { setSuspBusy(false) }
        } },
      ])
  }

  /**
   * CEDERLE —O QUITARLE— EL PODER DE DARSE TRABAJO (migración 107).
   *
   * «Solo acepta clientes por su cuenta si le dan permiso.» Por defecto el
   * empleado recibe lo que el local le manda: no llama al siguiente de la fila
   * ni sienta a quien entra por la puerta. Hay locales donde eso es justo al
   * revés —el dueño no está en el salón— y por eso el permiso existe.
   *
   * No se ofrece al AUTÓNOMO: quien paga su asiento manda en su silla sin que
   * nadie se lo conceda, y enseñarle un interruptor al dueño le haría creer que
   * puede apagarle el negocio a su inquilino. El servidor ya lo tiene decidido
   * en `turno_capta_por_su_cuenta`, que para él contesta que sí siempre.
   *
   * El push no es un adorno: el barbero ve el permiso al recargar la pantalla,
   * y sin aviso se pasa la mañana sin saber que ya puede llamar.
   */
  function cambiarCaptacion() {
    const dar = !perfilRow?.acepta_por_su_cuenta
    Alert.alert(
      dar ? 'Dejar que se sirva de la fila' : 'Quitarle ese permiso',
      dar
        ? `${nombre || 'Este barbero'} podrá llamar al siguiente de la fila y sentar a quien llegue sin cita, sin esperar a que se lo asignes. El orden de la fila no cambia: sigue siendo el que ve el cliente.`
        : `${nombre || 'Este barbero'} vuelve a recibir solo lo que le asignen: atiende al cliente que tenga delante, pero no llama al siguiente ni sienta a nadie por su cuenta.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: dar ? 'Darle el permiso' : 'Quitárselo', onPress: async () => {
          setCaptaBusy(true)
          try {
            await permitirCaptarSolo(perfil, dar)
            if (perfilRow?.usuario_id) {
              enviarPush(perfilRow.usuario_id,
                dar ? 'Ya puedes llamar tú' : 'El local reparte el trabajo',
                dar
                  ? 'Puedes llamar al siguiente de la fila y atender a quien llegue sin cita.'
                  : 'A partir de ahora te llega el trabajo asignado: atiende al que tengas delante.',
                { tipo: 'agenda' })
            }
            await cargar()
          } catch (e: any) { Alert.alert('No se pudo', e.message ?? 'Intenta de nuevo.') }
          finally { setCaptaBusy(false) }
        } },
      ])
  }

  function desvincular() {
    Alert.alert('Desvincular del local',
      `¿Sacar a ${nombre || 'este barbero'} del local? Se cancelan sus citas futuras y sale de la fila. Su historial y su clientela lo acompañan a donde vaya.`,
      [{ text: 'No' }, { text: 'Sí, desvincular', style: 'destructive', onPress: async () => {
        try {
          await desvincularBarbero(perfil)
          if (perfilRow?.usuario_id) {
            enviarPush(perfilRow.usuario_id, 'Te desvincularon', 'Ya no atiendes en este local.', { tipo: 'agenda' })
          }
          router.back()
        } catch (e: any) { Alert.alert('Error', e.message ?? 'Intenta de nuevo.') }
      } }])
  }

  // Deslizar desde el borde izquierdo vuelve atrás (components/gestos.tsx).
  // Antes de las guardas a la fuerza: los hooks se cuentan por orden, y uno que
  // solo se llama cuando la ficha ya cargó tumba la pantalla al cargar.
  const volver = useGestoVolver()

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>
  if (fallo) return (
    <View style={s.center}>
      <NoCargo que="la ficha de esta persona" onReintentar={() => { setLoading(true); cargar() }} />
    </View>
  )

  const autonomo = modalidad === 'barbero_renta'
  /**
   * EDITARLE LO SUYO SOLO SI CONSTA QUE ES EMPLEADO.
   *
   * Los controles de edición se abrían con `!autonomo`, y eso incluye el caso
   * "todavía no sé qué es". Si `getRolDePerfil` falla —lleva su
   * `.catch(() => null)`— la pantalla daba por empleado a alguien que puede
   * estar pagando por su asiento, y le ofrecía al administrador tocarle los
   * servicios y el horario. El servidor lo niega desde la migración 92, así que
   * el cambio se deshace solo y sin explicación.
   *
   * En la duda no se abre: hace falta que conste que es empleado.
   */
  const puedoEditarle = modalidad === 'empleado'
  const localDeAlquiler = tipoLocal === 'espacios_rentados'

  return (
    <View style={s.pantalla} {...volver}><ScrollView style={s.container} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 40 }}>
      <TouchableOpacity style={s.volver} onPress={() => router.back()} accessibilityRole="button">
        <Ionicons name="chevron-back" size={20} color={COLORS.ink} /><Text style={s.volverT}>Equipo</Text>
      </TouchableOpacity>
      <View style={s.cabeza}>
        <Iniciales nombre={nombre || 'Barbero'} size={56} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.nombre} numberOfLines={2}>{nombre || 'Barbero'}</Text>
          {perfilRow?.suspendido
            ? <Estado texto="Suspendido · no le entra trabajo" color={COLORS.redText} />
            : <Text style={s.cabezaSub}>{autonomo ? 'Renta su silla' : puedoEditarle ? 'Empleado del local' : ' '}</Text>}
        </View>
      </View>

      {/* La modalidad la hereda del tipo del local, pero una barbería de
          EMPLEADOS puede alquilar un asiento suelto. Ese cambio es del dueño: el
          barbero nunca se lo concede a sí mismo.

          AL REVÉS NO (migración 98): en un local de asientos alquilados no se
          puede nombrar empleado a nadie, porque sería dirigirlo sin aportar
          nada a su app — allí cada silla paga la suya. El servidor lo rechaza;
          aquí ni se ofrece, que es distinto de ofrecerlo y dar error. Para tener
          empleados de verdad, se cambia la modalidad DEL LOCAL, y entonces la
          barbería pasa a pagar por ellos. */}
      <Rotulo style={{ marginBottom: 12 }}>Cómo trabaja aquí</Rotulo>
      {localDeAlquiler ? (
        <>
          <View style={s.modRow}>
            <View style={[t.chip, t.chipOn]}><Text style={[t.chipT, { color: '#fff' }]}>Renta su asiento</Text></View>
          </View>
          <Nota>
            Aquí alquilas asientos, así que cada barbero es su propio negocio: paga su silla y
            decide sus servicios, precios y horario. Si quieres tener empleados, cámbialo en
            Ajustes → Cómo trabaja tu local; el local pasa a pagar por ellos.
          </Nota>
        </>
      ) : (
        <>
          <View style={s.modRow}>
            <Chip texto="Empleado" activo={puedoEditarle} onPress={() => { if (!modBusy) aplicarModalidad('empleado') }} />
            <Chip texto="Renta su asiento" activo={autonomo} onPress={() => { if (!modBusy) aplicarModalidad('barbero_renta') }} />
            {modBusy && <ActivityIndicator size="small" color={COLORS.textMid} />}
          </View>
          <Nota>
            {autonomo
              ? 'Paga su asiento, así que sus servicios, precios y horario los decide él. Aquí solo los consultas.'
              : 'Es empleado del local: sus servicios, precios y jornada los pones tú.'}
          </Nota>
        </>
      )}

      <Rotulo accion={puedoEditarle ? '+ Agregar' : undefined} onAccion={() => abrirServicio()}>Servicios</Rotulo>
      {servicios.length === 0 && <Nota style={{ marginTop: 0 }}>Todavía no tiene servicios.</Nota>}
      {servicios.map((sv: any, i: number) => (
        <Fila key={sv.id} ultima={i === servicios.length - 1} apagada={!sv.activo}
          onPress={puedoEditarle ? () => abrirServicio(sv) : undefined}
          titulo={sv.nombre} meta={`${sv.duracion_min} min`}
          fin={
            <View style={s.finFila}>
              <Text style={[s.precio, !sv.activo && { color: COLORS.textLight }]}>{dinero(sv.precio)}</Text>
              {autonomo
                ? <Estado texto={sv.activo ? 'Activo' : 'Inactivo'} />
                : <Interruptor valor={!!sv.activo} onCambio={() => toggleSv(sv)} />}
            </View>
          } />
      ))}

      <Rotulo>Horario</Rotulo>
      {DIAS.map((d, i) => {
        const h = horarioDe(d.n); const abierto = h && h.activo
        return (
          <Fila key={d.n} ultima={i === DIAS.length - 1} titulo={d.l}
            onPress={puedoEditarle ? () => abrirHorario(d.n) : undefined}
            fin={
              <View style={s.finFila}>
                <Text style={[s.hora, !abierto && { color: COLORS.textLight, fontFamily: FONTS.regular }]}>
                  {abierto ? `${hora12(h.hora_inicio)} – ${hora12(h.hora_fin)}` : 'Cerrado'}
                </Text>
                {puedoEditarle && <Flecha />}
              </View>
            } />
        )
      })}

      {/* LO QUE DICEN SUS CLIENTES. El dueño reparte trabajo y decide a quién
          sube el precio o a quién manda a formarse: sin leer esto lo hace a
          ciegas, y las reseñas llevaban desde el principio guardándose para
          nadie. */}
      <Rotulo>Sus clientes</Rotulo>
      <Fila ultima onPress={() => setVerResenas(true)}
        inicio={<IconoFila icono="star-outline" />}
        titulo="Reseñas de sus clientes"
        meta="Promedio, reparto de estrellas y lo que escribieron."
        fin={<Flecha />} />

      <Resenas perfilId={perfil} nombre={nombre} visible={verResenas} onClose={() => setVerResenas(false)} />

      {/* ── LO QUE SE DECIDE SOBRE ESTA PERSONA ─────────────────────────────
          Las dos juntas y en este orden a propósito: suspender es lo que casi
          siempre se quiere —dos días, una semana— y desvincular es la que no
          tiene vuelta. Cada una dice lo que hace ANTES de tocarla. */}
      <Rotulo>Su sitio en el local</Rotulo>

      {/* QUIÉN LE DA EL TRABAJO (migración 107).
          Solo para el empleado: el autónomo manda en su silla y aquí no hay
          nada que conceder. Va antes que suspender porque es la decisión del
          día a día; las otras dos son las de "esta persona se va". */}
      {puedoEditarle && (
        <Fila onPress={captaBusy ? undefined : cambiarCaptacion}
          inicio={<IconoFila icono={perfilRow?.acepta_por_su_cuenta ? 'megaphone' : 'megaphone-outline'}
            color={perfilRow?.acepta_por_su_cuenta ? COLORS.success : COLORS.ink} />}
          titulo={perfilRow?.acepta_por_su_cuenta ? 'Se sirve de la fila él mismo' : 'Le asignas tú el trabajo'}
          meta={perfilRow?.acepta_por_su_cuenta
            ? 'Puede llamar al siguiente y atender a quien llegue sin cita. Toca para quitárselo.'
            : 'Atiende al cliente que tenga delante, pero no llama ni sienta a nadie por su cuenta. Toca para dejarle.'}
          fin={captaBusy ? <ActivityIndicator color={COLORS.textMid} /> : <Flecha />} />
      )}

      <Fila ultima onPress={suspBusy ? undefined : cambiarSuspension}
        inicio={<IconoFila icono={perfilRow?.suspendido ? 'play-circle-outline' : 'pause-circle-outline'}
          color={perfilRow?.suspendido ? COLORS.success : COLORS.ink} />}
        titulo={perfilRow?.suspendido ? 'Reanudar' : 'Suspender temporalmente'}
        meta={perfilRow?.suspendido
          ? 'Ahora mismo no le entra trabajo. Toca para que vuelva a recibir turnos y citas.'
          : 'Deja de entrarle trabajo sin sacarlo del local. Sus citas y su fila no se tocan.'}
        fin={suspBusy ? <ActivityIndicator color={COLORS.textMid} /> : <Flecha />} />

      <Boton tipo="destructive" icono="person-remove-outline" texto="Desvincular del local" onPress={desvincular} style={{ marginTop: 22 }} />
      <Nota>Se cancelan sus citas futuras y sale de la fila. No tiene vuelta atrás.</Nota>

      <Hoja visible={!!svModal} onClose={() => setSvModal(null)}>
            <Titulo>{svModal === 'nuevo' ? 'Nuevo servicio' : 'Editar servicio'}</Titulo>
            <Etiqueta>Nombre</Etiqueta>
            <Campo value={svNombre} onChangeText={setSvNombre} placeholder="Corte, barba…" />
            <View style={s.dos}>
              <View style={{ flex: 1 }}>
                <Etiqueta>Duración (min)</Etiqueta>
                <Campo mono value={svDur} onChangeText={setSvDur} keyboardType="number-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Etiqueta>Precio</Etiqueta>
                <Campo mono value={svPrecio} onChangeText={setSvPrecio} keyboardType="number-pad" />
              </View>
            </View>
            <Boton texto="Guardar" onPress={guardarServicio} ocupado={svBusy} style={{ marginTop: 20 }} />
            <AhoraNo texto="Cancelar" onPress={() => setSvModal(null)} />
      </Hoja>

      <Hoja visible={!!hrModal} onClose={() => setHrModal(null)}>
            <Titulo>{DIAS.find(d => d.n === hrModal?.n)?.l ?? ''}</Titulo>
            <Etiqueta>Abre</Etiqueta>
            <Paso valor={hora12(`${String(hrIni).padStart(2, '0')}:00`)} menos={() => setHrIni(Math.max(0, hrIni - 1))} mas={() => setHrIni(Math.min(23, hrIni + 1))} />
            <Etiqueta>Cierra</Etiqueta>
            <Paso valor={hora12(`${String(hrFin).padStart(2, '0')}:00`)} menos={() => setHrFin(Math.max(hrIni + 1, hrFin - 1))} mas={() => setHrFin(Math.min(24, hrFin + 1))} />
            <Etiqueta>Minutos entre clientes</Etiqueta>
            <Paso valor={`${hrBuf} min`} menos={() => setHrBuf(Math.max(0, hrBuf - 5))} mas={() => setHrBuf(Math.min(60, hrBuf + 5))} />
            <Boton texto="Guardar" onPress={() => aplicarHorario(true)} ocupado={hrBusy} style={{ marginTop: 20 }} />
            <Boton tipo="destructive" texto="Marcar cerrado este día" onPress={() => aplicarHorario(false)} disabled={hrBusy} style={{ marginTop: 10 }} />
            <AhoraNo texto="Cancelar" onPress={() => setHrModal(null)} />
      </Hoja>
    </ScrollView></View>
  )
}

const s = StyleSheet.create({
  pantalla: { flex: 1 },
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  volver: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 14, alignSelf: 'flex-start' },
  volverT: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  cabeza: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 4 },
  nombre: { fontFamily: FONTS.bold, fontSize: 28, letterSpacing: -0.6, color: COLORS.ink },
  cabezaSub: { fontFamily: FONTS.regular, fontSize: 14, color: COLORS.textMid, marginTop: 2 },
  modRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  finFila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  precio: { fontFamily: FONTS.mono, fontSize: 15, color: COLORS.ink },
  hora: { fontFamily: FONTS.monoMedium, fontSize: 13, color: COLORS.ink },
  dos: { flexDirection: 'row', gap: 12 },
})
