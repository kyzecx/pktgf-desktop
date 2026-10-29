import { describe, expect, it } from 'vitest'

import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'

import { uniquePath as unique, usableDir as usable } from '../src/shared/export-path'

const uniquePath = (dir: string, name: string): string => unique(dir, name, existsSync)
const usableDir = (prefs: { dir: string | null }): string | null => usable(prefs.dir, existsSync)

/**
 * 导出偏好（自定义保存目录）。
 *
 * 关键点：目录失效时不能把文件写到奇怪的地方 —— 退回「每次询问」。
 */

describe('导出偏好', () => {
  it('目录为空或不存在时退回每次询问', () => {
    expect(usableDir({ dir: null })).toBeNull()
    expect(usableDir({ dir: '/definitely/not/here/pktgf' })).toBeNull()
    expect(usableDir({ dir: tmpdir() })).toBe(tmpdir())
  })

  it('同名文件自动加序号，不覆盖已有导出', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pktgf-unique-'))
    const first = uniquePath(dir, '房间.png')
    expect(first).toBe(join(dir, '房间.png'))
    await writeFile(first, 'x')

    const second = uniquePath(dir, '房间.png')
    expect(second).toBe(join(dir, '房间 (2).png'))
    await writeFile(second, 'x')

    expect(uniquePath(dir, '房间.png')).toBe(join(dir, '房间 (3).png'))
  })

  it('非法字符被替换，扩展名保留', () => {
    const path = uniquePath(tmpdir(), 'a/b:c*d.png')
    expect(dirname(path)).toBe(tmpdir())
    expect(path.endsWith('.png')).toBe(true)
    expect(path).not.toContain(':')
  })

  it('没有扩展名也能处理', () => {
    expect(uniquePath(tmpdir(), 'noext').endsWith('noext')).toBe(true)
  })
})
