// components/hoja-fila.tsx — REEMPLAZA SOLO `s`.

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 36 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#E6E6E6', marginBottom: 16 },
  sub: { fontFamily: FONTS.regular, fontSize: 14, color: '#5C5C5C', marginBottom: 18 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 8, padding: 14, marginBottom: 10 },
  barbero: { fontFamily: FONTS.semibold, fontSize: 16, color: '#0B0B0C' },
  serv: { fontFamily: FONTS.regular, fontSize: 13, color: '#6B6B6B', marginTop: 2 },
  precio: { fontFamily: FONTS.monoBold, fontSize: 16, color: '#0B0B0C' },
  info: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B0B0C', borderRadius: 8, padding: 18, marginBottom: 10, minHeight: 88 },
  infoCol: { flex: 1, alignItems: 'center' },
  infoNum: { fontFamily: FONTS.monoBold, fontSize: 34, color: '#FFFFFF' },
  infoLbl: { fontFamily: FONTS.regular, fontSize: 12, color: '#B5B5B5', marginTop: 2 },
  divisor: { width: 0, height: 44, borderLeftWidth: 2, borderLeftColor: '#3A3A3A', borderStyle: 'dashed' },
  aviso: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F4F4F4', borderRadius: 8, padding: 12, marginBottom: 18 },
  avisoT: { flex: 1, fontFamily: FONTS.regular, fontSize: 13, color: '#5C5C5C' },
  cta: { height: 54, backgroundColor: '#E1251B', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  ctaT: { fontFamily: FONTS.semibold, fontSize: 16, color: '#FFFFFF' },
  cancel: { fontFamily: FONTS.semibold, textAlign: 'center', color: '#6B6B6B', fontSize: 14, marginTop: 14 },
})

/* JSX: <ActivityIndicator color={COLORS.red}> (el de "cargando") → color="#FFFFFF" (va sobre fondo negro) */
