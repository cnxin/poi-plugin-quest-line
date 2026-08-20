/**
 * 语法检查：用 babel 转译所有 .es 源码，捕获语法/JSX 错误。
 * .es 文件在 poi 中由宿主现场转译，本脚本提前把语法错误暴露出来。
 * 用法：node scripts/syntax-check.mjs
 */
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformAsync } from '@babel/core'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, acc)
    else if (/\.(es|jsx?)$/.test(name)) acc.push(p)
  }
  return acc
}

const files = walk(ROOT)
let fail = 0

for (const f of files) {
  const rel = relative(ROOT, f)
  try {
    await transformAsync(readFileSync(f, 'utf8'), {
      filename: f,
      babelrc: false,
      configFile: false,
      presets: [
        ['@babel/preset-env', { targets: { node: '20' } }],
        ['@babel/preset-react', { runtime: 'classic' }],
      ],
    })
    console.log(`  ✅ ${rel}`)
  } catch (e) {
    console.log(`  ❌ ${rel}\n     ${e.message.split('\n')[0]}`)
    fail++
  }
}

console.log(fail === 0 ? `\n✅ ${files.length} 个文件语法正确` : `\n❌ ${fail} 个文件有语法错误`)
process.exit(fail === 0 ? 0 : 1)
