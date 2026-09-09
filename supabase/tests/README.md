# Pruebas de la base

Cubren lo que TypeScript **no puede** atrapar: reglas que viven en Postgres y se
rompen por cómo se combinan, no por cómo se escriben.

| Suite | Qué mira |
|---|---|
| `motor_cola.test.sql` | Las invariantes sueltas: orden de la fila, un-turno-activo-por-tipo (R1), gating de "voy en camino" (R2), límite de fila, orden de llamado, autorización de stats, bajas, citas grupales. |
| `autonomia.test.sql` | Quién decide qué (R11). Corre con `set local role authenticated`: si no, RLS ni se evalúa y la prueba no probaría nada. |
| `fidelidad.test.sql` | Visitas, meta, premio y canje, con la tarjeta del local y la del barbero rentado. |
| `viaje.test.sql` | El camino feliz de punta a punta, llamando a las mismas RPC que la app y en el mismo orden. |
| `obstaculos.test.sql` | El mismo día pero con fila, agenda y bloqueos **a la vez**. Los fallos que quedaban no estaban en ninguna de las tres piezas: estaban en los cruces. |
| `puertas.test.sql` | Recorre el API **como un desconocido** y comprueba que se le cierra. Las demás prueban que las cosas funcionan; esta, que no funcionan para quien no debe. |

Las tres últimas existen porque los fallos de **flujo** y de **permisos** no se
ven mirando funciones de una en una. Cada una encontró bugs de producción en su
primera corrida: un barbero sin aprobar podía llamar clientes; se podía bloquear
tiempo encima de una cita ya reservada; y la cartera de clientes de un barbero
—con teléfonos— la leía cualquiera, incluido un anónimo con la llave que viaja
dentro del APK.

## La regla de los permisos

RLS protege las **tablas**. Una función `SECURITY DEFINER` **se la salta por
definición**, así que tiene que comprobar por su cuenta quién llama. Toda
función nueva que toque datos de un local necesita su portero:

```
turno_uid()                → ¿hay alguien?
turno_es_mi_perfil(p)      → ¿es mi silla?
turno_perfil_admin(p)      → ¿soy el dueño de su local?
turno_perfil_operable(p)   → viva, aprobada, y mía o de mi local
turno_cola_operable(c)     → lo anterior, para un turno concreto
turno_mis_negocios()       → ¿pertenezco a este local?
turno_negocios_admin()     → ¿soy dueño de este local?
```

`puertas.test.sql` tiene una red que **llama** a cada función alcanzable por un
anónimo y falla si alguna muta. No lee el código: eso ya falló tres veces.

Y ojo al revocar permisos: los ayudantes que aparecen **dentro de las políticas
RLS** se evalúan con el rol de quien consulta. Quitarle el permiso a `anon`
sobre uno de ellos no lo deja fuera — hace que la política reviente con
"permission denied" en vez de devolver `false`.

## Al escribir una suite nueva

Un bloque `begin ... exception` en plpgsql **revierte sus propias sentencias** al
capturar. Crear un fixture dentro de un bloque que espera un error hace que el
fixture desaparezca y los pasos siguientes fallen por una razón falsa. Los datos
se crean fuera.

## Cómo correrlo

```bash
export DATABASE_URL='postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres'
npm run test:db          # las cinco
npm run test:db:obstaculos   # una sola
```

O pegando el archivo en el **SQL editor** de Supabase.

## Cómo leer el resultado

Cada suite **siempre termina con un `RAISE`**. Eso es intencional: obliga a
Postgres a revertir la transacción entera, de modo que los fixtures (negocio,
usuarios, perfiles, citas) **no dejan ni un registro** — importante, porque la
base es compartida con otros proyectos.

El resultado viene en el mensaje de la excepción:

```
=== MOTOR DE COLA - 12 / 12 casos OK ===
  TODO VERDE
```

Si algo falla, cada caso roto aparece con una `x` y su motivo. **Un `ERROR` de
Postgres aquí no significa que falló: significa que terminó.** Lo que importa es
el conteo y la ausencia de líneas con `x`.

## Por qué existe

En la revisión de julio se detectó que todo el proyecto se validaba únicamente
con `tsc --noEmit` (tipos) y prueba manual en el teléfono, mientras el núcleo de
la app es un motor de cola concurrente con invariantes reales.

La primera corrida ya encontró un bug de producción: `turno_agendar_grupo`
generaba un `grupo_id` suelto sin insertar en `turno_grupos`, violando la FK —
**toda reserva grupal fallaba en tiempo de ejecución**. Corregido en la
migración 32.

## Al tocar el motor de cola

Cualquier cambio a `turno_entrar_a_cola`, `turno_llamar_siguiente`,
`turno_confirmar_camino`, `turno_expirar_llamados`, `turno_agendar_grupo` o
`turno_cita_a_cola_prioritaria` debería correr `npm run test:db` entero antes de
darse por bueno. Ese último es un aviso ganado: el mismo bug —turnos sin
`tipo_servicio` y posiciones recicladas— apareció en **tres** funciones
distintas, y la tercera solo salió al probar los cruces.
