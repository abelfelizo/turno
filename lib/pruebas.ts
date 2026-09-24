/**
 * PUERTA DE PRUEBAS · temporal, y apagada salvo donde se enciende a mano.
 *
 * Existe para no perder media hora creando correos cada vez que hay que ver la
 * app desde otro rol. Se quita cuando el onboarding esté como debe ser.
 *
 * ── POR QUÉ ESTO NO ES EL BACKDOOR QUE SE CERRÓ ─────────────────────────────
 * Aquel entraba sin autenticarse y falseaba la sesión. Éste NO se salta nada:
 * las cuentas de abajo son cuentas de verdad con su contraseña de verdad, y la
 * pantalla llama a `signInWithPassword` como lo haría cualquiera. Por tanto
 * `auth.uid()` es real y RLS y todos los porteros del servidor se aplican
 * igual. Lo único que ahorra es teclear el correo y esperar el código — que es
 * exactamente lo que se quería ahorrar.
 *
 * El interruptor viene de `eas.json`, donde SOLO está en los perfiles de
 * desarrollo y de preview. En production no existe la variable, así que
 * `ENCENDIDA` es false y la pantalla no se pinta ni se puede alcanzar. El
 * workflow de OTA inyecta en el bundle todo el `env` del perfil del canal, así
 * que esto llega al teléfono en preview sin hacer nada más.
 */

export const ENCENDIDA = process.env.EXPO_PUBLIC_PUERTA_PRUEBAS === '1'

/** La misma para todas. Las cuentas solo existen en el juego de pruebas. */
export const CLAVE = 'Turno.Pruebas.2026'

export type Personaje = {
  email: string
  nombre: string
  papel: string
  /** Qué se mira entrando con éste. */
  para: string
}

/**
 * El reparto lo crea `supabase/semillas/puerta_de_pruebas.sql`. Si esta lista y
 * aquel archivo se separan, manda el archivo: aquí solo hay etiquetas.
 */
export const REPARTO: { grupo: string; gente: Personaje[] }[] = [
  {
    grupo: 'Barbería con empleados · código PRU-EMPL',
    gente: [
      { email: 'admin-empleados@turno.test', nombre: 'Ana Admin', papel: 'Administradora · atiende',
        para: 'El panel del local: cola, equipo, ingresos y ajustes.' },
      { email: 'empleado@turno.test', nombre: 'Beto Empleado', papel: 'Empleado · pasivo',
        para: 'El empleado por defecto: la barbería le asigna el trabajo, él no reparte la fila.' },
      { email: 'empleado-activo@turno.test', nombre: 'Caro Activa', papel: 'Empleado · con permiso',
        para: 'El mismo rol, pero con «aceptar clientes por mi cuenta» encendido.' },
      { email: 'manicurista@turno.test', nombre: 'Dana Uñas', papel: 'Empleada · otro oficio',
        para: 'El doble servicio: primero el barbero, después ella.' },
    ],
  },
  {
    grupo: 'Barbería de alquiler · código PRU-RENT',
    gente: [
      { email: 'admin-alquiler@turno.test', nombre: 'Fabio Casero', papel: 'Administrador · NO atiende',
        para: 'El casero puro: ve visitas, nunca el dinero de sus inquilinos.' },
      { email: 'rentado@turno.test', nombre: 'Gabo Rentado', papel: 'Paga su asiento',
        para: 'Manda en su silla dentro de un local ajeno: precios, horario y cartera suyos.' },
    ],
  },
  {
    grupo: 'Por su cuenta',
    gente: [
      { email: 'independiente@turno.test', nombre: 'Iris Sola', papel: 'Su propio espacio · PRU-SOLO',
        para: 'El barbero sin local: su código, su fila y su agenda.' },
      { email: 'dos-sitios@turno.test', nombre: 'Pedro Dos Sitios', papel: 'Empleado + espacio propio',
        para: 'El caso difícil: dos sillas con reglas distintas y un solo código de barbero.' },
    ],
  },
  {
    grupo: 'Clientes',
    gente: [
      { email: 'cliente@turno.test', nombre: 'Eli Cliente', papel: 'En los DOS locales',
        para: 'Cómo se elige entre barberías y entre barberos.' },
      { email: 'cliente-b@turno.test', nombre: 'Hilda Cliente', papel: 'Solo en el de alquiler',
        para: 'El cliente de un local donde cada silla es un negocio aparte.' },
    ],
  },
]
