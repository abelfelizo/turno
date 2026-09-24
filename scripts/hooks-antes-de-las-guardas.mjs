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

/**
 * DOS AGUJEROS QUE TENÍA ESTA COMPROBACIÓN, Y QUE LA HACÍAN PEOR QUE NADA.
 *
 * La primera versión buscaba `const algo = useLoQueSea(...)`. Eso deja pasar
 * justo los dos casos más fáciles de escribir:
 *
 *   if (loading) return <Spinner />
 *   useEffect(() => { ... }, [])        ← no asigna nada: invisible
 *   if (a) { const y = useMemo(...) }   ← anidado: invisible
 *
 * Los dos rompen la pantalla igual que el que sí cazaba, y `useEffect` después
 * de una guarda es probablemente el más común de todos. Una comprobación que
 * da verde sobre el fallo que dice vigilar es peor que no tenerla, porque se
 * confía en ella.
 *
 * Ahora se busca CUALQUIER llamada a algo con forma de hook por debajo de la
 * guarda, asigne o no y esté a la profundidad que esté. Para no cazar de más:
 * se quitan los comentarios antes de mirar (este mismo archivo y medio repo
 * mencionan `useEffect` en prosa), y el ámbito se cierra al llegar a otra
 * declaración de primer nivel, para que un ayudante declarado debajo del
 * componente no herede su guarda.
 */
const RE_HOOK = /\buse[A-Z]\w*\s*\(/
const RE_COMPONENTE = /^(export\s+)?(default\s+)?function\s+[A-Z]/
const RE_OTRO_AMBITO = /^(const|let|var|type|interface|export)\s|^function\s|^\}/

const fallos = []
for (const f of [...archivos('app'), ...archivos('components')]) {
  const crudo = readFileSync(f, 'utf8').split('\n')
  let dentro = false
  let guarda = null
  let enBloque = false        // dentro de un /* ... */

  crudo.forEach((cruda, i) => {
    // Fuera comentarios ANTES de decidir nada: si no, una línea de prosa que
    // diga "useEffect" cuenta como llamada y el informe se llena de ruido.
    let l = cruda
    if (enBloque) {
      const cierre = l.indexOf('*/')
      if (cierre === -1) return
      l = l.slice(cierre + 2)
      enBloque = false
    }
    const abre = l.indexOf('/*')
    if (abre !== -1) {
      const cierre = l.indexOf('*/', abre + 2)
      if (cierre === -1) { enBloque = true; l = l.slice(0, abre) }
      else l = l.slice(0, abre) + l.slice(cierre + 2)
    }
    l = l.replace(/\/\/.*$/, '')
    if (!l.trim()) return

    if (RE_COMPONENTE.test(l)) { dentro = true; guarda = null; return }
    // Otra declaración de primer nivel cierra el componente anterior.
    if (dentro && RE_OTRO_AMBITO.test(l) && !RE_COMPONENTE.test(l)) {
      dentro = false; guarda = null; return
    }
    if (!dentro) return

    if (guarda === null && /^ {2}if \(.*\)\s*return/.test(l)) guarda = i + 1
    else if (guarda !== null && RE_HOOK.test(l)) {
      fallos.push({ f, guarda, linea: i + 1, txt: cruda.trim() })
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
