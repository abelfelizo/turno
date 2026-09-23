// app/(app)/cliente/home.tsx — REEMPLAZA SOLO el bloque `const s = StyleSheet.create({...})`.
// Mismas claves. No toques JSX, textos ni lógica. Ver "JSX: cambios de color" al final.
// Requiere constants/index.ts nuevo (FONTS.mono / FONTS.monoBold).

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  hola: { fontFamily: FONTS.regular, fontSize: 14, color: '#5C5C5C', marginBottom: 4 },
  marcaHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  marcaSlogan: { fontFamily: FONTS.regular, fontSize: 13, color: '#5C5C5C', marginTop: 2 },
  marcaMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  marcaMeta: { fontFamily: FONTS.regular, fontSize: 13, color: '#6B6B6B' },
  barberoEsp: { fontFamily: FONTS.regular, fontSize: 13, color: '#6B6B6B', marginTop: 2 },
  noDisp: { fontFamily: FONTS.regular, fontSize: 13, color: '#6B6B6B', paddingTop: 12 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E6E6' },
  tabOn: { backgroundColor: '#0B0B0C', borderColor: '#0B0B0C' },
  tabT: { fontFamily: FONTS.semibold, fontSize: 14, color: '#5C5C5C', maxWidth: 160 },
  tabMas: { width: 38, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#E6E6E6', backgroundColor: '#FFFFFF' },
  rowLbl: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },
  fila: { backgroundColor: '#0B0B0C', borderRadius: 8, padding: 18, marginBottom: 22 },
  filaLbl: { fontFamily: FONTS.bold, fontSize: 11, color: '#FF5A4F', letterSpacing: 1.2 },
  filaTitle: { fontFamily: FONTS.semibold, fontSize: 18, color: '#FFFFFF', marginTop: 6 },
  filaSub: { fontFamily: FONTS.mono, fontSize: 14, color: '#B5B5B5', marginTop: 2 },
  filaLink: { fontFamily: FONTS.semibold, fontSize: 14, color: '#FFFFFF' },
  cita: { flexDirection: 'row', gap: 14, backgroundColor: '#FFFFFF', borderRadius: 8, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E6E6E6' },
  citaIcon: { width: 52, height: 52, borderRadius: 8, backgroundColor: '#F4F4F4', alignItems: 'center', justifyContent: 'center' },
  citaTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  citaKick: { fontFamily: FONTS.bold, fontSize: 11, color: '#5C5C5C', letterSpacing: 1 },
  citaCd: { fontFamily: FONTS.mono, fontSize: 12, color: '#C21D14' },
  citaServ: { fontFamily: FONTS.semibold, fontSize: 16, color: '#0B0B0C', marginTop: 4 },
  citaMeta: { fontFamily: FONTS.mono, fontSize: 13, color: '#6B6B6B', marginTop: 2 },
  citaAcc: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12 },
  citaBtn: { backgroundColor: '#0B0B0C', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  citaBtnT: { fontFamily: FONTS.semibold, color: '#FFFFFF', fontSize: 13 },
  citaReprog: { fontFamily: FONTS.semibold, color: '#1E4FD8', fontSize: 13 },
  citaCancel: { fontFamily: FONTS.semibold, color: '#6B6B6B', fontSize: 13 },
  sec: { fontFamily: FONTS.bold, fontSize: 12, color: '#5C5C5C', letterSpacing: 1, marginTop: 10, marginBottom: 10 },
  empty: { fontFamily: FONTS.regular, fontSize: 14, color: '#6B6B6B', paddingVertical: 20, textAlign: 'center' },
  reservar: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#FFFFFF', borderRadius: 8, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E6E6E6' },
  resIcon: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#F4F4F4', alignItems: 'center', justifyContent: 'center' },
  resTitle: { fontFamily: FONTS.semibold, fontSize: 15, color: '#0B0B0C' },
  resSub: { fontFamily: FONTS.regular, fontSize: 13, color: '#6B6B6B', marginTop: 2 },
  barbero: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 8, padding: 14, marginBottom: 8 },
  barberoHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nombreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barberoNombre: { fontFamily: FONTS.semibold, fontSize: 15, color: '#0B0B0C' },
  tipoTag: { borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  tipoTagT: { fontFamily: FONTS.semibold, fontSize: 10, color: '#5C5C5C' },
  estadoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  barberoEstado: { fontFamily: FONTS.regular, fontSize: 13, color: '#6B6B6B' },
  servicio: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F4F4F4', borderRadius: 8, padding: 14, marginTop: 8 },
  servSolo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 8, padding: 14, marginBottom: 8 },
  servNombre: { fontFamily: FONTS.semibold, fontSize: 15, color: '#0B0B0C' },
  servMeta: { fontFamily: FONTS.mono, fontSize: 13, color: '#6B6B6B', marginTop: 2 },
  precio: { fontFamily: FONTS.monoBold, fontSize: 16, color: '#0B0B0C' },
  pts: { backgroundColor: '#0B0B0C', borderRadius: 8, padding: 16, marginTop: 12, marginBottom: 22 },
  ptsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ptsLbl: { fontFamily: FONTS.bold, fontSize: 11, color: '#B5B5B5', letterSpacing: 1.2 },
  ptsNum: { fontFamily: FONTS.monoBold, fontSize: 18, color: '#FFFFFF' },
  barBg: { height: 6, borderRadius: 3, backgroundColor: '#2A2A2A', marginTop: 12, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: '#E1251B' },
  ptsFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  ptsMeta: { fontFamily: FONTS.regular, fontSize: 13, color: '#B5B5B5' },
  ptsFaltan: { fontFamily: FONTS.semibold, fontSize: 13, color: '#FF5A4F' },
  histHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  verTodo: { fontFamily: FONTS.semibold, fontSize: 13, color: '#1E4FD8', marginBottom: 10 },
  histItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  histServ: { fontFamily: FONTS.semibold, fontSize: 15, color: '#0B0B0C' },
  histMeta: { fontFamily: FONTS.mono, fontSize: 13, color: '#6B6B6B', marginTop: 2 },
  histPrecio: { fontFamily: FONTS.monoBold, fontSize: 14, color: '#0B0B0C' },
})

/* JSX: cambios de color (solo el valor de la prop `color`, nada más)
   - <ActivityIndicator ... color={COLORS.red}>                  → color="#0B0B0C"
   - tabMas  <Ionicons name="add" ... color={COLORS.red}>         → color="#0B0B0C"
   - tabMas  <Ionicons name="person-add-outline" color={COLORS.blue}> → color="#0B0B0C"
   - fila    <Ionicons name="flash" ... color={COLORS.red}>       → color="#FF5A4F"
   - citaIcon <Ionicons name="calendar" ... color={COLORS.red}>   → color="#0B0B0C"
   - resIcon <Ionicons name="calendar-outline" color={COLORS.red}> → color="#0B0B0C"
   - <Dot color={disp ? COLORS.success : COLORS.textLight}>       → sin cambio
   - <Avatar ... bg={COLORS.carbon}>                              → sin cambio (el nuevo Avatar lo ignora)
*/
