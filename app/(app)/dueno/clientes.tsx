/**
 * CLIENTES · la cartera del local, para quien lo administra.
 *
 * Era una hoja escondida detrás de una fila de Mi local. Ahora es pestaña, con
 * la misma forma que la del barbero —Todos / Por recuperar, buscar, ordenar,
 * WhatsApp y llamar en la línea— pero con los números del LOCAL: las visitas
 * de su silla y de sus empleados (migración 120). Las de quien le renta un
 * asiento no se cuentan: ese negocio es del inquilino.
 *
 * Lo que NO sale es la nota privada de cada barbero. No por permisos —la
 * política ya la reserva a quien la escribió— sino porque es otra cosa: el
 * barbero apunta ahí lo que el cliente le contó a él. Si el dueño lo lee, el
 * barbero deja de escribirlo.
 */
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Linking } from 'react-native'
import { useState, useCallback } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getSesion } from '../../../lib/storage'
import { getClientesDelLocalAdmin, getHistorialCliente, getPreferenciasCliente, getNegocioById } from '../../../lib/db'
import { dinero, fechaDeISO } from '../../../lib/format'
import { escribirCliente } from '../../../lib/whatsapp'
import { useRecargaAlEnfocar } from '../../../lib/recarga'
import { COLORS, FONTS } from '../../../constants'
import { NoCargo } from '../../../components/ui'
import { Encabezado, Pestanas, Rotulo } from '../../../components/d2'
import { Titulo, Sub, Dato, AhoraNo } from '../../../components/hoja-piezas'
import { Fila, Iniciales, Chip, Buscar, BotonIcono, Boton, Sobre, Nota as NotaLista } from '../../../components/turno-ui'
import PanelBadge from '../../../components/panel-badge'
import Hoja from '../../../components/hoja'

const ORDENES = [
  { k: 'recientes', l: 'Recientes' },
  { k: 'frecuentes', l: 'Frecuentes' },
  { k: 'nuevos', l: 'Sin venir' },
  { k: 'az', l: 'A–Z' },
] as const
type Orden = typeof ORDENES[number]['k']

/** Días sin venir a partir de los cuales el local empieza a perderlo. */
const DIAS_RECUPERAR = 30

/** Un teléfono al que se puede escribir. Al que entra sin cita se le guarda «-». */
const telDe = (t?: string | null) => (t && /\d{7,}/.test(t.replace(/\D/g, '')) ? t : null)
const fechaCorta = (iso?: string | null) =>
  iso ? fechaDeISO(iso).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' }).replace('.', '') : ''
const llamar = (t: string) => Linking.openURL(`tel:${t.replace(/[^\d+]/g, '')}`)
const diasDesde = (iso?: string | null) =>
  iso ? Math.floor((Date.now() - fechaDeISO(iso).getTime()) / 864e5) : null

