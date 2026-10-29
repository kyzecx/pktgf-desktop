import { create } from 'zustand'

import { makeClip, type MotionClip, type MotionStep } from '@engine/room'

/**
 * 自定义动作存储。
 *
 * 官方动作（`motionConfig` 255 组）是只读的，用户改动时会先「复制为自定义」，
 * 自定义动作随装修页使用，导出成 `.motion.json` 就能分享。
 */

const STORAGE_KEY = 'pkt-custom-clips'

function read(): MotionClip[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as MotionClip[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((clip) => clip?.id && Array.isArray(clip.steps))
      .map((clip) => ({
        id: clip.id,
        name: clip.name || clip.id,
        loop: Boolean(clip.loop),
        steps: clip.steps.map(normalizeStep),
      }))
  } catch {
    return []
  }
}

function normalizeStep(step: MotionStep): MotionStep {
  const out: MotionStep = {}
  if (Number.isFinite(Number(step.duration))) out.duration = Math.max(16, Number(step.duration))
  for (const key of ['arms', 'legs', 'hair', 'face'] as const) {
    if (step[key] !== undefined) out[key] = Math.max(0, Math.round(Number(step[key])))
  }
  if (step.dir !== undefined) out.dir = step.dir
  if (step.facing !== undefined) out.facing = step.facing
  if (step.offset !== undefined) out.offset = step.offset
  if (step.byDir) out.byDir = step.byDir
  return out
}

function write(clips: MotionClip[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clips))
}

interface CustomClipState {
  clips: MotionClip[]
  /** 新建或覆盖同 id */
  put: (clip: MotionClip) => void
  remove: (id: string) => void
  /** 导入 JSON：接受单个 clip、数组或 `{ clips: [] }` */
  importJson: (raw: string) => { added: number; error: string | null }
}

export const useCustomClipStore = create<CustomClipState>((set, get) => ({
  clips: read(),

  put: (clip) => {
    const next = [...get().clips.filter((item) => item.id !== clip.id), clip]
    write(next)
    set({ clips: next })
  },

  remove: (id) => {
    const next = get().clips.filter((item) => item.id !== id)
    write(next)
    set({ clips: next })
  },

  importJson: (raw) => {
    try {
      const parsed = JSON.parse(raw) as unknown
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { clips?: unknown }).clips)
          ? ((parsed as { clips: unknown[] }).clips as unknown[])
          : [parsed]

      let added = 0
      for (const entry of list) {
        const clip = entry as MotionClip
        if (!clip?.id || !Array.isArray(clip.steps) || clip.steps.length === 0) continue
        get().put({
          id: String(clip.id),
          name: String(clip.name || clip.id),
          loop: Boolean(clip.loop),
          steps: clip.steps.map(normalizeStep),
        })
        added += 1
      }
      return { added, error: added === 0 ? '文件里没有可用的动作' : null }
    } catch (error) {
      return { added: 0, error: error instanceof Error ? error.message : 'JSON 解析失败' }
    }
  },
}))

/** 从内置动作复制一份可编辑的自定义动作。 */
export function cloneAsCustom(source: MotionClip, suffix = '副本'): MotionClip {
  return makeClip(
    `custom-${Date.now().toString(36)}`,
    `${source.name} ${suffix}`,
    source.steps.map((step) => ({ ...step })),
    source.loop,
  )
}

/** 导出成可分享的 JSON。 */
export function clipToJson(clip: MotionClip): string {
  return JSON.stringify({ version: 1, clips: [clip] }, null, 2)
}
