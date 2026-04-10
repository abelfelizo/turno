import { Linking } from 'react-native'

export function cobrarPorWhatsApp(telefono: string, nombre: string, monto: number, moneda: string) {
  const num = telefono.replace(/\D/g, '')
  const msg = encodeURIComponent(`Hola ${nombre}, tiene un pago pendiente de ${moneda} ${monto.toLocaleString()}. Gracias.`)
  Linking.openURL(`whatsapp://send?phone=${num}&text=${msg}`).catch(() => Linking.openURL(`https://wa.me/${num}?text=${msg}`))
}

export function recordarCita(telefono: string, nombre: string, hora: string, barbero: string) {
  const num = telefono.replace(/\D/g, '')
  const msg = encodeURIComponent(`Hola ${nombre}, te recordamos tu cita hoy a las ${hora} con ${barbero}. ¡Te esperamos!`)
  Linking.openURL(`whatsapp://send?phone=${num}&text=${msg}`).catch(() => Linking.openURL(`https://wa.me/${num}?text=${msg}`))
}
