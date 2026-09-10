import { BackHandler, View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Switch, TextInput, Alert } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getSesion, guardarSesion, limpiarSesion } from '../../../lib/storage'
import { getConfiguracion, updateConfiguracion, getNegocioById, actualizarNegocio, getAsientosNegocio, cerrarLocal, cambiarTipoNegocio } from '../../../lib/db'
import { elegirYSubirImagen } from '../../../lib/imagenes'
import { cerrarSesion } from '../../../lib/auth'
import { planDueno } from '../../../lib/pricing'
import { PAISES, MONEDAS, paisDe } from '../../../lib/paises'
import { SUSCRIPCION, COLORS, FONTS } from '../../../constants'
import { Display, Avatar } from '../../../components/ui'
import CambiarRol from '../../../components/cambiar-rol'
import PanelBadge from '../../../components/panel-badge'

export default function Config() {
  const router = useRouter()
  // La pantalla era una tira de secciones seguidas —marca, suscripción,
  // modalidad, funciones, tiempos, cuenta— y había que bajarla entera para ver
  // cómo estaba puesto el local. El panel del barbero ya tenía resuelto esto:
  // un menú donde cada fila LLEVA SU VALOR debajo, y la sección se abre encima.
  // El menú se lee de un vistazo y hace de resumen.
  const [seccion, setSeccion] = useState<string | null>(null)
  const [negocioId, setNegocioId] = useState<string | null>(null)
  const [config, setConfig] = useState<any>(null)
  const [negocio, setNegocio] = useState<any>(null)
  const [tipoBusy, setTipoBusy] = useState(false)
  const [premio, setPremio] = useState('')

  async function guardarPremio() {
    if (!negocioId) return
    const v = premio.trim() || 'Corte gratis'
    setPremio(v)
    try { await updateConfiguracion(negocioId, { premio: v }) }
    catch (e: any) { Alert.alert('No se pudo guardar', e.message ?? 'Intenta de nuevo.') }
  }
  const [asientos, setAsientos] = useState(0)
  const [loading, setLoading] = useState(true)
  // marca / contacto del local
  const [nombre, setNombre] = useState(''); const [slogan, setSlogan] = useState('')
  const [direccion, setDireccion] = useState(''); const [telefono, setTelefono] = useState(''); const [ig, setIg] = useState('')
  // Dónde queda y en qué cobra (migración 80).
  const [pais, setPais] = useState('DO'); const [ciudad, setCiudad] = useState('')
  const [sector, setSector] = useState(''); const [referencia, setReferencia] = useState('')
  const [moneda, setMoneda] = useState('DOP')
  const [guardandoMarca, setGuardandoMarca] = useState(false)
  const [subiendoLogo, setSubiendoLogo] = useState(false)

  const cargar = useCallback(async () => {
    const ss = await getSesion()
    if (!ss?.negocio_id) { setLoading(false); return }
    setNegocioId(ss.negocio_id)
    const [cfg, neg, asi] = await Promise.all([
      getConfiguracion(ss.negocio_id).catch(() => null),
      getNegocioById(ss.negocio_id).catch(() => null),
      getAsientosNegocio(ss.negocio_id).catch(() => 0),
    ])
    setConfig(cfg); setNegocio(neg); setAsientos(asi); setPremio((cfg as any)?.premio ?? 'Corte gratis')
    setNombre(neg?.nombre ?? ''); setSlogan(neg?.slogan ?? '')
    setDireccion(neg?.direccion ?? ''); setTelefono(neg?.telefono ?? ''); setIg(neg?.instagram ?? '')
    setPais(neg?.pais ?? 'DO'); setCiudad(neg?.ciudad ?? ''); setSector(neg?.sector ?? '')
    setReferencia(neg?.referencia ?? ''); setMoneda(neg?.moneda ?? 'DOP')
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])


  /** Cambiar la modalidad realinea a todo el equipo: dejar a la mitad con las
   *  reglas viejas sería peor que no cambiar nada. Por eso se avisa antes. */
  function pedirCambioTipo(tipo: 'empleados' | 'espacios_rentados') {
    if (!negocioId || negocio?.tipo === tipo) return
    const aEmpleados = tipo === 'empleados'
    Alert.alert(
      aEmpleados ? 'Pasar a empleados' : 'Pasar a asientos alquilados',
      aEmpleados
        ? 'Todo tu equipo pasa a ser empleado: a partir de ahora los servicios, los precios y los horarios los pones tú, y cubres su suscripción.'
        : 'Todo tu equipo pasa a pagar su asiento: cada barbero decidirá sus servicios, sus precios y su horario, y pagará su propia suscripción.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cambiar', onPress: async () => {
          setTipoBusy(true)
          try { await cambiarTipoNegocio(negocioId, tipo); setNegocio((n: any) => ({ ...n, tipo })) }
          catch (e: any) { Alert.alert('No se pudo cambiar', e.message ?? 'Intenta de nuevo.') }
          finally { setTipoBusy(false) }
        } },
      ])
  }

  async function cambiarLogo() {
    if (!negocioId) return
    setSubiendoLogo(true)
    try {
      const url = await elegirYSubirImagen('logos', negocioId)
      if (url) { await actualizarNegocio(negocioId, { logo_url: url }); setNegocio((n: any) => ({ ...n, logo_url: url })) }
    } catch (e: any) { Alert.alert('No se pudo subir el logo', e.message ?? 'Intenta de nuevo.') }
    finally { setSubiendoLogo(false) }
  }
  async function guardarMarca() {
    if (!negocioId) return
    if (!nombre.trim()) { Alert.alert('Falta el nombre', 'El local necesita un nombre.'); return }
    setGuardandoMarca(true)
    try {
      await actualizarNegocio(negocioId, {
        nombre: nombre.trim(), slogan: slogan.trim(), direccion: direccion.trim(),
        telefono: telefono.trim(), instagram: ig.trim().replace(/^@/, ''),
        pais, ciudad: ciudad.trim(), sector: sector.trim(), referencia: referencia.trim(),
        // La zona horaria viaja con el país: de ella depende que el servidor
        // sepa si la fila está abierta, y nadie va a ir a buscarla a un ajuste
        // aparte llamado "tz".
        moneda, tz: paisDe(pais)?.tz ?? 'America/Santo_Domingo',
      })
      Alert.alert('Marca actualizada', 'Los cambios ya son visibles para tus clientes.')
    } catch (e: any) { Alert.alert('No se pudo guardar', e.message ?? 'Intenta de nuevo.') }
    finally { setGuardandoMarca(false) }
  }

  async function toggle(campo: string, valor: boolean) {
    if (!negocioId) return
    setConfig((c: any) => ({ ...c, [campo]: valor }))
    await updateConfiguracion(negocioId, { [campo]: valor }).catch(() => cargar())
  }
  async function ajustar(campo: string, delta: number, min: number, max: number) {
    if (!negocioId || !config) return
    const v = Math.max(min, Math.min(max, (config[campo] ?? 0) + delta))
    setConfig((c: any) => ({ ...c, [campo]: v }))
    await updateConfiguracion(negocioId, { [campo]: v }).catch(() => cargar())
  }
  function salir() {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir? Necesitarás un código nuevo para volver a entrar.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: async () => {
        await cerrarSesion(); await limpiarSesion(); router.replace('/(auth)/login')
      } },
    ])
  }

  function cerrarEsteLocal() {
    if (!negocioId) return
    Alert.alert('Cerrar local',
      'El local dejará de aparecer, se cancelarán las citas futuras y se vaciará la fila. Se avisará a clientes y equipo. Esta acción no debe tomarse a la ligera.',
      [{ text: 'Cancelar' }, { text: 'Cerrar local', style: 'destructive', onPress: async () => {
        try { await cerrarLocal(negocioId); await cerrarSesion(); await limpiarSesion(); router.replace('/(auth)/login') }
        catch (e: any) { Alert.alert('Error', e.message ?? 'Intenta de nuevo.') }
      } }])
  }

  // El atrás de Android vuelve al menú, no fuera de Configuración.
  //
  // VA ANTES DEL `if (loading)`: en el panel del barbero este mismo hook estuvo
  // debajo y tumbaba la pantalla ("algo salió mal"). Mientras cargaba se salía
  // por el return y el hook no se registraba; al terminar, React encontraba un
  // hook más que en el render anterior. Se cuentan por orden: ninguno puede
  // quedar detrás de un return condicional.
  useEffect(() => {
    if (!seccion) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setSeccion(null); return true })
    return () => sub.remove()
  }, [seccion])

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>

  // La modalidad decide qué controles tiene sentido enseñar aquí: en un local
  // de asientos alquilados el dueño no manda sobre los puntos ni sobre a quién
  // le toca cada cliente.
  const esRentado = negocio?.tipo === 'espacios_rentados'
  const plan = planDueno(asientos)

  const TITULO: Record<string, string> = {
    marca: 'Marca y contacto', suscripcion: 'Suscripción', modalidad: 'Cómo trabaja tu local',
    funciones: 'Funciones del local', tiempos: 'Tiempos', otros: 'Otros',
  }

  // El valor de cada fila: es lo que convierte el menú en un resumen del local.
  const MENU = [
    { k: 'marca', t: 'Marca y contacto', icono: 'storefront-outline',
      v: [negocio?.nombre, negocio?.direccion].filter(Boolean).join(' · ') || 'Sin datos todavía' },
    { k: 'suscripcion', t: 'Suscripción', icono: 'card-outline',
      v: `${plan.montoTexto} · ${asientos} asiento${asientos === 1 ? '' : 's'}` },
    { k: 'modalidad', t: 'Cómo trabaja tu local', icono: 'people-outline',
      v: esRentado ? 'Alquilo asientos' : 'Tengo empleados' },
    { k: 'funciones', t: 'Funciones del local', icono: 'options-outline',
      v: esRentado
        ? (config?.doble_servicio_activo ? 'Doble servicio activo' : 'Doble servicio apagado')
        : [config?.puntos_activos ? `Puntos cada ${config?.visitas_para_gratis ?? 8}` : 'Sin puntos',
           config?.asignacion_por_dueno ? 'Tú asignas' : 'Elige el cliente'].join(' · ') },
    // TIEMPOS SOLO CON EMPLEADOS. Reportado: "no debería aparecer cuando la
    // barbería trabaja bajo alquiler de asientos". Y es correcto: ahí cada
    // barbero es un negocio aparte y pone los suyos desde su configuración, así
    // que estos números no mandaban sobre nadie. Un ajuste que no decide nada
    // enseña al dueño a desconfiar de los que sí deciden.
    ...(esRentado ? [] : [{ k: 'tiempos', t: 'Tiempos', icono: 'time-outline',
      v: `${config?.anticipacion_minima_horas ?? 2} h para reservar · ${config?.ventana_llegada_min ?? 10} min para llegar` }]),
    { k: 'otros', t: 'Otros', icono: 'ellipsis-horizontal',
      v: 'Cerrar sesión, cerrar el local' },
  ]

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingTop: 72, paddingBottom: 32 }}>
      <PanelBadge />

      {seccion === null ? (
        <>
          <Display size={30} style={{ marginBottom: 18 }}>Configuración</Display>
          {MENU.map(m => (
            <TouchableOpacity key={m.k} style={s.menuFila} onPress={() => setSeccion(m.k)}>
              <View style={s.menuIcono}><Ionicons name={m.icono as any} size={18} color="#fff" /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.menuT}>{m.t}</Text>
                <Text style={s.menuV} numberOfLines={1}>{m.v}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
            </TouchableOpacity>
          ))}
          {/* Cambiar de panel es navegación, no configuración: va en la raíz. */}
          <CambiarRol />
        </>
      ) : (
        <TouchableOpacity style={s.volver} onPress={() => setSeccion(null)}>
          <Ionicons name="chevron-back" size={20} color={COLORS.textMid} />
          <Text style={s.volverT}>Configuración</Text>
        </TouchableOpacity>
      )}
      {seccion && <Display size={28} style={{ marginBottom: 16 }}>{TITULO[seccion]}</Display>}

      {seccion === 'marca' && (<>
      <View style={s.marcaCard}>
        <View style={s.marcaTop}>
          <TouchableOpacity onPress={cambiarLogo} disabled={subiendoLogo} activeOpacity={0.85}>
            <Avatar name={negocio?.nombre} uri={negocio?.logo_url} size={72} bg={COLORS.carbon} />
            <View style={s.logoBadge}>
              {subiendoLogo ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.logoBadgeT}>✎</Text>}
            </View>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.marcaHint}>Toca el logo para cambiarlo.</Text>
            <Text style={s.flabel}>Nombre del local</Text>
            <TextInput style={s.input} placeholder="Barbería…" placeholderTextColor={COLORS.textLight} value={nombre} onChangeText={setNombre} />
          </View>
        </View>

        <Text style={s.flabel}>Eslogan</Text>
        <TextInput style={s.input} placeholder="Tu frase de marca" placeholderTextColor={COLORS.textLight} value={slogan} onChangeText={setSlogan} />

        {/* LA DIRECCIÓN, POR PARTES. Era un solo campo de texto libre —"calle,
            sector, ciudad"— y cada dueño escribía lo que le parecía. Aquí una
            dirección sin sector no ubica a nadie, y el punto de referencia es
            literalmente cómo llega el cliente: por eso son campos y no una
            frase. Ver migración 80. */}
        <Text style={s.flabel}>Calle y número</Text>
        <TextInput style={s.input} placeholder="Av. Duarte 45" placeholderTextColor={COLORS.textLight} value={direccion} onChangeText={setDireccion} />

        <View style={s.dosCol}>
          <View style={{ flex: 1 }}>
            <Text style={s.flabel}>Sector</Text>
            <TextInput style={s.input} placeholder="Los Jardines" placeholderTextColor={COLORS.textLight} value={sector} onChangeText={setSector} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.flabel}>Ciudad</Text>
            <TextInput style={s.input} placeholder="Santiago" placeholderTextColor={COLORS.textLight} value={ciudad} onChangeText={setCiudad} />
          </View>
        </View>

        <Text style={s.flabel}>Punto de referencia</Text>
        <TextInput style={s.input} placeholder="Frente al colmado, subiendo la loma…" placeholderTextColor={COLORS.textLight} value={referencia} onChangeText={setReferencia} />

        <Text style={s.flabel}>País</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 2 }} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
          {PAISES.map(p => (
            <TouchableOpacity key={p.codigo} style={[s.pill, pais === p.codigo && s.pillOn]}
              onPress={() => { setPais(p.codigo); setMoneda(p.moneda) }}>
              <Text style={[s.pillT, pais === p.codigo && { color: '#fff' }]}>{p.nombre}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* La moneda se propone con el país y se puede cambiar: hay locales que
            cobran en dólares en sitios donde la moneda es otra. */}
        <Text style={s.flabel}>Moneda</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
          {MONEDAS.map(m => (
            <TouchableOpacity key={m.codigo} style={[s.pill, moneda === m.codigo && s.pillOn]} onPress={() => setMoneda(m.codigo)}>
              <Text style={[s.pillT, moneda === m.codigo && { color: '#fff' }]}>{m.etiqueta}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={s.dosCol}>
          <View style={{ flex: 1 }}>
            <Text style={s.flabel}>Teléfono</Text>
            <TextInput style={s.input} placeholder="+1 809…" keyboardType="phone-pad" placeholderTextColor={COLORS.textLight} value={telefono} onChangeText={setTelefono} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.flabel}>Instagram</Text>
            <TextInput style={s.input} placeholder="usuario" autoCapitalize="none" placeholderTextColor={COLORS.textLight} value={ig} onChangeText={setIg} />
          </View>
        </View>

        <TouchableOpacity style={s.guardarBtn} onPress={guardarMarca} disabled={guardandoMarca}>
          {guardandoMarca ? <ActivityIndicator color="#fff" /> : <Text style={s.guardarT}>Guardar marca</Text>}
        </TouchableOpacity>
      </View>
      </>)}

      {seccion === 'suscripcion' && (
        <>
          <View style={s.susCard}>
            <View style={s.susTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.susTitulo}>{plan.titulo}</Text>
                <Text style={s.susDetalle}>{plan.detalle}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.susMonto}>{plan.montoTexto}</Text>
                {plan.topado ? <Text style={s.susTope}>tope</Text> : null}
              </View>
            </View>
            <View style={s.susFoot}>
              <Text style={s.susFootT}>Asientos: {asientos} · {SUSCRIPCION.moneda} {SUSCRIPCION.minimo} c/u, tope {SUSCRIPCION.moneda} {SUSCRIPCION.maximo}</Text>
            </View>
            <Text style={s.susNota}>El pago dentro de la app se habilitará próximamente.</Text>
          </View>
        </>
      )}

      {/* De esta elección cuelga quién decide precios y horarios de todo el
          equipo (R11). Se hacía una sola vez en el onboarding y no se podía
          deshacer: equivocarse dejaba el local atrapado. */}
      {seccion === 'modalidad' && (<>
      <View style={s.modRow}>
        <TouchableOpacity style={[s.modChip, negocio?.tipo === 'espacios_rentados' && s.modChipOn]}
          onPress={() => pedirCambioTipo('espacios_rentados')} disabled={tipoBusy}>
          <Text style={[s.modChipT, negocio?.tipo === 'espacios_rentados' && { color: '#fff' }]}>Alquilo asientos</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.modChip, negocio?.tipo === 'empleados' && s.modChipOn]}
          onPress={() => pedirCambioTipo('empleados')} disabled={tipoBusy}>
          <Text style={[s.modChipT, negocio?.tipo === 'empleados' && { color: '#fff' }]}>Tengo empleados</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.modNota}>
        {negocio?.tipo === 'empleados'
          ? 'Tus barberos trabajan para ti: los servicios, los precios y el horario los pones tú, y cubres su suscripción.'
          : 'Cada barbero paga su asiento y trabaja con sus reglas: pone sus servicios, sus precios y su horario, y paga su suscripción.'}
      </Text>
      </>)}

      {/* En un local de asientos alquilados el dueño NO manda sobre los puntos
          ni sobre a quién le toca cada cliente: cada barbero es un negocio
          aparte, con su clientela y sus reglas. Enseñar esos interruptores ahí
          no es solo ruido — hace creer que deciden algo que no deciden. */}
      {seccion === 'funciones' && (<>
      {esRentado && (
        <Text style={s.modNota}>
          Alquilas asientos, así que los puntos y la asignación de clientes los lleva cada barbero desde su propia configuración. Aquí solo quedan las que sí son del local.
        </Text>
      )}
      {!esRentado && <Toggle label="Sistema de puntos" desc="Clientes acumulan y canjean puntos" value={!!config?.puntos_activos} onChange={(v) => toggle('puntos_activos', v)} />}
      {/* Sin estos dos números el interruptor no hacía nada: el trigger exige
          puntos_por_visita > 0 y el canje exige la meta. El dueño encendía los
          puntos y el cliente no veía sumar ni uno. */}
      {/* Se cuentan recortes, no puntos abstractos: "cada X recortes te ganas
          esto". Y el premio lo escribe el local — no tiene por qué ser un corte
          gratis; puede ser una barba, un refresco o lo que quiera regalar. */}
      {!esRentado && !!config?.puntos_activos && (
        <>
          <Stepper label="Recortes para el premio"
            desc={`Cada ${config?.visitas_para_gratis ?? 8} visitas, el cliente se gana el premio.`}
            suf="recortes"
            value={config?.visitas_para_gratis ?? 8}
            onMinus={() => ajustar('visitas_para_gratis', -1, 2, 50)} onPlus={() => ajustar('visitas_para_gratis', 1, 2, 50)} />
          <Text style={s.flabel}>¿Qué se gana?</Text>
          <TextInput style={s.input} value={premio} onChangeText={setPremio}
            onEndEditing={() => guardarPremio()} placeholder="Corte gratis, barba gratis, un refresco…"
            placeholderTextColor={COLORS.textLight} maxLength={60} />
        </>
      )}
      {!esRentado && <Toggle label="Asignación por dueño" desc="Tú asignas el barbero; el cliente no elige" value={!!config?.asignacion_por_dueno} onChange={(v) => toggle('asignacion_por_dueno', v)} />}
      <Toggle label="Doble servicio por visita" desc="Permite combinar corte + manicure" value={!!config?.doble_servicio_activo} onChange={(v) => toggle('doble_servicio_activo', v)} />
      </>)}

      {seccion === 'tiempos' && !esRentado && (<>
      <Text style={s.modNota}>
        Valen para todo tu equipo: son tus empleados y estas reglas son las del local.
      </Text>
      <Stepper label="Reservar con antelación"
        desc={`Nadie puede pedir una cita para dentro de menos de ${config?.anticipacion_minima_horas ?? 2} horas.`}
        suf="h" value={config?.anticipacion_minima_horas ?? 2} onMinus={() => ajustar('anticipacion_minima_horas', -1, 0, 48)} onPlus={() => ajustar('anticipacion_minima_horas', 1, 0, 48)} />
      <Stepper label="Tiempo para llegar"
        desc={`Cuando llamas a alguien de la fila, tiene ${config?.ventana_llegada_min ?? 10} minutos para aparecer antes de perder el turno.`}
        suf="min" value={config?.ventana_llegada_min ?? 10} onMinus={() => ajustar('ventana_llegada_min', -5, 5, 60)} onPlus={() => ajustar('ventana_llegada_min', 5, 5, 60)} />
      <Stepper label="Tolerancia de retraso"
        desc={`Esperas ${config?.gracia_cita_min ?? 5} minutos a quien tiene cita antes de darla por perdida.`}
        suf="min" value={config?.gracia_cita_min ?? 5} onMinus={() => ajustar('gracia_cita_min', -5, 0, 30)} onPlus={() => ajustar('gracia_cita_min', 5, 0, 30)} />
      </>)}

      {/* CUENTA, con la misma composición que en el panel del barbero: cada
          acción con su icono, su nombre y UNA LÍNEA QUE DICE QUÉ PASA. Eran dos
          botones sueltos —un texto rojo centrado y una caja roja— y ninguno
          contaba las consecuencias antes de tocarlo. */}
      {seccion === 'otros' && (<>
      <Text style={[s.sec, { marginTop: 18 }]}>CUENTA</Text>

      <TouchableOpacity style={s.cuentaFila} onPress={salir}>
        <View style={s.cuentaIcono}><Ionicons name="log-out-outline" size={18} color={COLORS.textMid} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.cuentaT}>Cerrar sesión</Text>
          <Text style={s.cuentaD}>Tu local, tu equipo y tus clientes siguen igual. Para volver a entrar necesitas un código nuevo.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
      </TouchableOpacity>

      <Text style={[s.sec, { marginTop: 22 }]}>SIN VUELTA ATRÁS</Text>
      <TouchableOpacity style={s.cuentaBorrar} onPress={cerrarEsteLocal}>
        <Ionicons name="trash-outline" size={18} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={s.cuentaBorrarT}>Cerrar este local</Text>
          <Text style={s.cuentaBorrarD}>Deja de aparecer, se cancelan las citas futuras y se vacía la fila. Se avisa a clientes y equipo. Los barberos que alquilan conservan su cuenta.</Text>
        </View>
      </TouchableOpacity>
      </>)}
    </ScrollView>
  )
}

