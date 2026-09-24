// components/agenda-trabajo.tsx (pantalla "Mi agenda" del barbero)
// REEMPLAZA SOLO los bloques StyleSheet `op`, `fc`, `gs` y `s`. Mismas claves.

const op = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 8, padding: 14, marginBottom: 8 },
  t: { fontFamily: FONTS.semibold, fontSize: 15, color: '#0B0B0C' },
  d: { fontFamily: FONTS.regular, fontSize: 13, color: '#6B6B6B', marginTop: 2 },
})

const fc = StyleSheet.create({
  chip: { borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  l: { fontFamily: FONTS.bold, fontSize: 10, color: '#5C5C5C', letterSpacing: 0.8, textTransform: 'uppercase' },
  v: { fontFamily: FONTS.semibold, fontSize: 14, color: '#0B0B0C', marginTop: 1 },
})

const gs = StyleSheet.create({
  num: { fontFamily: FONTS.monoBold, fontSize: 28, color: '#FFFFFF' },
  lbl: { fontFamily: FONTS.regular, fontSize: 11, color: '#B5B5B5', marginTop: 2 },
})

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  kicker: { fontFamily: FONTS.regular, fontSize: 14, color: '#5C5C5C', textTransform: 'capitalize', marginBottom: 4 },
  codigoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 8, padding: 14, marginBottom: 14 },
  codigoLbl: { fontFamily: FONTS.bold, fontSize: 11, color: '#5C5C5C', letterSpacing: 1 },
  codigoVal: { fontFamily: FONTS.monoBold, fontSize: 24, color: '#0B0B0C', letterSpacing: 3, marginTop: 2 },
  codigoShare: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#0B0B0C', alignItems: 'center', justifyContent: 'center' },
  diasWrap: { marginBottom: 16 },
  dia: { width: 52, height: 66, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E6E6' },
  diaOn: { backgroundColor: '#0B0B0C', borderColor: '#0B0B0C' },
  diaSem: { fontFamily: FONTS.medium, fontSize: 11, color: '#5C5C5C', letterSpacing: 0.4 },
  diaNum: { fontFamily: FONTS.monoBold, fontSize: 18, color: '#0B0B0C', marginTop: 1 },
  diaTxtOn: { color: '#FFFFFF' },
  diaDot: { width: 4, height: 4, borderRadius: 2, marginTop: 4, backgroundColor: 'transparent' },
  diaDotHay: { backgroundColor: '#E1251B' },
  diaDotOn: { backgroundColor: '#FFFFFF' },
  avisoDia: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F4F4F4', borderRadius: 8, padding: 12, marginBottom: 14 },
  avisoDiaT: { flex: 1, fontFamily: FONTS.regular, fontSize: 13, color: '#5C5C5C' },
  valeBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#1E4FD8', borderRadius: 8, padding: 13, marginTop: -6, marginBottom: 14 },
  valeBarT: { flex: 1, fontFamily: FONTS.semibold, fontSize: 13, color: '#FFFFFF' },
  estadoBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 8, padding: 14, marginBottom: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E6E6' },
  estadoPunto: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#6B6B6B' },
  estadoT: { fontFamily: FONTS.semibold, fontSize: 16, color: '#0B0B0C' },
  estadoD: { fontFamily: FONTS.regular, fontSize: 13, color: '#6B6B6B', marginTop: 2 },
  estadoBtn: { borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  estadoBtnT: { fontFamily: FONTS.semibold, fontSize: 13, color: '#0B0B0C' },
  colaBox: { backgroundColor: '#0B0B0C', borderRadius: 8, padding: 18, marginBottom: 14 },
  colaTitle: { fontFamily: FONTS.bold, fontSize: 11, color: '#B5B5B5', letterSpacing: 1.2, marginBottom: 14 },
  colaStats: { flexDirection: 'row', justifyContent: 'space-between' },
  ocupado: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#0B0B0C', borderRadius: 8, padding: 14, marginBottom: 14 },
  ocupadoLbl: { fontFamily: FONTS.bold, fontSize: 11, color: '#B5B5B5', letterSpacing: 1.2 },
  ocupadoT: { fontFamily: FONTS.semibold, fontSize: 16, color: '#FFFFFF', marginTop: 2 },
  ocupadoBtn: { backgroundColor: '#FFFFFF', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  ocupadoBtnT: { fontFamily: FONTS.semibold, fontSize: 13, color: '#0B0B0C' },
  olvido: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#E1251B', borderRadius: 8, padding: 13, marginBottom: 10 },
  olvidoT: { flex: 1, fontFamily: FONTS.semibold, fontSize: 13, color: '#FFFFFF' },
  llamado: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0B0B0C', borderRadius: 8, padding: 18, marginBottom: 14 },
  llamadoLbl: { fontFamily: FONTS.bold, fontSize: 11, color: '#FF5A4F', letterSpacing: 1.2 },
  llamadoName: { fontFamily: FONTS.semibold, fontSize: 20, color: '#FFFFFF', marginTop: 4 },
  llamadoServ: { fontFamily: FONTS.regular, fontSize: 13, color: '#B5B5B5', marginTop: 2 },
  atenderBtn: { backgroundColor: '#FFFFFF', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  atenderT: { fontFamily: FONTS.semibold, fontSize: 14, color: '#0B0B0C' },
  avisarBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1F1F1F', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  avisarT: { fontFamily: FONTS.semibold, fontSize: 12, color: '#FFFFFF' },
  masBtn: { backgroundColor: '#1F1F1F', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, justifyContent: 'center' },
  ficha: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 8, padding: 14, marginTop: -6, marginBottom: 14 },
  fichaTitle: { fontFamily: FONTS.bold, fontSize: 11, color: '#5C5C5C', letterSpacing: 1, marginBottom: 10 },
  fichaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fichaAlerta: { fontFamily: FONTS.semibold, fontSize: 13, color: '#C21D14', marginTop: 10 },
  fichaNota: { fontFamily: FONTS.regular, fontSize: 13, color: '#5C5C5C', marginTop: 8, fontStyle: 'italic' },
  fichaNotaPriv: { fontFamily: FONTS.regular, fontSize: 13, color: '#5C5C5C', marginTop: 6 },
  siguiente: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0B0B0C', borderRadius: 8, padding: 18, marginBottom: 16 },
  sigLbl: { fontFamily: FONTS.bold, fontSize: 11, color: '#B5B5B5', letterSpacing: 1.2 },
  sigName: { fontFamily: FONTS.semibold, fontSize: 20, color: '#FFFFFF', marginTop: 4 },
  sigServ: { fontFamily: FONTS.regular, fontSize: 13, color: '#B5B5B5', marginTop: 2 },
  llamarBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E1251B', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8 },
  llamarT: { fontFamily: FONTS.semibold, fontSize: 15, color: '#FFFFFF' },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: '#5C5C5C', letterSpacing: 1, marginTop: 12, marginBottom: 8 },
  verTodos: { fontFamily: FONTS.semibold, fontSize: 13, color: '#1E4FD8', textAlign: 'center', paddingVertical: 12 },
  secHint: { fontFamily: FONTS.regular, fontSize: 13, color: '#6B6B6B', marginTop: -4, marginBottom: 6 },
  empty: { fontFamily: FONTS.regular, fontSize: 14, color: '#6B6B6B', textAlign: 'center', paddingVertical: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  rowBloq: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F4F4F4', borderRadius: 8, padding: 12, marginBottom: 8 },
  pos: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F4F4F4', alignItems: 'center', justifyContent: 'center' },
  posT: { fontFamily: FONTS.monoBold, fontSize: 14, color: '#0B0B0C' },
  rowName: { fontFamily: FONTS.semibold, fontSize: 15, color: '#0B0B0C' },
  rowServ: { fontFamily: FONTS.regular, fontSize: 13, color: '#6B6B6B', marginTop: 2 },
  walkin: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, height: 52, backgroundColor: '#0B0B0C', borderRadius: 8, marginTop: 16 },
  walkinT: { fontFamily: FONTS.semibold, fontSize: 16, color: '#FFFFFF' },
  bloquear: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, height: 52, borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 8, marginTop: 8 },
  bloquearT: { fontFamily: FONTS.semibold, fontSize: 15, color: '#0B0B0C' },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 8, padding: 8 },
  stepBtn: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#F4F4F4', alignItems: 'center', justifyContent: 'center' },
  stepT: { fontFamily: FONTS.semibold, fontSize: 22, color: '#0B0B0C' },
  stepVal: { fontFamily: FONTS.monoBold, fontSize: 16, color: '#0B0B0C' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 36 },
  modalSub: { fontFamily: FONTS.regular, fontSize: 14, color: '#5C5C5C', marginTop: 6, marginBottom: 16 },
  flabel: { fontFamily: FONTS.bold, fontSize: 12, color: '#5C5C5C', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, marginTop: 8 },
  input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 8, padding: 14, fontSize: 15, fontFamily: FONTS.regular, color: '#0B0B0C', marginBottom: 12 },
  modalBtn: { height: 52, backgroundColor: '#0B0B0C', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  peligroBtn: { height: 52, backgroundColor: '#E1251B', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  peligroT: { fontFamily: FONTS.semibold, fontSize: 16, color: '#FFFFFF' },
  modalBtnT: { fontFamily: FONTS.semibold, fontSize: 16, color: '#FFFFFF' },
  wServ: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 8, padding: 14, marginBottom: 8 },
  wServN: { fontFamily: FONTS.semibold, fontSize: 15, color: '#0B0B0C' },
  wServD: { fontFamily: FONTS.mono, fontSize: 13, color: '#6B6B6B', marginTop: 2 },
  modalCerrar: { fontFamily: FONTS.semibold, textAlign: 'center', color: '#6B6B6B', fontSize: 14, marginTop: 14 },
})

