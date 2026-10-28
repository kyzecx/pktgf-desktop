import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import type { SaveRecord } from '../../shared/contract'
import { parseSaveBundle } from '../../shared/saves'
import { dataDir } from './paths'

/**
 * 所有工具的存档共用一个 JSON 文件：
 *   - 搭配：data = OutfitSaveData
 *   - 装修/家具（后续）：data 由对应工具定义
 */

const MAX_SAVES = 200
const SAVES_FILE = 'saves.json'

function savesFile(): string {
  return resolve(dataDir(), SAVES_FILE)
}

export async function listSaves(): Promise<SaveRecord[]> {
  const raw = await readFile(savesFile(), 'utf8').catch(() => null)
  if (raw === null) return []
  return sortSaves(parseSaveBundle(raw)).slice(0, MAX_SAVES)
}

export async function putSave(save: SaveRecord): Promise<SaveRecord[]> {
  const existing = await listSaves()
  const now = Date.now()
  const entry: SaveRecord = {
    ...save,
    version: 2,
    createdAt: Number.isFinite(save.createdAt) ? save.createdAt : now,
    updatedAt: now,
  }
  const index = existing.findIndex((item) => item.id === entry.id)
  const next =
    index >= 0
      ? existing.map((item) => (item.id === entry.id ? entry : item))
      : [entry, ...existing]

  await writeSaves(next)
  return sortSaves(next).slice(0, MAX_SAVES)
}

export async function deleteSave(id: string): Promise<SaveRecord[]> {
  const next = (await listSaves()).filter((save) => save.id !== id)
  await writeSaves(next)
  return next
}

async function writeSaves(saves: SaveRecord[]): Promise<void> {
  const file = savesFile()
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(saves.slice(0, MAX_SAVES)), 'utf8')
}

function sortSaves(saves: SaveRecord[]): SaveRecord[] {
  return [...saves].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
}
