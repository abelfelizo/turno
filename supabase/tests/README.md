# Pruebas del motor de cola

`motor_cola.test.sql` cubre las invariantes que TypeScript **no puede** atrapar:
orden de la fila, un-turno-activo-por-tipo (R1), gating de "voy en camino" (R2),
límite de fila, orden de llamado, autorización de stats, bajas y citas grupales.

## Cómo correrlo

```bash
export DATABASE_URL='postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres'
npm run test:db
```

O pegando el archivo en el **SQL editor** de Supabase.

## Cómo leer el resultado

La suite **siempre termina con un `RAISE`**. Eso es intencional: obliga a
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
`turno_confirmar_camino`, `turno_expirar_llamados` o `turno_agendar_grupo`
debería correr esta suite antes de darse por bueno.
