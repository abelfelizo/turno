// components/panel-badge.tsx — REEMPLAZA SOLO `s` y el mapa FONDO.

// El color por panel se mantiene (es la señal de "dónde estoy"), con los hex del sistema nuevo.
const FONDO: Record<string, string> = { cliente: '#1E4FD8', barberia: '#0B0B0C', silla: '#E1251B' }

const s = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginBottom: 12 },
  txt: { fontFamily: FONTS.bold, fontSize: 11, color: '#FFFFFF', letterSpacing: 1, maxWidth: 220 },
})