function Toggle({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.toggle}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={s.toggleL}>{label}</Text>
        <Text style={s.toggleD}>{desc}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: COLORS.red, false: '#D8D6D1' }} thumbColor="#fff" />
    </View>
  )
}
function Stepper({ label, desc, value, suf, onMinus, onPlus }: { label: string; desc?: string; value: number; suf: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={s.stepper}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={s.toggleL}>{label}</Text>
        {desc ? <Text style={s.toggleD}>{desc}</Text> : null}
      </View>
      <View style={s.stepCtrl}>
        <TouchableOpacity style={s.stepBtn} onPress={onMinus}><Text style={s.stepBtnT}>−</Text></TouchableOpacity>
        <Text style={s.stepVal}>{value} {suf}</Text>
        <TouchableOpacity style={s.stepBtn} onPress={onPlus}><Text style={s.stepBtnT}>+</Text></TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginBottom: 12, marginTop: 14 },
  modRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  modChip: { flex: 1, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: COLORS.surface },
  modChipOn: { backgroundColor: COLORS.carbon, borderColor: COLORS.carbon },
  modChipT: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.ink },
  modNota: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, lineHeight: 17, marginBottom: 4 },
  marcaCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: 16, marginBottom: 4 },
  marcaTop: { flexDirection: 'row', gap: 14, marginBottom: 4 },
  marcaHint: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginBottom: 8 },
  logoBadge: { position: 'absolute', right: -4, bottom: -4, width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.surface },
  logoBadgeT: { color: '#fff', fontSize: 13, fontFamily: FONTS.bold },
  flabel: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.textMid, marginBottom: 7, marginTop: 10 },
  input: { backgroundColor: COLORS.bg, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, padding: 13, fontSize: 15, fontFamily: FONTS.medium, color: COLORS.ink },
  dosCol: { flexDirection: 'row', gap: 10 },
  pill: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 999, paddingVertical: 9,
    paddingHorizontal: 14, backgroundColor: COLORS.surface },
  pillOn: { backgroundColor: COLORS.carbon, borderColor: COLORS.carbon },
  pillT: { fontFamily: FONTS.bold, fontSize: 13, color: COLORS.ink },
  guardarBtn: { backgroundColor: COLORS.carbon, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 16 },
  guardarT: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
  susCard: { backgroundColor: COLORS.carbon, borderRadius: 16, padding: 18, marginBottom: 4 },
  susTop: { flexDirection: 'row', alignItems: 'flex-start' },
  susTitulo: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
  susDetalle: { fontFamily: FONTS.medium, fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4, paddingRight: 10 },
  susMonto: { fontFamily: FONTS.display, fontSize: 24, color: '#fff' },
  susTope: { fontFamily: FONTS.bold, fontSize: 10, color: COLORS.red, letterSpacing: 1 },
  susFoot: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', marginTop: 14, paddingTop: 12 },
  susFootT: { fontFamily: FONTS.medium, fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  susNota: { fontFamily: FONTS.medium, fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 8 },
  toggle: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 16, marginBottom: 8 },
  toggleL: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  toggleD: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, marginBottom: 8 },
  stepCtrl: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  stepBtnT: { fontFamily: FONTS.bold, fontSize: 20, color: COLORS.ink },
  stepVal: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink, minWidth: 56, textAlign: 'center' },
  // Menú y cuenta: LOS MISMOS valores que en barbero/config.tsx. Es la misma
  // pantalla para otra persona, y verse distinta solo confunde a quien lleva
  // los dos paneles — que es justo el caso del dueño que también atiende.
  menuFila: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface,
    borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  menuIcono: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center' },
  menuT: { color: COLORS.ink, fontSize: 15, fontWeight: '700' },
  menuV: { color: COLORS.textMid, fontSize: 12.5, marginTop: 2 },
  volver: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 10 },
  volverT: { color: COLORS.textMid, fontSize: 14.5, fontWeight: '600' },
  cuentaFila: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, marginBottom: 8 },
  cuentaIcono: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  cuentaT: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  cuentaD: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.textMid, marginTop: 3, lineHeight: 17 },
  cuentaBorrar: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.red,
    borderRadius: 14, padding: 14, marginBottom: 16 },
  cuentaBorrarT: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
  cuentaBorrarD: { fontFamily: FONTS.medium, fontSize: 12.5, color: 'rgba(255,255,255,0.85)', marginTop: 3, lineHeight: 17 },
})
