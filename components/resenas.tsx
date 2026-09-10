/**
 * LAS RESEÑAS, LEÍDAS.
 *
 * La tabla existe desde el principio y el cliente puntúa desde su historial,
 * pero lo único que salía de ahí era "★ 4.7 (12)" en la lista de barberos. Los
 * comentarios que la gente se tomó el trabajo de escribir no los leía NADIE: ni
 * el barbero calificado, ni el dueño, ni el cliente que quiere saber por qué ese
 * tiene 4.7. Una reseña que nadie puede leer no es una reseña, es un formulario.
 *
 * Esto es la misma hoja para los tres, porque es la misma pregunta: ¿qué dice
 * la gente de este barbero? El reparto de estrellas va arriba porque el
 * promedio solo miente en una dirección — diez cincos y dos unos dan lo mismo
 * que doce cuatros, y no es lo mismo sentarse con uno que con el otro.
 */
import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { getResenasDe, getResumenResenas, type ResumenResenas } from '../lib/db'
import { COLORS, FONTS } from '../constants'
import { Display } from './ui'
import Hoja from './hoja'

const estrellas = (n: number) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n)

function fechaCorta(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Resenas({ perfilId, nombre, visible, onClose }: {
  perfilId: string | null
  nombre?: string | null
  visible: boolean
  onClose: () => void
}) {
  const [resumen, setResumen] = useState<ResumenResenas | null>(null)
  const [lista, setLista] = useState<any[]>([])
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!visible || !perfilId) return
    setCargando(true)
    Promise.all([
      getResumenResenas(perfilId).catch(() => null),
      getResenasDe(perfilId).catch(() => []),
    ]).then(([r, l]) => { setResumen(r); setLista(l as any[]) })
      .finally(() => setCargando(false))
  }, [visible, perfilId])

  const barras: [string, number][] = resumen ? [
    ['5', resumen.cinco], ['4', resumen.cuatro], ['3', resumen.tres],
    ['2', resumen.dos], ['1', resumen.una],
  ] : []
  const maximo = Math.max(1, ...barras.map(([, n]) => n))

  return (
    <Hoja visible={visible} onClose={onClose}>
      <Display size={22}>{nombre ? `Reseñas de ${nombre}` : 'Reseñas'}</Display>

      {cargando ? <ActivityIndicator color={COLORS.red} style={{ marginVertical: 28 }} /> : (
        <>
          {resumen && resumen.total > 0 ? (
            <View style={s.cabecera}>
              <View style={s.promedioBox}>
                <Text style={s.promedio}>{resumen.promedio}</Text>
                <Text style={s.estrellasT}>{estrellas(Math.round(resumen.promedio))}</Text>
                <Text style={s.total}>{resumen.total} reseña{resumen.total === 1 ? '' : 's'}</Text>
              </View>
              {/* El reparto: cinco barras, una por estrella. */}
              <View style={{ flex: 1, gap: 5 }}>
                {barras.map(([k, n]) => (
                  <View key={k} style={s.barraRow}>
                    <Text style={s.barraK}>{k}</Text>
                    <View style={s.barraBg}>
                      <View style={[s.barraFill, { width: `${(n / maximo) * 100}%` }]} />
                    </View>
                    <Text style={s.barraN}>{n}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <Text style={s.vacio}>
              Todavía nadie lo ha calificado. Las reseñas las dejan los clientes desde su historial, después de una visita.
            </Text>
          )}

          {lista.map((r: any) => (
            <View key={r.id} style={s.item}>
              <View style={s.itemTop}>
                <Text style={s.itemEstrellas}>{estrellas(r.rating)}</Text>
                <Text style={s.itemMeta}>{[r.autor, fechaCorta(r.cuando)].filter(Boolean).join(' · ')}</Text>
              </View>
              {r.comentario ? <Text style={s.itemTexto}>{r.comentario}</Text> : null}
            </View>
          ))}
        </>
      )}
    </Hoja>
  )
}

const s = StyleSheet.create({
  cabecera: { flexDirection: 'row', gap: 18, alignItems: 'center', marginTop: 16, marginBottom: 18 },
  promedioBox: { alignItems: 'center' },
  promedio: { fontFamily: FONTS.display, fontSize: 44, color: COLORS.ink },
  estrellasT: { fontSize: 15, color: COLORS.red, marginTop: -2 },
  total: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 3 },
  barraRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barraK: { fontFamily: FONTS.bold, fontSize: 11, color: COLORS.textLight, width: 10 },
  barraBg: { flex: 1, height: 7, borderRadius: 4, backgroundColor: COLORS.surfaceAlt, overflow: 'hidden' },
  barraFill: { height: 7, borderRadius: 4, backgroundColor: COLORS.red },
  barraN: { fontFamily: FONTS.medium, fontSize: 11, color: COLORS.textLight, width: 18, textAlign: 'right' },
  vacio: { fontFamily: FONTS.medium, fontSize: 13.5, color: COLORS.textMid, lineHeight: 19, marginVertical: 18 },
  item: { borderTopWidth: 1, borderTopColor: COLORS.borderSoft, paddingVertical: 12 },
  itemTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemEstrellas: { fontSize: 14, color: COLORS.red },
  itemMeta: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight },
  itemTexto: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.ink, marginTop: 6, lineHeight: 20 },
})
