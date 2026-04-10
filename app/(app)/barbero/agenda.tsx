import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { useEffect, useState, useCallback } from 'react'
import { getCitasHoy, getColaActiva, actualizarEstadoCita, actualizarEstadoCola } from '../../../lib/db'
import { suscribirCola, suscribirCitas, desuscribir } from '../../../lib/realtime'
import { getSesion } from '../../../lib/storage'
import { COLORS } from '../../../constants'
import { Cita, Cola } from '../../../types'

export default function Agenda() {
  const [citas, setCitas] = useState<Cita[]>([])
  const [cola, setCola] = useState<Cola[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sesion, setSesion] = useState<any>(null)

  async function cargar() {
    const s = await getSesion()
    setSesion(s)
    if (!s?.perfil_id) { setLoading(false); return }
    const [c, q] = await Promise.all([
      getCitasHoy(s.perfil_id),
      getColaActiva(s.negocio_id!, s.perfil_id)
    ])
    setCitas(c as any)
    setCola(q as any)
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => {
    cargar()
    // Realtime subscriptions
    let subCola: any, subCitas: any
    getSesion().then(s => {
      if (!s) return
      subCola = suscribirCola(s.negocio_id!, () => cargar())
      subCitas = suscribirCitas(s.perfil_id!, new Date().toISOString().split('T')[0], () => cargar())
    })
    return () => { if (subCola) desuscribir(subCola); if (subCitas) desuscribir(subCitas) }
  }, [])

  const onRefresh = useCallback(() => { setRefreshing(true); cargar() }, [])

  const getEstadoColor = (estado: string) => {
    if (estado === 'confirmada') return COLORS.success
    if (estado === 'no_llego' || estado === 'no_confirmada') return COLORS.danger
    if (estado === 'en_camino') return COLORS.info
    if (estado === 'atendida') return COLORS.textLight
    return COLORS.warning
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={COLORS.primary} size="large"/></View>

  return (
    <ScrollView style={s.container} contentContainerStyle={{padding:16,paddingTop:56}}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh}/>}>
      <Text style={s.title}>Mi Agenda</Text>
      <Text style={s.fecha}>{new Date().toLocaleDateString('es-DO',{weekday:'long',day:'numeric',month:'long'})}</Text>

      {/* COLA EN TIEMPO REAL */}
      <View style={s.colaBox}>
        <Text style={s.colaTitle}>Cola ahora</Text>
        <View style={s.colaStats}>
          <View style={s.colaStat}>
            <Text style={s.colaNum}>{cola.filter(c=>c.prioridad===1).length}</Text>
            <Text style={s.colaLabel}>Prioritarios</Text>
          </View>
          <View style={s.colaStat}>
            <Text style={s.colaNum}>{cola.filter(c=>c.prioridad===2).length}</Text>
            <Text style={s.colaLabel}>Digital</Text>
          </View>
          <View style={s.colaStat}>
            <Text style={s.colaNum}>{cola.filter(c=>c.prioridad===3).length}</Text>
            <Text style={s.colaLabel}>Físico</Text>
          </View>
          <View style={s.colaStat}>
            <Text style={[s.colaNum,{color:COLORS.gold}]}>{cola.length}</Text>
            <Text style={s.colaLabel}>Total</Text>
          </View>
        </View>
      </View>

      {/* SIGUIENTE EN COLA */}
      {cola.length > 0 && (
        <TouchableOpacity style={s.siguiente} onPress={async () => {
          const next = cola[0]
          if (next) { await actualizarEstadoCola(next.id, 'llamado', { llamado_at: new Date().toISOString() }); cargar() }
        }}>
          <View>
            <Text style={s.sigLabel}>Siguiente</Text>
            <Text style={s.sigNombre}>{(cola[0] as any).turno_usuarios?.nombre || 'Cliente'}</Text>
            <Text style={s.sigServicio}>{(cola[0] as any).turno_servicios?.nombre}</Text>
          </View>
          <Text style={s.sigBtn}>Llamar →</Text>
        </TouchableOpacity>
      )}

      {/* CITAS DEL DÍA */}
      <Text style={s.sec}>Citas de hoy</Text>
      {citas.length === 0 && <Text style={s.empty}>Sin citas para hoy</Text>}
      {citas.map((cita: any) => (
        <TouchableOpacity key={cita.id} style={s.card}>
          <View style={s.cardLeft}>
            <View style={s.avatar}>
              <Text style={s.avT}>{(cita.turno_usuarios?.nombre||'XX').slice(0,2).toUpperCase()}</Text>
            </View>
            <View>
              <Text style={s.nombre}>{cita.turno_usuarios?.nombre}</Text>
              <Text style={s.servicio}>{cita.turno_servicios?.nombre} · {cita.hora_inicio.slice(0,5)}</Text>
            </View>
          </View>
          <View style={[s.pill,{backgroundColor: getEstadoColor(cita.estado)+'22'}]}>
            <Text style={[s.pillT,{color: getEstadoColor(cita.estado)}]}>{cita.estado}</Text>
          </View>
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={s.walkinBtn}>
        <Text style={s.walkinT}>+ Atender cliente sin cita</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.bloquearBtn}>
        <Text style={s.bloquearT}>+ Bloquear hora</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:COLORS.bg},
  center:{flex:1,alignItems:'center',justifyContent:'center'},
  title:{fontSize:28,fontWeight:'800',color:COLORS.primary,marginBottom:2},
  fecha:{fontSize:13,color:COLORS.textLight,marginBottom:20,textTransform:'capitalize'},
  colaBox:{backgroundColor:COLORS.primary,borderRadius:16,padding:16,marginBottom:16},
  colaTitle:{fontSize:12,color:'rgba(255,255,255,0.5)',marginBottom:12,textTransform:'uppercase',letterSpacing:1},
  colaStats:{flexDirection:'row',justifyContent:'space-around'},
  colaStat:{alignItems:'center'},
  colaNum:{fontSize:28,fontWeight:'800',color:'#fff'},
  colaLabel:{fontSize:10,color:'rgba(255,255,255,0.4)',marginTop:2},
  siguiente:{backgroundColor:COLORS.gold,borderRadius:14,padding:16,flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:16},
  sigLabel:{fontSize:11,color:COLORS.primary,marginBottom:2,textTransform:'uppercase',letterSpacing:1},
  sigNombre:{fontSize:18,fontWeight:'800',color:COLORS.primary},
  sigServicio:{fontSize:12,color:COLORS.primary,opacity:0.7,marginTop:2},
  sigBtn:{fontSize:16,fontWeight:'700',color:COLORS.primary},
  sec:{fontSize:11,fontWeight:'700',color:'#ccc',textTransform:'uppercase',letterSpacing:1,marginBottom:10},
  empty:{fontSize:14,color:COLORS.textLight,textAlign:'center',paddingVertical:20},
  card:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderWidth:1.5,borderColor:COLORS.border,borderRadius:14,padding:14,marginBottom:8},
  cardLeft:{flexDirection:'row',alignItems:'center',gap:12},
  avatar:{width:42,height:42,borderRadius:21,backgroundColor:COLORS.purpleLight,alignItems:'center',justifyContent:'center'},
  avT:{fontSize:14,fontWeight:'700',color:COLORS.purple},
  nombre:{fontSize:14,fontWeight:'700',color:COLORS.text},
  servicio:{fontSize:12,color:COLORS.textLight,marginTop:2},
  pill:{paddingHorizontal:10,paddingVertical:4,borderRadius:20},
  pillT:{fontSize:11,fontWeight:'700'},
  walkinBtn:{backgroundColor:COLORS.primary,borderRadius:14,padding:14,alignItems:'center',marginBottom:10,marginTop:8},
  walkinT:{color:'#fff',fontWeight:'700'},
  bloquearBtn:{borderWidth:1.5,borderColor:COLORS.border,borderRadius:14,padding:14,alignItems:'center'},
  bloquearT:{color:COLORS.textLight,fontWeight:'600'},
})
