/**
 * 命令行构建目录快照（实现见 `src/main/services/catalog-build.ts`）。
 *
 *   npm run catalog:build
 *
 * 应用内自动更新走同一份代码，所以这里只是把结果写到 `resources/`。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { buildCatalog } from '../src/main/services/catalog-build.ts'

const OUT = resolve('resources/catalog.json.gz')

async function main(): Promise<void> {
  const { gz, meta } = await buildCatalog({ onProgress: (stage) => console.log(`· ${stage}`) })
  await mkdir(resolve('resources'), { recursive: true })
  await writeFile(OUT, gz)
  console.log(`· 已写入 ${OUT}`)
  console.log(`  ${(gz.length / 1024 / 1024).toFixed(2)} MB（gz） · 版本 ${meta.mainScript}`)
  console.log(
    '  分类:',
    Object.entries(meta.counts)
      .map(([key, value]) => `${key}=${value}`)
      .join(' '),
  )
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