/* JSX: cambios de color / estilo (solo estos, nada más)
   1. const EST_FONDO = { libre: COLORS.success, atendiendo: COLORS.blue, descanso: COLORS.warning, inactivo: COLORS.textLight }
      → const EST_FONDO = { libre: '#1F9D55', atendiendo: '#E1251B', descanso: '#6B6B6B', inactivo: '#B5B5B5' }
   2. El color de EST_FONDO se aplica al PUNTO, no a la caja:
      <View style={[s.estadoBox, EST_FONDO[estado.estado] ? { backgroundColor: EST_FONDO[estado.estado] } : null]}>
      → <View style={s.estadoBox}>
      <View style={s.estadoPunto} />
      → <View style={[s.estadoPunto, EST_FONDO[estado.estado] ? { backgroundColor: EST_FONDO[estado.estado] } : null]} />
   3. Grupo: <Text style={[gs.num, hl && { color: COLORS.red }]}> → { color: '#FF5A4F' }
   4. codigoShare <Ionicons name="share-outline" color="#fff">   → sin cambio
   5. <ActivityIndicator color={COLORS.red}> (ambos)             → color="#0B0B0C"
   6. wServ <Ionicons ... size={28} color={COLORS.red}>          → size={22} color="#0B0B0C"
   7. rowBloq/bloquear <Ionicons color={COLORS.textMid}>         → sin cambio
*/
