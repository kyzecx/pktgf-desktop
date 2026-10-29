import { describe, expect, it } from 'vitest'

import { applyPatchToCatalog } from '../src/shared/catalog-patch'
import type { Catalog } from '../src/shared/contract'

/**
 * 资源增量更新（官方只换 md5 前缀时的原地打补丁）。
 *
 * 纯逻辑在 `shared/catalog-patch.ts`：不 import electron，CI（无 Electron 二进制）也能跑。
 *
 * 关键约束：只在补丁**比快照新**时应用，否则会把旧 md5 扣在新快照上。
 */

function catalog(): Catalog {
  return {
    meta: { mainScript: 'Main_old.js', resourceList: 'list_old.txt' },
    assets: { baseActor: { key: 'actor8.zip', md5: 'aaa' } },
    items: [{ code: 'm_hair001', part: 'hair', zip: 'actorCostume/boy/m_hair001.zip', md5: '111' }],
    faces: [],
    furniture: [
      { code: 'dec1417', zip: 'furni/dec/dec1417.zip', md5: '222' },
      { code: 'dec1418', zip: 'furni/dec/dec1418.zip', md5: '333' },
    ],
    rooms: [],
    roomMaps: [],
    npcs: [],
  } as unknown as Catalog
}

describe('目录补丁', () => {
  it('替换 md5 并记住新的版本标识', () => {
    const target = catalog()
    const changed = applyPatchToCatalog(target, {
      mainScript: 'Main_new.js',
      resourceList: 'list_new.txt',
      updatedAt: 1,
      md5: { 'furni/dec/dec1417.zip': '999' },
      patched: 1,
      added: 0,
    })
    expect(changed).toBe(1)
    expect(target.furniture[0]!.md5).toBe('999')
    expect(target.furniture[1]!.md5).toBe('333')
    expect(target.meta.mainScript).toBe('Main_new.js')
  })

  it('版本相同就不动（避免旧补丁盖新快照）', () => {
    const target = catalog()
    const changed = applyPatchToCatalog(target, {
      mainScript: 'Main_old.js',
      resourceList: 'list_old.txt',
      updatedAt: 1,
      md5: { 'furni/dec/dec1417.zip': '999' },
      patched: 1,
      added: 0,
    })
    expect(changed).toBe(0)
    expect(target.furniture[0]!.md5).toBe('222')
  })

  it('清单里没有的条目保持原样', () => {
    const target = catalog()
    const changed = applyPatchToCatalog(target, {
      mainScript: 'Main_new.js',
      resourceList: 'list_new.txt',
      updatedAt: 1,
      md5: {},
      patched: 0,
      added: 0,
    })
    expect(changed).toBe(0)
    expect(target.meta.mainScript).toBe('Main_old.js')
  })
})