export default function ClientesDelLocal() {
  const insets = useSafeAreaInsets()
  const [negocioId, setNegocioId] = useState<string | null>(null)
  const [moneda, setMoneda] = useState('')
  const [clientes, setClientes] = useState<any[]>([])
  const [delLocal, setDelLocal] = useState(true)
  const [seg, setSeg] = useState<'todos' | 'recuperar'>('todos')
  const [orden, setOrden] = useState<Orden>('recientes')
  const [buscar, setBuscar] = useState('')
  const [loading, setLoading] = useState(true)
  const [fallo, setFallo] = useState(false)
  const [activo, setActivo] = useState<any>(null)
  const [ficha, setFicha] = useState<{ historial: any[]; prefs: any } | null>(null)

  // La lista va sin `.catch`: vacía por un fallo de red diría «no se ha unido
  // nadie» de un local lleno.
  const cargar = useCallback(async () => {
    try {
      setFallo(false)
      const ss = await getSesion()
      if (!ss?.negocio_id) return
      setNegocioId(ss.negocio_id)
      const [cl, neg] = await Promise.all([
        getClientesDelLocalAdmin(ss.negocio_id),
        getNegocioById(ss.negocio_id).catch(() => null),
      ])
      setClientes(cl.lista); setDelLocal(cl.delLocal); setMoneda((neg as any)?.moneda ?? '')
    } catch {
      setFallo(true)
    } finally {
      setLoading(false)
    }
  }, [])
  const correr = useRecargaAlEnfocar(cargar)

  async function abrir(c: any) {
    setActivo(c); setFicha(null)
    if (!negocioId) return
    const [hist, prefs] = await Promise.all([
      getHistorialCliente(c.cliente_id, negocioId).catch(() => []),
      // La ficha la ve quien tiene silla en el local (migración 102). Un dueño
      // que no atiende no la lee, y eso está bien: no le va a pasar la máquina.
      getPreferenciasCliente(c.cliente_id, negocioId).catch(() => null),
    ])
    setFicha({ historial: hist as any[], prefs })
  }

  const q = buscar.trim().toLowerCase()
  const ordenados = [...clientes]
    .filter(c => !q || String(c.nombre ?? '').toLowerCase().includes(q))
    .sort((a: any, b: any) => {
      if (orden === 'frecuentes') return b.visitas - a.visitas
      if (orden === 'az') return String(a.nombre).localeCompare(String(b.nombre), 'es')
      if (orden === 'nuevos') {
        if ((a.visitas === 0) !== (b.visitas === 0)) return a.visitas === 0 ? -1 : 1
        return String(a.desde ?? '').localeCompare(String(b.desde ?? ''))
      }
      return String(b.ultima ?? '').localeCompare(String(a.ultima ?? ''))
    })
  const sinVenir = clientes.filter((c: any) => c.visitas === 0).length
  // Por recuperar: vino alguna vez y hace más de un mes que no. Los que más
  // tiempo llevan, primero.
  const recuperar = clientes
    .map(c => ({ ...c, dias: diasDesde(c.ultima) }))
    .filter(c => c.visitas > 0 && c.dias != null && c.dias > DIAS_RECUPERAR)
    .sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0))

  // Con quién se corta y qué pide: lo más repetido de su historial.
  const masRepetido = (campo: (h: any) => string | undefined) => {
    const cuenta: Record<string, number> = {}
    for (const h of ficha?.historial ?? []) { const v = campo(h); if (v) cuenta[v] = (cuenta[v] ?? 0) + 1 }
    return Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.red} /></View>
  if (fallo) return <View style={s.center}><NoCargo que="los clientes del local" onReintentar={() => { setLoading(true); void correr() }} /></View>

  const linea = (c: any) => c.visitas === 0
    ? `Nunca ha venido${c.desde ? ` · se unió el ${fechaCorta(c.desde)}` : ''}`
    : [`${c.visitas} ${c.visitas === 1 ? 'visita' : 'visitas'}`, `última el ${fechaCorta(c.ultima)}`, c.barbero ? `con ${c.barbero.split(' ')[0]}` : null]
        .filter(Boolean).join(' · ')
  const cabecera = (
    <View>
      <PanelBadge />
      <Encabezado titulo="Clientes" />
      {!delLocal && (
        <NotaLista style={{ marginTop: 0, marginBottom: 6 }}>Por ahora las visitas que ves son solo las de tu silla, no las de todo el local.</NotaLista>
      )}
      <Pestanas
        opciones={[
          { k: 'todos', l: `Todos · ${clientes.length}` },
          { k: 'recuperar', l: `Por recuperar · ${delLocal ? recuperar.length : '—'}` },
        ] as const}
        valor={seg} onCambio={setSeg} />

      {seg === 'todos' ? (
        <>
          <View style={{ marginTop: 16 }}>
            <Buscar valor={buscar} onCambio={setBuscar} />
          </View>
          <View style={s.ordenes}>
            {ORDENES.map(o => (
              <Chip key={o.k} activo={orden === o.k} onPress={() => setOrden(o.k)}
                texto={`${o.l}${o.k === 'nuevos' && sinVenir ? ` · ${sinVenir}` : ''}`} />
            ))}
          </View>
        </>
      ) : delLocal && recuperar.length > 0 && (
        <NotaLista style={{ marginTop: 14 }}>Vinieron alguna vez y llevan más de {DIAS_RECUPERAR} días sin volver.</NotaLista>
      )}
    </View>
  )

  const contacto = (c: any) => {
    const tel = telDe(c.telefono)
    if (!tel) return null
    return (
      <>
        <BotonIcono icono="logo-whatsapp" etiqueta={`Escribir a ${c.nombre}`} onPress={() => escribirCliente(tel, c.nombre)} />
        <BotonIcono icono="call-outline" etiqueta={`Llamar a ${c.nombre}`} onPress={() => llamar(tel)} />
      </>
    )
  }

  return (
    <View style={s.container}>
      <FlatList
        data={seg === 'todos' ? ordenados : (delLocal ? recuperar : [])}
        keyExtractor={(c) => c.cliente_id} showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 14, paddingBottom: 28 }}
        ListHeaderComponent={cabecera}
        ListEmptyComponent={
          <Text style={s.vacio}>
            {seg === 'todos'
              ? (q ? 'Nadie con ese nombre.' : 'Todavía no se ha unido nadie al local.')
              : !delLocal
                ? 'Para saber a quién está perdiendo el local hay que contar las visitas de todas las sillas; por ahora solo se cuentan las tuyas.'
                : 'Nadie por recuperar: tus clientes vuelven a tiempo.'}
          </Text>
        }
        renderItem={({ item }) => seg === 'todos' ? (
          <Fila onPress={() => abrir(item)}
            inicio={<Iniciales nombre={item.nombre} size={40} />}
            titulo={item.nombre} meta={linea(item)}
            fin={<View style={s.finFila}>{contacto(item)}</View>} />
        ) : (
          <Fila onPress={() => abrir(item)}
            inicio={<Iniciales nombre={item.nombre} size={40} />}
            titulo={item.nombre}
            meta={`Última el ${fechaCorta(item.ultima)}${item.barbero ? ` · con ${item.barbero.split(' ')[0]}` : ''}`}
            fin={
              <View style={s.finFila}>
                <Text style={s.dias}>{item.dias}<Text style={s.diasD}> d</Text></Text>
                {contacto(item)}
              </View>
            } />
        )}
      />

      <Hoja visible={!!activo} onClose={() => setActivo(null)}>
        <View style={s.fichaCab}>
          <Iniciales nombre={activo?.nombre} size={52} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Titulo>{activo?.nombre}</Titulo>
          </View>
        </View>
        <Sub>{activo ? linea(activo) : ''}</Sub>

        {!ficha ? <ActivityIndicator color={COLORS.ink} style={{ marginVertical: 26 }} /> : (
          <>
            <View style={s.gasto}>
              <Sobre>Gastado en el local</Sobre>
              <Text style={s.gastoV}>{dinero(activo?.total ?? 0, moneda)}</Text>
            </View>
            <Dato l="Su barbero" v={activo?.barbero ?? masRepetido(h => h.turno_perfiles?.turno_usuarios?.nombre) ?? '—'} />
            <Dato l="Lo que pide" v={masRepetido(h => h.turno_servicios?.nombre) ?? '—'} />
            {!!ficha.prefs?.tipo_corte && <Dato l="Corte" v={ficha.prefs.tipo_corte} />}
            {!!ficha.prefs?.alergias && <Dato l="Alergias" v={ficha.prefs.alergias} color={COLORS.redText} />}

            {ficha.historial.length > 0 && (
              <>
                <Rotulo>Últimas visitas</Rotulo>
                {ficha.historial.slice(0, 6).map((h: any, i: number, arr: any[]) => (
                  <Fila key={h.id} ultima={i === arr.length - 1}
                    inicio={<Text style={s.visitaF}>{fechaCorta(h.fecha)}</Text>}
                    titulo={h.turno_servicios?.nombre ?? 'Servicio'}
                    meta={h.turno_perfiles?.turno_usuarios?.nombre ? `con ${h.turno_perfiles.turno_usuarios.nombre}` : null}
                    fin={<Text style={s.visitaP}>{dinero(h.precio_cobrado, moneda)}</Text>} />
                ))}
              </>
            )}
            <NotaLista>Las notas que cada barbero escribe de sus clientes son suyas y no se muestran aquí.</NotaLista>
          </>
        )}

        {!!telDe(activo?.telefono) && (
          <View style={s.contactoFila}>
            <Boton tipo="secondary" icono="logo-whatsapp" texto="WhatsApp" style={{ flex: 1 }}
              onPress={() => escribirCliente(telDe(activo.telefono)!, activo.nombre)} />
            <Boton tipo="secondary" icono="call-outline" texto="Llamar" style={{ flex: 1 }}
              onPress={() => llamar(telDe(activo.telefono)!)} />
          </View>
        )}
        <AhoraNo texto="Cerrar" onPress={() => setActivo(null)} />
      </Hoja>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  vacio: { fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20, color: COLORS.textLight, paddingVertical: 36, textAlign: 'center' },
  ordenes: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 6, flexWrap: 'wrap' },
  finFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dias: { fontFamily: FONTS.mono, fontSize: 18, color: COLORS.redText, marginRight: 2 },
  diasD: { fontFamily: FONTS.monoMedium, fontSize: 12, color: COLORS.textLight },
  fichaCab: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  gasto: { marginTop: 10, marginBottom: 4, padding: 14, borderRadius: 8, backgroundColor: COLORS.surfaceAlt, gap: 6 },
  gastoV: { fontFamily: FONTS.mono, fontSize: 26, letterSpacing: -0.5, color: COLORS.ink },
  visitaF: { width: 58, fontFamily: FONTS.monoMedium, fontSize: 13, color: COLORS.textMid },
  visitaP: { fontFamily: FONTS.mono, fontSize: 14, color: COLORS.ink },
  contactoFila: { flexDirection: 'row', gap: 10, marginTop: 16 },
})
