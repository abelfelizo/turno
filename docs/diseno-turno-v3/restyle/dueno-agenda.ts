// app/(app)/dueno/agenda.tsx ("Cola del local") — REEMPLAZA SOLO `o` y `s`.

const o = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 8, padding: 14, marginBottom: 8 },
  t: { fontFamily: FONTS.semibold, fontSize: 15, color: '#0B0B0C' },
  d: { fontFamily: FONTS.regular, fontSize: 13, color: '#6B6B6B', marginTop: 2 },
})

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  kicker: { fontFamily: FONTS.regular, fontSize: 14, color: '#5C5C5C', textTransform: 'capitalize', marginBottom: 4 },
  silla: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#0B0B0C', borderRadius: 8, padding: 16, marginBottom: 20 },
  sillaT: { fontFamily: FONTS.semibold, fontSize: 15, color: '#FFFFFF' },
  sillaD: { fontFamily: FONTS.regular, fontSize: 13, color: '#B5B5B5', marginTop: 2 },
  hint: { fontFamily: FONTS.regular, fontSize: 13, color: '#6B6B6B', marginBottom: 6 },
  empty: { fontFamily: FONTS.regular, fontSize: 14, color: '#6B6B6B', textAlign: 'center', paddingVertical: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  pos: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F4F4F4', alignItems: 'center', justifyContent: 'center' },
  posT: { fontFamily: FONTS.monoBold, fontSize: 14, color: '#0B0B0C' },
  name: { fontFamily: FONTS.semibold, fontSize: 15, color: '#0B0B0C' },
  meta: { fontFamily: FONTS.regular, fontSize: 13, color: '#6B6B6B', marginTop: 2 },
  estado: { fontFamily: FONTS.semibold, fontSize: 13 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 36 },
  modalSub: { fontFamily: FONTS.regular, fontSize: 14, color: '#5C5C5C', marginTop: 6, marginBottom: 16 },
  modalCerrar: { fontFamily: FONTS.semibold, textAlign: 'center', color: '#6B6B6B', fontSize: 14, marginTop: 14 },
})

/* JSX: cambios de color
   - const ESTADO = { en_fila: {c: COLORS.textLight}, llamado: {c: COLORS.success}, en_camino: {c: COLORS.blue}, atendiendo: {c: COLORS.red} }
     → en_fila '#6B6B6B', llamado '#E1251B', en_camino '#1E4FD8', atendiendo '#E1251B'  (etiquetas l: sin cambio)
   - <ActivityIndicator color={COLORS.red}>  → color="#0B0B0C"
   - Opcion: color={rojo ? COLORS.red : COLORS.ink} → color={rojo ? '#C21D14' : '#0B0B0C'}  (icono y texto)
*/
