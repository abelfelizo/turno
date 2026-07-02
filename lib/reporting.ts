/**
 * Punto único de reporte de errores.
 *
 * Hoy es un no-op que loguea en desarrollo. Para activar Sentry (u otro)
 * en producción, inicializarlo en app/_layout.tsx y reenviar aquí:
 *   import * as Sentry from 'sentry-expo'
 *   export function reportError(e, ctx) { Sentry.Native.captureException(e, { extra: ctx }) }
 * Todo el código de la app ya llama a reportError, así que no habrá que
 * tocar los sitios de captura.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (__DEV__) {
    console.error('[reportError]', error, context ?? '')
  }
}
