/**
 * LAS CUATRO PESTAÑAS DEL CLIENTE.
 *
 * «Inicio» desapareció. No se renombró: dejó de existir. Era un vestíbulo que
 * resumía las otras cuatro pantallas —el estado del local, el turno, la
 * fidelidad, las últimas visitas— y obligaba a pasar por él para llegar a
 * cualquier sitio. Cinco cosas repetidas en dos lugares cada una.
 *
 * Ahora la app se llama Turno y abre en el turno. Es la propuesta de valor y
 * es lo que el cliente viene a ver:
 *
 *   MI TURNO      lo que tengo ahora y cómo está la barbería, en una tarjeta
 *   MI BARBERÍA   quién trabaja, qué cobra cada uno, mis recortes
 *   HISTORIAL     visitas, gasto y reseñas
 *   AJUSTES       mis preferencias y mi cuenta
 */
import { useEffect, useState } from 'react'
import { Tabs, usePathname } from 'expo-router'
import { iconoTab as ic, useOpcionesTabs } from '../../../components/tabs'
import { capaGlass } from '../../../components/fondo-glass'
import GuardaPanel from '../../../components/guarda-panel'
import { getSesion, alCambiarSesion } from '../../../lib/storage'

export default function ClienteLayout() {
  const opciones = useOpcionesTabs()

  /**
   * UN LOCAL, UN PANEL. Al cambiar de barbería se rehace entero.
   *
   * Las pestañas de expo-router no se desmontan al salir de ellas: se quedan
   * vivas con lo que cargaron. Cambiar de local escribía la sesión nueva, pero
   * «Mi barbería» seguía enseñando la de antes hasta que la tocaras, y el
   * historial igual — se veía un local de empleados en una pestaña y uno de
   * sillas alquiladas en la de al lado, mientras cada una se iba poniendo al
   * día por su cuenta.
   *
   * La `key` es el local. Cuando cambia, React tira las cuatro pestañas y
   * monta cuatro nuevas, cada una cargando ya para el local que toca. No hay
   * un momento en el que convivan los dos.
   */
  const [local, setLocal] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let vivo = true
    getSesion().then(ss => { if (vivo) setLocal(ss?.negocio_id ?? null) })
    // Solo cuando llega un local NUEVO. Cerrar sesión también avisa —con
    // `null`—, y en ese momento lo único que queda es salir al login: rehacer
    // las cuatro pestañas para un local vacío sería cargarlas para nada y
    // hacerlas parpadear justo antes de irse.
    const soltar = alCambiarSesion(ss => { if (ss?.negocio_id) setLocal(ss.negocio_id) })
    return () => { vivo = false; soltar() }
  }, [])

  // Al rehacerse por un cambio de local, las pestañas arrancarían en la
  // primera —Mi turno—. Quien cambió de local desde «Mi barbería» quiere
  // ver la barbería nueva, no que lo saquen de ahí: se arranca en la pestaña
  // en la que estaba. Fuera del arranque, `initialRouteName` no hace nada.
  const ruta = usePathname()
  const ultima = ruta.split('/').filter(Boolean).pop() ?? ''
  const inicial = ['turno', 'barberia', 'historial', 'configuracion'].includes(ultima) ? ultima : 'turno'

  // Hasta saber el local no se monta nada. Montar con una clave provisional y
  // cambiarla un instante después sería cargar las cuatro pestañas dos veces
  // en cada arranque — justo lo contrario de lo que se busca. La sesión ya
  // está en memoria cuando se llega aquí, así que la espera es de un tic.
  if (local === undefined) return <GuardaPanel panel="cliente">{null}</GuardaPanel>

  return (
    <GuardaPanel panel="cliente">
      <Tabs screenLayout={capaGlass} key={local ?? 'sin-local'} initialRouteName={inicial} screenOptions={opciones}>
        <Tabs.Screen name="turno" options={{ tabBarLabel: 'Mi turno', tabBarIcon: ic('time-outline') }} />
        <Tabs.Screen name="barberia" options={{ tabBarLabel: 'Mi barbería', tabBarIcon: ic('storefront-outline') }} />
        <Tabs.Screen name="historial" options={{ tabBarLabel: 'Historial', tabBarIcon: ic('receipt-outline') }} />
        <Tabs.Screen name="configuracion" options={{ tabBarLabel: 'Ajustes', tabBarIcon: ic('settings-outline') }} />

        {/* Fuera de la barra: se abren desde dentro. */}
        <Tabs.Screen name="agendar" options={{ href: null }} />
        <Tabs.Screen name="buscar-barbero" options={{ href: null }} />
      </Tabs>
    </GuardaPanel>
  )
}
