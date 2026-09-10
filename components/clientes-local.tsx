/**
 * LOS CLIENTES DEL LOCAL, PARA EL DUEÑO.
 *
 * Reportado desde el teléfono: "desde el perfil de dueño no pude entrar al
 * perfil de los clientes". Y era cierto: la cartera existía —el barbero la tiene
 * en su pestaña Clientes— pero el dueño, que es quien decide si el local va bien
 * o mal, no tenía por dónde mirar a la gente que entra por su puerta. Solo veía
 * nombres pasando por la fila.
 *
 * QUÉ ENSEÑA Y QUÉ NO. Lo del LOCAL: cuántas veces ha venido, cuándo fue la
 * última, cuánto ha gastado, con quién se corta normalmente y qué servicio pide.
 * Eso es información del negocio y el dueño la necesita para saber a quién está
 * perdiendo.
 *
 * Lo que NO sale es la NOTA PRIVADA del barbero. No por permisos —la política
 * de turno_notas_barbero ya la reserva a quien la escribió— sino porque es otra
 * cosa: el barbero apunta ahí "le molesta que le hablen" o "viene con el hijo",
 * y eso se lo dijo a él. Si el dueño lo lee, el barbero deja de escribirlo.
 */
import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getClientesDelLocal, getHistorialCliente } from '../lib/db'
import { dinero, fechaLarga, fechaDeISO } from '../lib/format'
import { escribirCliente } from '../lib/whatsapp'
import { COLORS, FONTS } from '../constants'
import { Display, Avatar } from './ui'
import Hoja from './hoja'

