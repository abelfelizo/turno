import { BackHandler, View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Alert, Share } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getSesion, guardarSesion, limpiarSesion } from '../../../lib/storage'
import { getConfiguracion, updateConfiguracion, getNegocioById, actualizarNegocio, getAsientosNegocio, getSuscripcion, cerrarLocal, cambiarTipoNegocio, type Suscripcion } from '../../../lib/db'
import { elegirYSubirImagen } from '../../../lib/imagenes'
import { cerrarSesion } from '../../../lib/auth'
import { estadoAvisos, registrarPush } from '../../../lib/notificaciones'
import { planDueno } from '../../../lib/pricing'
import { PAISES, MONEDAS, paisDe } from '../../../lib/paises'
import Selector from '../../../components/selector'
import { fechaLarga, fechaDeISO } from '../../../lib/format'
import { SUSCRIPCION, COLORS, FONTS } from '../../../constants'
import { Avatar, NoCargo } from '../../../components/ui'
import CambiarRol from '../../../components/cambiar-rol'
import PanelBadge from '../../../components/panel-badge'
import { Encabezado, Rotulo } from '../../../components/d2'
import { Fila, Flecha, Tarjeta, Boton, Chip, Nota, Estado, Punto, Interruptor, Etiqueta, Campo, IconoFila, Sobre } from '../../../components/turno-ui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function Config() {
  // El hueco de arriba lo dice el sistema, no un número: en un teléfono con
  // isla dinámica 72 px se quedaban cortos y en uno sin muesca sobraban.
  const insets = useSafeAreaInsets()
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
  const [fallo, setFallo] = useState(false)
  // marca / contacto del local
  const [nombre, setNombre] = useState(''); const [slogan, setSlogan] = useState('')
  const [direccion, setDireccion] = useState(''); const [telefono, setTelefono] = useState(''); const [ig, setIg] = useState('')
  // Dónde queda y en qué cobra (migración 80).
  const [pais, setPais] = useState('DO'); const [ciudad, setCiudad] = useState('')
  const [sector, setSector] = useState(''); const [referencia, setReferencia] = useState('')
  const [moneda, setMoneda] = useState('DOP')
  const [guardandoMarca, setGuardandoMarca] = useState(false)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const [suscripcion, setSuscripcion] = useState<Suscripcion | null>(null)

  // Igual que la configuración del barbero: ninguna llamada se tapa. Aquí el
  // formulario ES el local —nombre, dirección, teléfono, moneda— y cargarlo a
  // medias pone todos esos campos en blanco delante de un botón de guardar.
  // Además `negocio.tipo` decide media pantalla: sin él un local de alquiler
  // se ve como uno de empleados. Ver el comentario de `esRentado` más abajo.
  const cargar = useCallback(async () => {
   try {
    setFallo(false)
    const ss = await getSesion()
    if (!ss?.negocio_id) return
    setNegocioId(ss.negocio_id)
    const [cfg, neg, asi, sus] = await Promise.all([
      getConfiguracion(ss.negocio_id),
      getNegocioById(ss.negocio_id),
      getAsientosNegocio(ss.negocio_id),
      getSuscripcion(ss.negocio_id).catch(() => null),
    ])
    setConfig(cfg); setNegocio(neg); setAsientos(asi); setSuscripcion(sus)
    setPremio((cfg as any)?.premio ?? 'Corte gratis')
    setNombre(neg?.nombre ?? ''); setSlogan(neg?.slogan ?? '')
    setDireccion(neg?.direccion ?? ''); setTelefono(neg?.telefono ?? ''); setIg(neg?.instagram ?? '')
    setPais(neg?.pais ?? 'DO'); setCiudad(neg?.ciudad ?? ''); setSector(neg?.sector ?? '')
    setReferencia(neg?.referencia ?? ''); setMoneda(neg?.moneda ?? 'DOP')
   } catch {
    setFallo(true)
   } finally {
    setLoading(false)
   }
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
  if (fallo) return (
    <View style={s.center}>
      <NoCargo que="la configuración del local" onReintentar={() => { setLoading(true); cargar() }} />
    </View>
  )

  // La modalidad decide qué controles tiene sentido enseñar aquí: en un local
  // de asientos alquilados el dueño no manda sobre los puntos ni sobre a quién
  // le toca cada cliente.
  const esRentado = negocio?.tipo === 'espacios_rentados'
  /**
   * REGLAS DEL LOCAL: SOLO SI CONSTA QUE TIENE EMPLEADOS.
   *
   * Los interruptores de abajo se abrían con `!esRentado`, y eso incluye el
   * caso "todavía no sé de qué tipo es este local": `negocio` se carga con su
   * `.catch(() => null)` y, si falla, `esRentado` da falso. Un local de
   * alquiler se encontraba los puntos, la asignación de clientes y los tiempos
   * — tres reglas que en esa modalidad NO son suyas, las pone cada barbero. El
   * servidor las rechaza desde la 92 y la 98, así que el interruptor se movía
   * y volvía solo.
   *
   * Preguntar en positivo hace que la duda no abra nada: si no se sabe, no se
   * enseña ni un juego de reglas ni el otro.
   */
  const conEmpleados = negocio?.tipo === 'empleados'
  const plan = planDueno(asientos)

  const TITULO: Record<string, string> = {
    marca: 'Marca y contacto', codigo: 'Código del local', suscripcion: 'Suscripción', modalidad: 'Cómo trabaja tu local',
    funciones: 'Funciones del local', tiempos: 'Tiempos', otros: 'Cuenta',
  }
  // TRES GRUPOS, como en los Ajustes del barbero: lo que el local ES, cómo
  // TRABAJA, y la cuenta de quien lo lleva.
  const GRUPOS = [
    { k: 'local', l: 'El local' },
    { k: 'como', l: 'Cómo trabaja' },
    { k: 'cuenta', l: 'Tu cuenta' },
  ] as const

  // El valor de cada fila: es lo que convierte el menú en un resumen del local.
  const MENU = [
    { k: 'marca', g: 'local', t: 'Marca y contacto', icono: 'storefront-outline',
      v: [negocio?.nombre, negocio?.direccion].filter(Boolean).join(' · ') || 'Sin datos todavía' },
    // El código salió de la portada de Mi local: se comparte una vez y ocupaba
    // el primer sitio de la pantalla que se mira cincuenta veces al día.
    { k: 'codigo', g: 'local', t: 'Código del local', icono: 'qr-code-outline',
      v: `${negocio?.codigo_acceso ?? '—'} · para que entren clientes y barberos` },
    // EN ALQUILER NO SE ENSEÑA PRECIO. Este menú es el resumen del local —cada
    // fila lleva su valor debajo y se lee de un vistazo— así que poner aquí el
    // plan por asiento le cobraba de palabra al dueño que no paga nada, y
    // contradecía a su propia sección, que dice justo lo contrario.
    { k: 'suscripcion', g: 'local', t: 'Suscripción', icono: 'card-outline',
      v: esRentado
        ? 'No pagas por el local · cada barbero paga su silla'
        : suscripcion?.estado === 'vencida'
          ? 'Vencida · la fila del local está apagada'
          : `${plan.montoTexto} · ${asientos} asiento${asientos === 1 ? '' : 's'}` },
    { k: 'modalidad', g: 'como', t: 'Cómo trabaja tu local', icono: 'people-outline',
      v: esRentado ? 'Alquilo asientos' : 'Tengo empleados' },
    { k: 'funciones', g: 'como', t: 'Funciones del local', icono: 'options-outline',
      v: esRentado
        ? (config?.doble_servicio_activo ? 'Doble servicio activo' : 'Doble servicio apagado')
        : [config?.puntos_activos ? `Puntos cada ${config?.visitas_para_gratis ?? 8}` : 'Sin puntos',
           config?.asignacion_por_dueno ? 'Tú asignas' : 'Elige el cliente'].join(' · ') },
    // TIEMPOS SOLO CON EMPLEADOS. Reportado: "no debería aparecer cuando la
    // barbería trabaja bajo alquiler de asientos". Y es correcto: ahí cada
    // barbero es un negocio aparte y pone los suyos desde su configuración, así
    // que estos números no mandaban sobre nadie. Un ajuste que no decide nada
    // enseña al dueño a desconfiar de los que sí deciden.
    ...(conEmpleados ? [{ k: 'tiempos', g: 'como', t: 'Tiempos', icono: 'time-outline',
      v: `${config?.anticipacion_minima_horas ?? 2} h para reservar · ${config?.ventana_llegada_min ?? 10} min para llegar` }] : []),
    { k: 'otros', g: 'cuenta', t: 'Cuenta', icono: 'person-circle-outline',
      v: 'Avisos, cerrar sesión, cerrar el local' },
  ]

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 14, paddingBottom: 32 }}>
      <PanelBadge />

      {seccion === null ? (
        <>
          <Encabezado titulo="Ajustes" sub={negocio?.nombre ?? null} />
          {GRUPOS.map(g => {
            const filas = MENU.filter(m => m.g === g.k)
            if (!filas.length) return null
            return (
              <View key={g.k}>
                <Rotulo>{g.l}</Rotulo>
                {filas.map((m, i) => (
                  <Fila key={m.k} ultima={i === filas.length - 1} onPress={() => setSeccion(m.k)}
                    inicio={<IconoFila icono={m.icono as any} />}
                    titulo={m.t} meta={m.v} fin={<Flecha />} />
                ))}
                {/* Cambiar de panel es navegación, no configuración: va con la
                    cuenta, igual que en los Ajustes del barbero. */}
                {g.k === 'cuenta' && <CambiarRol />}
              </View>
            )
          })}
        </>
      ) : (
        <TouchableOpacity style={s.volver} onPress={() => setSeccion(null)} accessibilityRole="button">
          <Ionicons name="chevron-back" size={20} color={COLORS.ink} />
          <Text style={s.volverT}>Ajustes</Text>
        </TouchableOpacity>
      )}
      {seccion && <View style={{ marginBottom: 14 }}><Encabezado titulo={TITULO[seccion]} /></View>}

      {seccion === 'codigo' && (<>
        <Tarjeta style={s.codeCard}>
          <Sobre>Código de acceso</Sobre>
          <Text style={s.codeVal}>{negocio?.codigo_acceso ?? '—'}</Text>
        </Tarjeta>
        <Nota>
          {esRentado
            ? 'Con este código tus clientes se unen al local y los barberos piden rentar una silla. Nadie entra a trabajar sin que lo apruebes en Equipo.'
            : 'Con este código tus clientes se unen al local y tus barberos piden entrar. Nadie entra a trabajar sin que lo apruebes en Equipo.'}
        </Nota>
        <Boton texto="Compartir el código" icono="share-outline" style={{ marginTop: 18 }}
          onPress={() => Share.share({ message: `Únete a ${negocio?.nombre ?? 'mi barbería'} en Turno con el código ${negocio?.codigo_acceso}` })} />
      </>)}

      {seccion === 'marca' && (<>
        <View style={s.marcaTop}>
          <TouchableOpacity onPress={cambiarLogo} disabled={subiendoLogo} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Cambiar el logo">
            <Avatar name={negocio?.nombre} uri={negocio?.logo_url} size={72} />
            <View style={s.logoBadge}>
              {subiendoLogo ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="pencil" size={13} color="#fff" />}
            </View>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Etiqueta style={{ marginTop: 0 }}>Nombre del local</Etiqueta>
            <Campo placeholder="Barbería…" value={nombre} onChangeText={setNombre} />
            <Text style={s.marcaHint}>Toca el logo para cambiarlo.</Text>
          </View>
        </View>

        <Etiqueta>Eslogan</Etiqueta>
        <Campo placeholder="Tu frase de marca" value={slogan} onChangeText={setSlogan} />

        {/* LA DIRECCIÓN, POR PARTES. Era un solo campo de texto libre —"calle,
            sector, ciudad"— y cada dueño escribía lo que le parecía. Aquí una
            dirección sin sector no ubica a nadie, y el punto de referencia es
            literalmente cómo llega el cliente: por eso son campos y no una
            frase. Ver migración 80. */}
        <Etiqueta>Calle y número</Etiqueta>
        <Campo placeholder="Av. Duarte 45" value={direccion} onChangeText={setDireccion} />

        <View style={s.dosCol}>
          <View style={{ flex: 1 }}>
            <Etiqueta>Sector</Etiqueta>
            <Campo placeholder="Los Jardines" value={sector} onChangeText={setSector} />
          </View>
          <View style={{ flex: 1 }}>
            <Etiqueta>Ciudad</Etiqueta>
            <Campo placeholder="Santiago" value={ciudad} onChangeText={setCiudad} />
          </View>
        </View>

        <Etiqueta>Punto de referencia</Etiqueta>
        <Campo placeholder="Frente al colmado, subiendo la loma…" value={referencia} onChangeText={setReferencia} />

        {/* DESPLEGABLES, NO CARRUSELES (pedido del piloto). Con veinticuatro
            países, un carrusel horizontal esconde lo que no cabe: quien no veía
            el suyo en los tres primeros no podía saber si estaba más allá o si
            no estaba, porque las dos cosas se ven igual. */}
        <Selector etiqueta="País" titulo="¿Dónde está tu barbería?"
          valor={pais}
          opciones={PAISES.map(p => ({ valor: p.codigo, etiqueta: p.nombre }))}
          onElegir={(v) => { setPais(v); const p = paisDe(v); if (p) setMoneda(p.moneda) }} />

        {/* La moneda se propone con el país y se puede cambiar: hay locales que
            cobran en dólares en sitios donde la moneda es otra — en Venezuela y
            Cuba es casi la norma. */}
        <Selector etiqueta="Moneda" titulo="¿En qué cobras?"
          valor={moneda}
          opciones={MONEDAS.map(m => ({ valor: m.codigo, etiqueta: m.etiqueta }))}
          onElegir={setMoneda} />

        <View style={s.dosCol}>
          <View style={{ flex: 1 }}>
            <Etiqueta>Teléfono</Etiqueta>
            <Campo placeholder="+1 809…" keyboardType="phone-pad" value={telefono} onChangeText={setTelefono} />
          </View>
          <View style={{ flex: 1 }}>
            <Etiqueta>Instagram</Etiqueta>
            <Campo placeholder="usuario" autoCapitalize="none" value={ig} onChangeText={setIg} />
          </View>
        </View>

        <Boton texto="Guardar marca" onPress={guardarMarca} ocupado={guardandoMarca} style={{ marginTop: 22 }} />
      </>)}

      {/* ALQUILO ASIENTOS = NO PAGO NADA (migración 93).
          Agrupar no cuesta: en este local paga cada silla, la del dueño incluida
          si además atiende. Enseñarle aquí un plan con precio por asiento le
          cobraría —de palabra— por barberos que ya pagan lo suyo, que es
          justo lo contrario del esquema. */}
      {seccion === 'suscripcion' && esRentado && (
        <Tarjeta>
          <Text style={s.susTitulo}>No pagas nada por el local</Text>
          <Nota>
            Alquilas asientos, así que aquí cada barbero paga su propia silla. Tú solo los
            agrupas: les das el código, aparecen juntos para tus clientes y comparten la fila
            del local.
          </Nota>
          <Nota>
            Si además atiendes, tu silla es una más y la pagas como cualquier otra. La ves en
            tu panel de barbero, en "Mi suscripción".
          </Nota>
        </Tarjeta>
      )}

      {seccion === 'suscripcion' && !esRentado && (
        <>
          <Tarjeta>
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
              <Text style={s.susFootT}>Asientos: <Text style={s.mono}>{asientos}</Text> · <Text style={s.mono}>{SUSCRIPCION.moneda} {SUSCRIPCION.minimo}</Text> c/u, tope <Text style={s.mono}>{SUSCRIPCION.moneda} {SUSCRIPCION.maximo}</Text></Text>
            </View>

            {/* LA PRUEBA GRATIS, DICHA DE VERDAD (migración 86).
                `SUSCRIPCION.dias_prueba = 30` llevaba meses en constants sin que
                lo leyera nadie: una promesa que no vivía en ningún sitio. Ahora
                el local nace con esos 30 días contados y aquí se dice cuántos
                quedan, que es información cierta — a diferencia de un precio que
                nadie está cobrando todavía. */}
            {suscripcion?.estado === 'prueba' && (
              <View style={s.susEstado}>
                <Punto color={COLORS.blue} />
                <Text style={s.susEstadoT}>
                  Prueba gratis · {suscripcion.dias_restantes === 0
                    ? 'último día'
                    : `te quedan ${suscripcion.dias_restantes} día${suscripcion.dias_restantes === 1 ? '' : 's'}`}
                </Text>
              </View>
            )}
            {suscripcion?.estado === 'activa' && (
              <View style={s.susEstado}>
                <Punto color={COLORS.success} />
                <Text style={s.susEstadoT}>Al día · cubierto hasta el {fechaLarga(fechaDeISO(suscripcion.hasta!))}</Text>
              </View>
            )}
            {suscripcion?.estado === 'cortesia' && (
              <View style={s.susEstado}>
                <Punto color={COLORS.success} />
                <Text style={s.susEstadoT}>Cortesía · sin cargo</Text>
              </View>
            )}
            {suscripcion?.estado === 'vencida' && (
              <View style={s.susEstado}>
                <Punto color={COLORS.red} />
                <Text style={[s.susEstadoT, { color: COLORS.redText }]}>Vencida · la fila de tu local está apagada</Text>
              </View>
            )}

            {/* ESTO DECÍA «tu barbería sigue funcionando con normalidad», y
                desde la migración 95 es falso: sin pagar, ninguna silla del
                local aparece ni recibe fila —todas cuelgan de esta misma
                suscripción, la del dueño incluida—. Dejar el texto viejo
                convertía la única pantalla que puede explicar el apagón en la
                que asegura que no lo hay. */}
            <Nota>
              {suscripcion?.estado === 'vencida'
                ? 'Sin la suscripción al día, tus barberos no aparecen en la app y nadie puede entrar a la fila ni reservar. Lo que ya estaba reservado no se toca —las citas siguen en pie— y quien llegue al local se atiende igual. Aquí puedes seguir cambiando los datos del negocio.'
                : 'El pago dentro de la app se habilitará próximamente. Nada deja de funcionar mientras tanto.'}
            </Nota>

            {/* EL CUPO (migración 96). Decide QUIÉN trabaja, así que el dueño
                tiene que verlo: si paga por dos sillas y tiene cuatro dadas de
                alta, dos no aparecen. Se reparte por antigüedad y eso se dice,
                porque es lo primero que va a preguntar. Solo se enseña cuando
                hay tope: sin número no hay nada que explicar. */}
            {suscripcion?.sillas_pagadas != null && (
              <Nota>
                Pagas por {suscripcion.sillas_pagadas} silla{suscripcion.sillas_pagadas === 1 ? '' : 's'} de
                las {asientos} que tienes dadas de alta
                {asientos > suscripcion.sillas_pagadas
                  ? `. Las ${asientos - suscripcion.sillas_pagadas} restantes no aparecen en la app: trabajan las más antiguas.`
                  : '.'}
              </Nota>
            )}
          </Tarjeta>
        </>
      )}

      {/* De esta elección cuelga quién decide precios y horarios de todo el
          equipo (R11). Se hacía una sola vez en el onboarding y no se podía
          deshacer: equivocarse dejaba el local atrapado. */}
      {seccion === 'modalidad' && (<>
        <View style={s.modRow}>
          <Chip texto="Alquilo asientos" activo={negocio?.tipo === 'espacios_rentados'}
            onPress={() => { if (!tipoBusy) pedirCambioTipo('espacios_rentados') }} />
          <Chip texto="Tengo empleados" activo={negocio?.tipo === 'empleados'}
            onPress={() => { if (!tipoBusy) pedirCambioTipo('empleados') }} />
          {tipoBusy && <ActivityIndicator size="small" color={COLORS.textMid} />}
        </View>
        <Nota>
          {negocio?.tipo === 'empleados'
            ? 'Tus barberos trabajan para ti: los servicios, los precios y el horario los pones tú, y cubres su suscripción.'
            : 'Cada barbero paga su asiento y trabaja con sus reglas: pone sus servicios, sus precios y su horario, y paga su suscripción.'}
        </Nota>
      </>)}

      {/* En un local de asientos alquilados el dueño NO manda sobre los puntos
          ni sobre a quién le toca cada cliente: cada barbero es un negocio
          aparte, con su clientela y sus reglas. Enseñar esos interruptores ahí
          no es solo ruido — hace creer que deciden algo que no deciden. */}
      {seccion === 'funciones' && (<>
      {esRentado && (
        <Nota style={{ marginTop: 0, marginBottom: 6 }}>
          Alquilas asientos, así que los puntos y la asignación de clientes los lleva cada barbero desde su propia configuración. Aquí solo quedan las que sí son del local.
        </Nota>
      )}
      {conEmpleados && <Toggle label="Sistema de puntos" desc="Clientes acumulan y canjean puntos" value={!!config?.puntos_activos} onChange={(v) => toggle('puntos_activos', v)} />}
      {/* Sin estos dos números el interruptor no hacía nada: el trigger exige
          puntos_por_visita > 0 y el canje exige la meta. El dueño encendía los
          puntos y el cliente no veía sumar ni uno. */}
      {/* Se cuentan recortes, no puntos abstractos: "cada X recortes te ganas
          esto". Y el premio lo escribe el local — no tiene por qué ser un corte
          gratis; puede ser una barba, un refresco o lo que quiera regalar. */}
      {conEmpleados && !!config?.puntos_activos && (
        <View style={s.sangria}>
          <Stepper label="Recortes para el premio"
            desc={`Cada ${config?.visitas_para_gratis ?? 8} visitas, el cliente se gana el premio.`}
            suf="recortes"
            value={config?.visitas_para_gratis ?? 8}
            onMinus={() => ajustar('visitas_para_gratis', -1, 2, 50)} onPlus={() => ajustar('visitas_para_gratis', 1, 2, 50)} />
          <Etiqueta>¿Qué se gana?</Etiqueta>
          <Campo value={premio} onChangeText={setPremio}
            onEndEditing={() => guardarPremio()} placeholder="Corte gratis, barba gratis, un refresco…"
            maxLength={60} />
        </View>
      )}
      {conEmpleados && <Toggle label="Asignación por el administrador" desc="Tú asignas el barbero; el cliente no elige" value={!!config?.asignacion_por_dueno} onChange={(v) => toggle('asignacion_por_dueno', v)} />}
      <Toggle label="Doble servicio por visita" desc="Permite combinar corte + manicure" value={!!config?.doble_servicio_activo} onChange={(v) => toggle('doble_servicio_activo', v)} ultima />
      </>)}

      {seccion === 'tiempos' && conEmpleados && (<>
      <Nota style={{ marginTop: 0, marginBottom: 6 }}>
        Valen para todo tu equipo: son tus empleados y estas reglas son las del local.
      </Nota>
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
      <Fila onPress={salir}
        inicio={<IconoFila icono="log-out-outline" />}
        titulo="Cerrar sesión"
        meta="Tu local, tu equipo y tus clientes siguen igual. Para volver a entrar necesitas un código nuevo."
        fin={<Flecha />} />

      {/* Los avisos del dueño son las solicitudes para unirse al local: sin
          esto no se entera hasta que abre el panel. Ver lib/notificaciones. */}
      <Fila ultima onPress={activarAvisos}
        inicio={<IconoFila icono={avisosOn ? 'notifications' : 'notifications-off-outline'} color={avisosOn ? COLORS.success : COLORS.ink} />}
        titulo="Avisos en este teléfono"
        meta={avisosOn
          ? 'Activados. Aquí llegan las solicitudes de barberos y los avisos del local.'
          : 'Apagados: en este teléfono no vas a recibir nada. Toca para activarlos.'}
        fin={avisosOn ? <Estado texto="Activos" color={COLORS.success} /> : <Flecha />} />

      <Rotulo>Sin vuelta atrás</Rotulo>
      <Boton tipo="destructive" icono="trash-outline" texto="Cerrar este local" onPress={cerrarEsteLocal} style={{ marginTop: 8 }} />
      <Nota>Deja de aparecer, se cancelan las citas futuras y se vacía la fila. Se avisa a clientes y equipo. Los barberos que alquilan conservan su cuenta.</Nota>
      </>)}
    </ScrollView>
  )
}

