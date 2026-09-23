# Aplicar la línea gráfica de Turno — plan

> Handoff recibido el 23 sep (`docs/diseno-turno/`). Regla del encargo:
> **se cambia cómo se ve, no qué hace**. Ninguna función, consulta, regla,
> texto de estado del servidor ni navegación cambia. Si un mock enseña algo
> que la app no tiene, se dibuja lo que la app SÍ tiene con ese lenguaje.

## Lo que dice el diseño, en una línea

Neutros puros (blanco / negro) mandan; **rojo `#E1251B` y azul `#1E4FD8` solo
de acento**. Radio 8 en todo. Geist para la interfaz, **Geist Mono para todos
los números**. El poste de barbero (−55°, rojo · blanco · azul · blanco) solo
en tres sitios: el logo, el talón del ticket activo y el estado «en la silla».
Adiós a NAVAJA (Anton, Plus Jakarta, carbón, mayúsculas espaciadas).

## Lo que la app tiene y el mock no (se mantiene)

| En el mock | En la app, y se queda así |
|---|---|
| Cliente: pestañas Inicio · Mi turno · Historial · Perfil | Mi turno · Mi barbería · Historial · Ajustes |
| Barbero: Agenda · Stats · Clientes · Config | Mi silla · Agenda · Clientes · Estadísticas · Ajustes |
| «Terminar y llamar siguiente» (un botón) | Cobrar y Llamar son dos acciones (lib/silla.ts, 20 modos) |
| «de 5 personas en la fila», «Nº 07» | puesto + código real del turno (A-27) |
| «Confirmar» cita desde Inicio | lo que la app ofrezca en ese momento |
| Panel del dueño, Stats, Clientes, Ajustes, entrada | no están dibujados: se aplican los mismos tokens y piezas |

## Cómo se hace sin romper nada

La app lee sus colores y fuentes de `constants/index.ts` (1.110 usos). El
primer paso **reasigna esos mismos nombres** a la paleta nueva: toda la app
cambia de color de golpe sin tocar pantallas, y cada pantalla se afina
después. Se hace por fases, cada una publicable sola y reversible
(`desde = <commit anterior>`).

| Fase | Qué | Riesgo | ¿Actualización o APK? |
|---|---|---|---|
| 0 | Tokens nuevos (claro, y oscuro preparado) · fuentes Geist + Geist Mono · alias de los nombres viejos | bajo: solo color y letra | actualización |
| 1 | Piezas compartidas: botones, chips, filas, rótulos, hojas, barra de pestañas, **poste a −55°**, **logo ticket** (con vistas, sin SVG) | medio | actualización |
| 2 | Las dos tarjetas (cliente y Mi silla) con el lenguaje del ticket: tinta, talón del poste, número en mono. **La lógica de los 20 modos no se toca** (lib/silla.ts) | medio | actualización |
| 3 | Pantallas: cliente → barbero → dueño, una por una | bajo cada una | actualización |
| 4 | Entrada (13 pantallas) | bajo | actualización |
| 5 | Modo oscuro según el sistema | medio: toca cómo se leen los estilos | actualización |
| 6 | Ícono de la app y splash con el logo | — | **APK** |
| 7 | Variante Liquid Glass (opcional, tema aparte) | alto | **APK** (`expo-blur`) |

Sin librerías nativas nuevas hasta la fase 6: el poste y el logo se dibujan
con vistas (como el poste de hoy), los íconos siguen siendo Ionicons
(equivalentes de los del mock), y las fuentes Geist viajan en la
actualización como cualquier recurso.

## Decisiones abiertas

1. **Estándar o Glass.** El handoff dice que Glass es opcional y no reemplaza
   al estándar. Recomendación: estándar ahora (va por actualización), Glass
   después como tema si se confirma (pide APK por `expo-blur`).
2. **Modo oscuro.** Recomendación: tokens listos desde la fase 0, activado en
   la fase 5, cuando lo claro esté visto en el teléfono.
3. **Rótulos bilingües** («TU POSICIÓN · YOUR SPOT»). El handoff los pide en
   los estados protagonistas. Es solo texto; se puede dejar en español.
