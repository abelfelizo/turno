# La tarjeta unificada — todos los estados

Sacados del modelo de datos real, no inventados: `turno_cola.estado`,
`modo_atencion`, `fila_abierta` / `fila_motivo`, `expira_at`, y las
condiciones de local sin servicio que ya existen en el código.

**Son 17 estados.** Trece del dominio, tres de la propia tarjeta, uno de
cuenta nueva.

---

## 1 · Los dos ejes

| Eje | Valores |
|---|---|
| **Tu turno** | ninguno · `en_fila` · `llamado` · `en_camino` · `atendiendo` · expirado |
| **El local** | fila abierta · solo citas · solo fila · cerrado (con motivo) · sin servicio |

**No son independientes, y esa es la regla que ordena todo:**

> Si tienes turno, **tu turno manda**. El estado del local pasa a ser una nota
> al pie. Si no tienes turno, **manda el local**.

Es lo que hace que la tarjeta no se convierta en una tabla de 30 combinaciones.

---

## 2 · La cifra grande — una ranura, seis significados

La tarjeta tiene **un solo hueco para la cifra en Anton**. Lo que ocupa ese
hueco es la decisión de diseño más importante de toda la propuesta, porque es
lo único que se lee a un metro de distancia.

| Estado | Cifra | Rótulo debajo |
|---|---|---|
| Sin turno, hay espera | `25′` | DE ESPERA |
| Sin turno, nadie esperando | `0` | ENTRAS DIRECTO |
| Sin turno, solo citas | `3:30` | PRÓXIMA LIBRE |
| En la fila | `3º` | EN LA FILA |
| Te llamaron | `4′` | PARA LLEGAR |
| En la silla | `AHORA` | TE ESTÁN ATENDIENDO |
| Local cerrado | *(sin cifra)* | el motivo ocupa su sitio |

**La cifra cambia de significado al entrar a la fila, a propósito.** Sin turno,
lo que importa es cuánto esperarías. Con turno, lo que esperan los demás deja
de ser asunto tuyo: lo tuyo es tu puesto. Y cuando te llaman, lo único que
importa es cuánto te queda para llegar.

---

## 3 · Estados sin turno — manda el local

### E1 · Abierto, hay cola
```
▨▨▨ poste ▨▨▨
BARBERÍA DÁVILA                    ● ABIERTO
  25′                3 esperando
  DE ESPERA          2 sillas · 1 libre
  Jeison libre · Ana 2 esperando
──────────────────────────────────────────
[ FILA AHORA ]          [ AGENDAR ]
```

### E2 · Abierto, nadie esperando
Cifra `0`, rótulo `ENTRAS DIRECTO`. El botón rojo dice **ENTRAR YA**, no «Fila
ahora»: no hay fila a la que entrar.

### E3 · Abierto solo con cita — `modo_atencion = 'solo_citas'`
**Desaparece el botón de fila.** Queda `AGENDAR` solo, y ocupa el ancho
completo. La cifra pasa a ser la próxima hora libre.
Nota: `Hoy solo con cita`.

> Sin esto, el botón rojo lleva a una pantalla que va a rechazar al cliente con
> el mismo motivo que el servidor ya conoce. Es la puerta abierta a un sitio
> donde no hay nada.

### E4 · Abierto solo fila — `modo_atencion = 'solo_fila'`
Desaparece `AGENDAR`. `FILA AHORA` a ancho completo.

### E5 · Cerrado ahora, un solo motivo
```
▨▨▨ poste apagado ▨▨▨
BARBERÍA DÁVILA                    ○ CERRADO
  Su fila abre de 9:00 a 6:00
  Jeison cerrado · Ana cerrado
──────────────────────────────────────────
[ AGENDAR PARA OTRO DÍA ]
```
**Sin cifra grande.** Poner un `0` sería contestar una pregunta que nadie hizo.
El motivo viene del servidor, palabra por palabra: es el mismo texto con el que
rechazaría el turno.

### E6 · Cerrado, motivos distintos por silla
Desde que cada barbero cierra su jornada por su cuenta, dos motivos distintos
dejó de ser el caso raro. Resumen arriba, y debajo silla por silla con su
razón. Sin resumen inventado.

### E7 · Sin servicio — ninguna silla activa
Tarjeta **apagada**: contorno carbón en vez de relleno, sin poste animado, sin
botones.
> «Todavía no atienden por la app.» Frase neutra: el cliente no tiene por qué
> enterarse de que su barbero no pagó la suscripción.

---

## 4 · Estados con turno — manda tu turno

### E8 · En la fila — `en_fila`
```
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│ ▨▨▨ poste ▨▨▨            BD-208   │
│ EN LA FILA · BARBERÍA DÁVILA      │
│  3º            Corte + barba      │
│  EN LA FILA    con Jeison         │
│  ≈ 25′ · te toca sobre las 3:40   │
│ · · · · · perforación · · · · · · │
│ [ VOY EN CAMINO ]      Cancelar   │
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

### E9 · Eres el siguiente — `en_fila`, puesto 1
Cifra `1º`, rótulo `ERES EL SIGUIENTE`. **Filete rojo de 3 px a la izquierda.**
Todavía no es rojo macizo: aún no te han llamado, y gastar el grito aquí lo
desactiva para cuando de verdad haga falta.

### E10 · Vas en camino — `en_camino`
`VOY EN CAMINO` desaparece (ya lo pulsaste) y en su sitio queda un estado, no
un botón: `● Vas en camino`. Solo `Cancelar`.

### E11 · Te llamaron — `llamado`, con `expira_at`
**El único estado en rojo macizo de toda la app.**
```
███████ ROJO ███████
¡ES TU TURNO!
  4′              Jeison te está esperando
  PARA LLEGAR