function Toggle({ label, desc, value, onChange, ultima }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void; ultima?: boolean }) {
  return (
    <View style={[s.ajuste, ultima && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={s.ajusteL}>{label}</Text>
        <Text style={s.ajusteD}>{desc}</Text>
      </View>
      <Interruptor valor={value} onCambio={onChange} />
    </View>
  )
}
function Stepper({ label, desc, value, suf, onMinus, onPlus }: { label: string; desc?: string; value: number; suf: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={s.ajuste}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={s.ajusteL}>{label}</Text>
        {desc ? <Text style={s.ajusteD}>{desc}</Text> : null}
      </View>
      <View style={s.stepCtrl}>
        <TouchableOpacity style={s.stepBtn} onPress={onMinus} accessibilityRole="button" accessibilityLabel={`Menos ${suf}`}>
          <Ionicons name="remove" size={18} color={COLORS.ink} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center', minWidth: 44 }}>
          <Text style={s.stepVal}>{value}</Text>
          <Text style={s.stepSuf}>{suf}</Text>
        </View>
        <TouchableOpacity style={s.stepBtn} onPress={onPlus} accessibilityRole="button" accessibilityLabel={`Más ${suf}`}>
          <Ionicons name="add" size={18} color={COLORS.ink} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  volver: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 14, alignSelf: 'flex-start' },
  volverT: { fontFamily: FONTS.semibold, color: COLORS.ink, fontSize: 15 },
  modRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  marcaTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  marcaHint: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textLight, marginTop: 6 },
  logoBadge: { position: 'absolute', right: -4, bottom: -4, width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.ink,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.bg },
  dosCol: { flexDirection: 'row', gap: 12 },
  codeCard: { padding: 18 },
  codeVal: { fontFamily: FONTS.mono, fontSize: 40, letterSpacing: 1, color: COLORS.ink, marginTop: 8 },
  susTop: { flexDirection: 'row', alignItems: 'flex-start' },
  susTitulo: { fontFamily: FONTS.semibold, fontSize: 17, color: COLORS.ink },
  susDetalle: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textLight, marginTop: 4, paddingRight: 10, lineHeight: 18 },
  susMonto: { fontFamily: FONTS.mono, fontSize: 22, color: COLORS.ink },
  susTope: { fontFamily: FONTS.semibold, fontSize: 12, color: COLORS.redText },
  susFoot: { borderTopWidth: 1, borderTopColor: COLORS.divider, marginTop: 14, paddingTop: 12 },
  susFootT: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textMid },
  mono: { fontFamily: FONTS.monoMedium, color: COLORS.ink },
  susEstado: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  susEstadoT: { flex: 1, fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink },
  sangria: { paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  ajuste: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  ajusteL: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  ajusteD: { fontFamily: FONTS.regular, fontSize: 13, lineHeight: 18, color: COLORS.textLight, marginTop: 2 },
  stepCtrl: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  stepVal: { fontFamily: FONTS.mono, fontSize: 16, color: COLORS.ink },
  stepSuf: { fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textLight },
})
