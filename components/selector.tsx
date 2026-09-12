/**
 * UN DESPLEGABLE, NO UN CARRUSEL.
 *
 * Pedido desde el teléfono: «selector de moneda y país: preferiblemente lista
 * desplegable». Y el motivo es más que el gusto: un carrusel horizontal esconde
 * lo que no cabe en pantalla. Quien abría el selector y no veía su país en los
 * tres primeros no tenía forma de saber si estaba más allá o si no estaba —
 * porque las dos cosas se ven exactamente igual. Con veinticuatro países eso ya
 * no es un detalle.
 *
 * Enseña LO ELEGIDO, que es lo que hace falta el 99% del tiempo, y al tocarlo
 * abre la lista entera en la hoja compartida. El buscador aparece solo cuando
 * hay lista suficiente para que buscar tenga sentido; con seis opciones, un
 * campo de búsqueda es un estorbo.
 */
import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS } from '../constants'
import { Display } from './ui'
import Hoja from './hoja'

export type Opcion = { valor: string; etiqueta: string; nota?: string }

export default function Selector({ etiqueta, valor, opciones, onElegir, titulo, buscarDesde = 8 }: {
  etiqueta: string
  valor: string | null | undefined
  opciones: Opcion[]
  onElegir: (valor: string) => void
  titulo?: string
  /** A partir de cuántas opciones aparece el buscador. */
  buscarDesde?: number
}) {
  const [abierto, setAbierto] = useState(false)
  const [busca, setBusca] = useState('')

  const elegida = opciones.find(o => o.valor === valor)
  const q = busca.trim().toLowerCase()
  const lista = q
    ? opciones.filter(o => o.etiqueta.toLowerCase().includes(q) || (o.nota ?? '').toLowerCase().includes(q))
    : opciones

  function cerrar() { setBusca(''); setAbierto(false) }

  return (
    <>
      <Text style={s.label}>{etiqueta}</Text>
      <TouchableOpacity style={s.caja} onPress={() => setAbierto(true)}>
        <Text style={[s.valor, !elegida && { color: COLORS.textLight }]} numberOfLines={1}>
          {elegida?.etiqueta ?? 'Elegir…'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={COLORS.textMid} />
      </TouchableOpacity>

      <Hoja visible={abierto} onClose={cerrar}>
        <Display size={22}>{titulo ?? etiqueta}</Display>
        {opciones.length >= buscarDesde && (
          <TextInput style={s.busca} placeholder="Buscar…" placeholderTextColor={COLORS.textLight}
            value={busca} onChangeText={setBusca} autoCorrect={false} />
        )}
        {/* La hoja ya limita su alto; esto deja que la lista larga se recorra
            dentro sin empujar el botón de cerrar fuera de la pantalla. */}
        <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
          {lista.length === 0 && <Text style={s.vacio}>Nada con ese nombre.</Text>}
          {lista.map(o => {
            const activa = o.valor === valor
            return (
              <TouchableOpacity key={o.valor} style={s.fila}
                onPress={() => { onElegir(o.valor); cerrar() }}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.filaT, activa && { color: COLORS.red }]}>{o.etiqueta}</Text>
                  {o.nota ? <Text style={s.filaN}>{o.nota}</Text> : null}
                </View>
                {activa && <Ionicons name="checkmark" size={19} color={COLORS.red} />}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
        <TouchableOpacity onPress={cerrar}><Text style={s.cerrar}>Cerrar</Text></TouchableOpacity>
      </Hoja>
    </>
  )
}

const s = StyleSheet.create({
  label: { fontFamily: FONTS.bold, fontSize: 11.5, color: COLORS.textMid, letterSpacing: 0.4, marginBottom: 6, marginTop: 12 },
  caja: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surface,
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 13 },
  valor: { flex: 1, fontFamily: FONTS.medium, fontSize: 15, color: COLORS.ink },
  busca: { backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12,
    padding: 13, fontSize: 15, fontFamily: FONTS.medium, color: COLORS.ink, marginTop: 14 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderSoft },
  filaT: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.ink },
  filaN: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  vacio: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.textMid, paddingVertical: 20 },
  cerrar: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.textMid, textAlign: 'center', paddingVertical: 14 },
})