export default function ClientesLocal({ negocioId, moneda, visible, onClose }: {
  negocioId: string | null
  moneda?: string
  visible: boolean
  onClose: () => void
}) {
  const [lista, setLista] = useState<any[]>([])
  const [busca, setBusca] = useState('')
  const [cargando, setCargando] = useState(false)
  const [abierto, setAbierto] = useState<any>(null)
  const [historial, setHistorial] = useState<any[]>([])

  useEffect(() => {
    if (!visible || !negocioId) return
    setCargando(true)
    getClientesDelLocal(negocioId).then(setLista).catch(() => setLista([])).finally(() => setCargando(false))
  }, [visible, negocioId])

  async function abrir(c: any) {
    setAbierto(c); setHistorial([])
    if (!negocioId) return
    setHistorial(await getHistorialCliente(c.cliente_id, negocioId).catch(() => []) as any[])
  }

  function cerrar() { setAbierto(null); setBusca(''); onClose() }

  const filtrados = busca.trim()
    ? lista.filter(c => String(c.nombre).toLowerCase().includes(busca.trim().toLowerCase()))
    : lista

  // Con quién se corta y qué pide: lo más repetido de su historial. Es la
  // pregunta que se hace el dueño mirando a un cliente que dejó de venir.
  const masRepetido = (campo: (h: any) => string | undefined) => {
    const cuenta: Record<string, number> = {}
    for (const h of historial) { const v = campo(h); if (v) cuenta[v] = (cuenta[v] ?? 0) + 1 }
    return Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }

  return (
    <Hoja visible={visible} onClose={cerrar}>
      {abierto ? (
        <>
          <TouchableOpacity style={s.volver} onPress={() => setAbierto(null)}>
            <Ionicons name="chevron-back" size={18} color={COLORS.textMid} />
            <Text style={s.volverT}>Clientes</Text>
          </TouchableOpacity>

          <View style={s.fichaHead}>
            <Avatar name={abierto.nombre} size={48} />
            <View style={{ flex: 1 }}>
              <Display size={22}>{abierto.nombre}</Display>
              <Text style={s.fichaSub}>
                {abierto.visitas === 0
                  ? `Se unió${abierto.desde ? ` el ${fechaLarga(fechaDeISO(abierto.desde))}` : ''} y aún no ha venido`
                  : `${abierto.visitas} visita${abierto.visitas === 1 ? '' : 's'} en el local · última ${abierto.ultima}`}
              </Text>
            </View>
            {abierto.telefono && abierto.telefono !== '-' ? (
              <TouchableOpacity style={s.wa} onPress={() => escribirCliente(abierto.telefono, abierto.nombre)}>
                <Ionicons name="logo-whatsapp" size={22} color={COLORS.success} />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={s.grid}>
            <View style={s.celda}><Text style={s.celdaK}>GASTADO</Text><Text style={s.celdaV}>{dinero(abierto.total ?? 0, moneda)}</Text></View>
            <View style={s.celda}><Text style={s.celdaK}>SU BARBERO</Text><Text style={s.celdaV} numberOfLines={1}>{masRepetido(h => h.turno_perfiles?.turno_usuarios?.nombre) ?? '—'}</Text></View>
            <View style={s.celda}><Text style={s.celdaK}>LO QUE PIDE</Text><Text style={s.celdaV} numberOfLines={1}>{masRepetido(h => h.turno_servicios?.nombre) ?? '—'}</Text></View>
          </View>

          <Text style={s.sec}>ÚLTIMAS VISITAS</Text>
          {historial.length === 0 && <Text style={s.vacio}>Todavía no hay visitas registradas.</Text>}
          {historial.slice(0, 8).map((h: any) => (
            <View key={h.id} style={s.visita}>
              <View style={{ flex: 1 }}>
                <Text style={s.visitaS}>{h.turno_servicios?.nombre ?? 'Servicio'}</Text>
                <Text style={s.visitaF}>
                  {fechaLarga(fechaDeISO(h.fecha))}
                  {h.turno_perfiles?.turno_usuarios?.nombre ? ` · ${h.turno_perfiles.turno_usuarios.nombre}` : ''}
                </Text>
              </View>
              <Text style={s.visitaP}>{dinero(h.precio_cobrado, moneda)}</Text>
            </View>
          ))}

          {/* Se dice que la nota del barbero NO está, en vez de que el dueño se
              pregunte si es que el barbero no escribió nada. */}
          <Text style={s.nota}>
            Las notas que cada barbero escribe de sus clientes son suyas y no se muestran aquí.
          </Text>
        </>
      ) : (
        <>
          <Display size={22}>Clientes del local</Display>
          <TextInput style={s.busca} placeholder="Buscar por nombre…" placeholderTextColor={COLORS.textLight}
            value={busca} onChangeText={setBusca} />
          {cargando && <ActivityIndicator color={COLORS.red} style={{ marginVertical: 20 }} />}
          {!cargando && filtrados.length === 0 && (
            <Text style={s.vacio}>
              {busca ? 'Nadie con ese nombre.' : 'Todavía no se ha unido nadie al local con el código.'}
            </Text>
          )}
          {filtrados.slice(0, 60).map((c: any) => (
            <TouchableOpacity key={c.cliente_id} style={s.fila} onPress={() => abrir(c)}>
              <Avatar name={c.nombre} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={s.filaN}>{c.nombre}</Text>
                <Text style={s.filaM}>
                  {c.visitas === 0 ? 'Nunca ha venido' : `${c.visitas} visita${c.visitas === 1 ? '' : 's'} · última ${c.ultima}`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
            </TouchableOpacity>
          ))}
        </>
      )}
    </Hoja>
  )
}

const s = StyleSheet.create({
  busca: { backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12,
    padding: 13, fontSize: 15, fontFamily: FONTS.medium, color: COLORS.ink, marginTop: 14, marginBottom: 12 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderSoft },
  filaN: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink },
  filaM: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  volver: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 10 },
  volverT: { fontFamily: FONTS.semibold, fontSize: 14.5, color: COLORS.textMid },
  fichaHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  fichaSub: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.textLight, marginTop: 2 },
  wa: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  celda: { flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 11 },
  celdaK: { fontFamily: FONTS.bold, fontSize: 10, color: COLORS.textLight, letterSpacing: 0.6 },
  celdaV: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.ink, marginTop: 4 },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: COLORS.textMid, letterSpacing: 0.5, marginBottom: 8 },
  vacio: { fontFamily: FONTS.medium, fontSize: 13.5, color: COLORS.textMid, lineHeight: 19, marginVertical: 14 },
  visita: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderSoft },
  visitaS: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.ink },
  visitaF: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  visitaP: { fontFamily: FONTS.display, fontSize: 18, color: COLORS.ink },
  nota: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.textLight, lineHeight: 17, marginTop: 16 },
})
