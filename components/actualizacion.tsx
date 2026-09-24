/**
 * EL AVISO DE QUE HAY ACTUALIZACIÓN, Y EL BOTÓN QUE LA APLICA.
 *
 * Existe por una tarde entera perdida persiguiendo un fantasma. Se publicó una
 * actualización correcta, llegó al teléfono, y no se veía. El motivo resultó
 * ser de manual y aun así fue invisible desde los dos lados:
 *
 * `app.json` tiene `fallbackToCacheTimeout: 0`, que quiere decir «al abrir NO
 * esperes: arranca ya con la copia que tengas y bájate la nueva por detrás».
 * Es lo correcto —nadie quiere mirar una pantalla en blanco mientras se baja un
 * bundle— pero tiene una consecuencia que nunca se dijo en voz alta: si abres
 * la app, ves que sigue igual y la cierras a los diez segundos, esos ~3 MB
 * empiezan DE CERO la próxima vez. Cerrarla tres veces seguidas, que es
 * exactamente lo que hace cualquiera que está esperando un cambio, es la forma
 * más segura de que no llegue nunca.
 *
 * El consejo que dábamos —«ábrela y ciérrala dos veces»— era verdad a medias y
 * por eso era peor que no decir nada: la primera vez la DESCARGA (si le da
 * tiempo) y la segunda la aplica. Ese «si le da tiempo» es todo el problema.
 *
 * Así que la app deja de pedir fe. Dice en qué va:
 *
 *   · mientras baja: «Bajando actualización…», para que se sepa que hay que
 *     dejarla abierta y no se cierre justo antes de terminar;
 *   · cuando está lista: un botón para aplicarla en el momento, sin depender
 *     de cerrar y abrir ni de acertar el número de veces.
 *
 * No se aplica sola a propósito. `reloadAsync` reinicia la app, y hacerlo por
 * su cuenta en mitad de algo —con el barbero llamando a alguien, con el cliente
 * entrando a la fila— sería quitarle la pantalla de las manos a la persona.
 * Avisar y dejar que decida cuesta un toque y no interrumpe nada.
 */
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { useState } from 'react'
import { useUpdates, reloadAsync } from 'expo-updates'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, GLASS, SOBRE } from '../constants'

export function AvisoActualizacion() {
  const { isDownloading, isUpdatePending } = useUpdates()
  const [aplicando, setAplicando] = useState(false)

  if (!isDownloading && !isUpdatePending) return null

  async function aplicar() {
    setAplicando(true)
    // Si falla se vuelve a dejar el botón: la actualización sigue pendiente y
    // reintentar es gratis. Lo que no se puede es quedarse girando para siempre.
    try { await reloadAsync() } catch { setAplicando(false) }
  }

  if (isUpdatePending) {
    return (
      <TouchableOpacity style={[s.barra, s.lista]} onPress={aplicar} disabled={aplicando} activeOpacity={0.85}>
        {aplicando
          ? <ActivityIndicator color="#fff" size="small" />
          : <Ionicons name="arrow-down-circle" size={17} color="#fff" />}
        <Text style={s.texto}>
          {aplicando ? 'Aplicando…' : 'Actualización lista · toca para aplicarla'}
        </Text>
      </TouchableOpacity>
    )
  }

  return (
    <View style={[s.barra, s.bajando]}>
      <ActivityIndicator color="#fff" size="small" />
      <Text style={s.texto}>Bajando actualización · deja la app abierta</Text>
    </View>
  )
}

const s = StyleSheet.create({
  barra: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 9, paddingHorizontal: 14 },
  // Tinta con su texto blanco (Regla 1), en pastilla.
  bajando: { backgroundColor: SOBRE.tinta.fondo, borderRadius: 999 },
  lista: { backgroundColor: SOBRE.tinta.fondo, borderRadius: 999 },
  texto: { fontFamily: FONTS.semibold, fontSize: 13, color: SOBRE.tinta.t1 },
})