[ YA LLEGUÉ ]          No puedo ir
```
Cuenta atrás viva, recalculada cada 15 s. Al minuto no hace falta más precisión
y no merece despertar la pantalla cada segundo.

### E12 · Ventana a punto de agotarse — quedan ≤ 2 min
Misma tarjeta, la cifra **parpadea**. Y dice la consecuencia con todas las
letras: `Si no llegas, pierdes el turno`. No es decoración: es lo que pasa.

### E13 · En la silla — `atendiendo`
Cifra `AHORA`, rótulo `TE ESTÁN ATENDIENDO`. **Sin botones de gestión:** ya
estás sentado, no hay nada que gestionar. Vuelve a carbón — el rojo se apaga
en cuanto llegas.

### E14 · Turno expirado
**No es ticket.** Es un aviso de contorno rojo, sin poste y sin perforación: el
ticket representa un turno vivo, y este no lo está.
> «No alcanzaste a llegar en la ventana. Puedes entrar de nuevo abajo.»

### E15 · Segundo turno — «va después»
Ticket **pequeño, sin poste**, debajo del principal. El poste es la firma del
objeto principal de la pantalla; repetirlo lo devalúa.

---

## 5 · Estados de la propia tarjeta

### E16 · Cargando (primera vez)
**Esqueleto con la forma de la tarjeta, no un spinner centrado.** El spinner no
dice nada; el esqueleto ya promete dónde va a estar cada cosa.

### E17 · Sin conexión
La tarjeta **conserva el último dato conocido** y lo marca:
`Sin conexión · datos de hace 4 min`. Vaciarla sería mentir diciendo que no hay
nadie en la fila.

### E18 · Cuenta nueva, sin barbería
No hay local que mostrar. La tarjeta se convierte en la invitación:
```
AÚN NO TIENES BARBERÍA
[ TENGO UN CÓDIGO ]   [ BUSCAR BARBERO ]
```

---

## 6 · Las colisiones — lo que una lista de estados se deja fuera

Aquí es donde se rompen las tarjetas mal especificadas.

| Colisión | Qué pasa | Resolución |
|---|---|---|
| **Tienes turno y el local cierra** | El dueño cierra la jornada contigo en la fila | Tu turno manda: sigue el ticket. Debajo, aviso: `El local cerró · tu turno sigue en pie`. **Decidir con el servidor si de verdad sigue en pie.** |
| **Tienes turno y tu barbero se va a descanso** | La silla pasa a `descanso` | El ticket se queda, la ETA se recalcula, y se dice: `Jeison volvió a las 3:00`. Nunca ocultarlo. |
| **Tienes turno en el local A, estás mirando el B** | El conmutador de locales | La tarjeta es **por local**. En B se ve el estado de B, y arriba una cinta: `Tienes un turno en Dávila →`. |
| **Tienes turno y cita el mismo día** | Ambos vivos | El turno manda la tarjeta. La cita baja a la lista de abajo. |
| **Te llaman mientras la app está cerrada** | Llega el push | Al abrir, E11 directo. La ventana ya lleva corriendo: la cuenta atrás puede estar casi agotada, y eso hay que **verlo**, no descubrirlo. |
| **Dos turnos y te llaman el segundo** | Orden alterado | El llamado sube arriba, sea cual sea. El rojo manda sobre el orden. |

---

## 7 · Regla del rojo

En toda la app, **el rojo macizo grande aparece en un solo sitio a la vez**:

| | Rojo |
|---|---|
| Botón `FILA AHORA` / `ENTRAR YA` | macizo, siempre que esté disponible |
| Tarjeta entera | **solo en E11 y E12** (te llamaron) |
| Cuando la tarjeta es roja | el botón de fila **no existe** — ya estás dentro |

Nunca hay dos rojos macizos compitiendo. Es lo que hace que «te llamaron» se
lea desde el otro lado del local.

---

## 8 · Lo que hay que decidir

1. **E2 — ¿«ENTRAR YA» o «FILA AHORA» cuando no hay nadie?** Cambiar la palabra
   según el contexto es más honesto pero hace el botón menos reconocible.
2. **Colisión turno + local cerrado.** Necesito confirmar contra el servidor si
   un turno sobrevive al cierre de jornada. Si no sobrevive, E14 y no ticket.
3. **E12 — ¿parpadeo?** Llama mucho la atención, y con reduce-motion activado
   hay que darle una alternativa (contorno grueso).
4. **E3 — la «próxima hora libre»** exige una consulta que hoy la tarjeta no
   hace. Si sale cara, la alternativa es texto: `Hoy solo con cita`.
