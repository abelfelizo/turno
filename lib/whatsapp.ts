import { Linking } from 'react-native'
import { hora12 } from './format'

function abrir(telefono: string, mensaje: string) {
  const num = (telefono || '').replace(/\D/g, '')
  const msg = encodeURIComponent(mensaje)
  Linking.openURL(`whatsapp://send?phone=${num}&text=${msg}`).catch(() => Linking.openURL(`https://wa.me/${num}?text=${msg}`))
}

/** Avisa al cliente que es su turno (caso "es tu turno"). */
export function avisarTurno(telefono: string, nombre: string, negocio: string) {
  abrir(telefono, `Hola ${nombre}, ¡eres el próximo en ${negocio}! Acércate al local, te esperamos.`)
}

/** Abre un chat de WhatsApp con el cliente. */
export function escribirCliente(telefono: string, nombre: string) {
  abrir(telefono, `Hola ${nombre}, `)
}

export function cobrarPorWhatsApp(telefono: string, nombre: string, monto: number, moneda: string) {
  abrir(telefono, `Hola ${nombre}, tiene un pago pendiente de ${moneda} ${monto.toLocaleString()}. Gracias.`)
}

export function recordarCita(telefono: string, nombre: string, hora: string, barbero: string) {
  const num = telefono.replace(/\D/g, '')
  const msg = encodeURIComponent(`Hola ${nombre}, te recordamos tu cita hoy a las ${hora12(hora)} con ${barbero}. ¡Te esperamos!`)
  Linking.openURL(`whatsapp://send?phone=${num}&text=${msg}`).catch(() => Linking.openURL(`https://wa.me/${num}?text=${msg}`))
}
