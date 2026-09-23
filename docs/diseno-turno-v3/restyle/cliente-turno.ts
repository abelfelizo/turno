// app/(app)/cliente/turno.tsx — REEMPLAZA SOLO el bloque `const s = StyleSheet.create({...})`.

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  cita: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 8, padding: 14, marginBottom: 8 },
  citaFecha: { width: 52, height: 52, borderRadius: 8, backgroundColor: '#F4F4F4', alignItems: 'center', justifyContent: 'center' },
  citaDia: { fontFamily: FONTS.monoBold, fontSize: 20, color: '#0B0B0C', lineHeight: 22 },
  citaMes: { fontFamily: FONTS.bold, fontSize: 10, color: '#5C5C5C', letterSpacing: 0.6 },
  citaServ: { fontFamily: FONTS.semibold, fontSize: 15, color: '#0B0B0C' },
  citaMeta: { fontFamily: FONTS.mono, fontSize: 13, color: '#0B0B0C', marginTop: 2 },
  citaDia2: { fontFamily: FONTS.regular, fontSize: 13, color: '#6B6B6B', marginTop: 1, textTransform: 'capitalize' },
  expirado: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 8, padding: 14, marginBottom: 16 },
  expT: { fontFamily: FONTS.semibold, fontSize: 15, color: '#C21D14' },
  expS: { fontFamily: FONTS.regular, fontSize: 13, color: '#5C5C5C', marginTop: 2 },
  turnoCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 8, overflow: 'hidden', marginBottom: 16 },
  hero: { paddingVertical: 32, paddingHorizontal: 24, alignItems: 'center' },
  heroNum: { fontFamily: FONTS.monoBold, fontSize: 112, color: '#FFFFFF', lineHeight: 116, letterSpacing: -4 },
  heroLabel: { fontFamily: FONTS.regular, fontSize: 14, color: '#FFFFFF', opacity: 0.8, marginTop: 6, textAlign: 'center' },
  heroBig: { fontFamily: FONTS.bold, fontSize: 36, color: '#FFFFFF', letterSpacing: -1, textAlign: 'center' },
  etaPill: { backgroundColor: '#1F1F1F', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, marginTop: 12 },
  etaT: { fontFamily: FONTS.semibold, fontSize: 14, color: '#FFFFFF' },
  detalle: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14, borderTopWidth: 2, borderTopColor: '#E6E6E6', borderStyle: 'dashed' },
  dServ: { fontFamily: FONTS.semibold, fontSize: 16, color: '#0B0B0C' },
  dMeta: { fontFamily: FONTS.regular, fontSize: 13, color: '#6B6B6B', marginTop: 2, textTransform: 'capitalize' },
  acciones: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingHorizontal: 14, paddingBottom: 14 },
  cta: { flex: 1, height: 52, backgroundColor: '#0B0B0C', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  ctaT: { fontFamily: FONTS.semibold, fontSize: 16, color: '#FFFFFF' },
  ctaOff: { flex: 1, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#F4F4F4', borderRadius: 8 },
  ctaOffT: { fontFamily: FONTS.semibold, fontSize: 13, color: '#6B6B6B' },
  salir: { height: 52, paddingHorizontal: 20, borderRadius: 8, borderWidth: 1, borderColor: '#E6E6E6', alignItems: 'center', justifyContent: 'center' },
  salirT: { fontFamily: FONTS.semibold, fontSize: 15, color: '#C21D14' },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: '#5C5C5C', letterSpacing: 1, marginTop: 12, marginBottom: 10 },
  empty: { fontFamily: FONTS.regular, fontSize: 14, color: '#6B6B6B', paddingVertical: 12 },
  barbero: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 8, padding: 14, marginBottom: 8 },
  barberoHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  barberoN: { fontFamily: FONTS.semibold, fontSize: 15, color: '#0B0B0C' },
  servRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F4F4F4', borderRadius: 8, padding: 14, marginTop: 8 },
  servN: { fontFamily: FONTS.semibold, fontSize: 14, color: '#0B0B0C' },
  servP: { fontFamily: FONTS.monoBold, fontSize: 15, color: '#0B0B0C' },
})

/* JSX: cambios de color (solo valores)
   - const heroBg = atendiendo ? COLORS.blue : llamado ? COLORS.success : enCamino ? COLORS.blue : COLORS.carbon
     → const heroBg = atendiendo ? '#0B0B0C' : llamado ? '#E1251B' : enCamino ? '#1E4FD8' : '#0B0B0C'
   - <ActivityIndicator size="large" color={COLORS.red}>       → color="#0B0B0C"
   - expirado <Ionicons name="time-outline" color={COLORS.red}> → color="#C21D14"
   - ctaOff  <Ionicons name="lock-closed" color={COLORS.textLight}> → sin cambio
   Texto "Disfruta tu corte ✂️": sin cambio (no se toca copy).
*/
