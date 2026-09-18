#!/usr/bin/env node
/**
 * UN HOOK DEBAJO DE UN `return` CONDICIONAL ROMPE LA PANTALLA.
 *
 * Esto se escribió porque pasó, y llegó al teléfono de alguien. Cuatro
 * pantallas —Reservar, Preferencias, la ficha del empleado y la hoja de entrar
 * a la fila— quedaron así:
 *
 *     if (loading) return <Spinner />
 *     const volver = useGestoVolver()      // ← nunca se llama mientras carga
 *
 * React lleva la cuenta de los hooks POR ORDEN de llamada, no por nombre. En el
 * primer render `loading` es cierto, se sale antes y ese hook no se llama; en
 * el siguiente sí, y entonces hay uno de más. React tira
 * «Rendered more hooks than during the previous render» y la pantalla muere.
 *
 * Lo peor es que no se ve venir: `tsc` da verde —los tipos son correctos— y en
 * la hoja de la fila ni siquiera falla al abrir la pantalla, sino en el momento
 * exacto en que el cliente toca un servicio. El proyecto no tiene eslint, así
 * que `react-hooks/rules-of-hooks` tampoco estaba para avisar.
 *
 * Esta comprobación cubre justo ese caso y nada más: dentro de un componente
 * exportado, un hook a la altura del cuerpo (dos espacios) que aparece DESPUÉS
 * del primer `if (...) return` de ese mismo nivel. No pretende sustituir a
 * eslint; pretende que este fallo concreto no vuelva a pasar callado.
 *
 * Se corre solo en CI, junto al typecheck.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function archivos(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.')) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) archivos(p, out)
    else if (p.endsWith('.tsx')) out.push(p)
  }
  return out
}

const fallos = []
for (const f of [...archivos('app'), ...archivos('components')]) {
  const lineas = readFileSync(f, 'utf8').split('\n')
  let dentro = false
  let guarda = null
  lineas.forEach((l, i) => {
    // Cada componente exportado reinicia la cuenta.
    if (/^export default function |^export function [A-Z]/.test(l)) {
      dentro = true
      guarda = null
    }
    if (!dentro) return
    if (guarda === null && /^ {2}if \(.*\) return/.test(l)) guarda = i + 1
    if (guarda !== null && /^ {2}(const|let)\s+.*=\s*use[A-Z]/.test(l)) {
      fallos.push({ f, guarda, linea: i + 1, txt: l.trim() })
    }
  })
}

if (fallos.length) {
  console.error('\nHooks llamados DESPUÉS de una salida temprana:\n')
  for (const x of fallos) {
    console.error(`  ${x.f}:${x.linea}`)
    console.error(`    ${x.txt}`)
    console.error(`    la guarda que lo deja fuera está en la línea ${x.guarda}\n`)
  }
  console.error('Súbelos por encima de las guardas. Un hook que solo se llama')
  console.error('a veces cambia el orden entre renders y mata la pantalla.\n')
  process.exit(1)
}
console.log('Hooks: ninguno por debajo de una salida temprana.')
