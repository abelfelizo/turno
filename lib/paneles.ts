/**
 * A DÓNDE VIVE CADA PANEL. UNA SOLA VEZ.
 *
 * Este mapa estaba copiado en tres sitios —cambiar-rol, panel-badge y el
 * enrutado de los push— y copiado es como empieza a divergir: basta con que
 * uno de los tres apunte a una pantalla que se movió para que cambiar de panel
 * deje a la persona en un sitio que no le corresponde, sin ningún error.
 *
 * Además es de donde bebe la guarda (components/guarda-panel), y una guarda
 * que no comparta el mapa con quien navega es una guarda que se pelea consigo
 * misma: te manda a un sitio, el otro mapa te devuelve, y el teléfono se queda
 * rebotando entre dos pantallas.
 */
import type { PanelActivo } from '../types'

/** Pantalla de entrada de cada panel. */
export const INICIO_DE_PANEL: Record<PanelActivo, string> = {
  cliente: '/(app)/cliente/turno',
  barberia: '/(app)/dueno/dashboard',
  silla: '/(app)/barbero/agenda',
}

/** Cómo se llama cada panel cuando hay que nombrarlo en pantalla. */
export const NOMBRE_DE_PANEL: Record<PanelActivo, string> = {
  cliente: 'CLIENTE',
  barberia: 'BARBERÍA',
  silla: 'MI SILLA',
}

/**
 * El panel al que pertenece una carpeta de rutas.
 *
 * Las carpetas se llaman por el ROL histórico (`dueno`, `barbero`) y los
 * paneles por lo que la persona hace (`barberia`, `silla`). No son lo mismo y
 * confundirlos es justo el fallo que arreglamos: un dueño que atiende tiene
 * rol 'dueno' y puede estar en el panel 'silla'.
 */
export const PANEL_DE_CARPETA: Record<string, PanelActivo> = {
  cliente: 'cliente',
  dueno: 'barberia',
  barbero: 'silla',
}
