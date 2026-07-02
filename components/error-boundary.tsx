import { Component, ReactNode } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { COLORS, FONTS } from '../constants'

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * Red de seguridad global: captura errores de render para que un fallo en una
 * pantalla no deje la app en blanco. Muestra una pantalla de reintento.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    // Punto único para enganchar reporting (Sentry, etc.) en el futuro.
    console.error('ErrorBoundary capturó:', error)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      return (
        <View style={s.c}>
          <Text style={s.emoji}>✂️</Text>
          <Text style={s.title}>Algo salió mal</Text>
          <Text style={s.sub}>Ocurrió un error inesperado. Intenta de nuevo.</Text>
          <TouchableOpacity style={s.btn} onPress={this.reset}>
            <Text style={s.btnT}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )
    }
    return this.props.children
  }
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.carbon, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emoji: { fontSize: 44, marginBottom: 12 },
  title: { fontFamily: FONTS.extrabold, fontSize: 22, color: '#fff', marginBottom: 8 },
  sub: { fontFamily: FONTS.medium, fontSize: 14, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: 28 },
  btn: { backgroundColor: COLORS.red, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 32 },
  btnT: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
})
