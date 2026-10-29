import type { RoomDirection } from '@shared/contract'

import type { MotionClip, MotionStep } from './types'

/**
 * 动作求值：把官方 `motionConfig` 的一步一步序列变成「给定时间 → 该画哪一帧」。
 *
 * 官方逻辑（`AnimalMotionController` / 角色动作控制器）：
 * ```
 * 每帧 time += 100，time >= duration 就进下一步；循环动作走完回到第 0 步
 * ```
 * 这里改成真实毫秒，语义等价、且与帧率无关（GIF/视频导出要对得上）。
 */

export interface PoseSample {
  /** 当前步序号 */
  step: number
  /** 该步已过去的时间 */
  elapsed: number
  /** 是否走完了一轮（非循环动作到达末尾） */
  done: boolean
  arms: number
  legs: number
  /** 头发层帧号（官方 `hair`，1 起转 0 起）；**不是**基础头部帧 */
  hairFrame: number
  face?: number
  /** 本步要求转向（官方 dir/facing） */
  dir?: RoomDirection
  offset: { x: number; y: number }
}

/** 每一步的默认时长（官方缺省没有 duration，按 200ms 处理）。 */
export const DEFAULT_STEP_DURATION = 200

/** 动作步里的偏移既可能是 `"x,y"`（官方配置），也可能是 `[x, y]`（自定义动作）。 */
export function parseOffset(raw: string | readonly [number, number] | undefined): {
  x: number
  y: number
} {
  if (!raw) return { x: 0, y: 0 }
  if (Array.isArray(raw)) return { x: Number(raw[0]) || 0, y: Number(raw[1]) || 0 }
  const [x, y] = String(raw).split(',')
  return { x: Number(x) || 0, y: Number(y) || 0 }
}

/**
 * 某一步在某朝向下的手臂/腿帧（含 `arms3` / `arms7` 之类的覆写）。
 *
 * `hair` 是**头发层**的帧序号，不是基础头部帧 —— 官方基础头永远取第 0 帧
 * （`Gg.getHead(dir, 0)`），`hair` 只喂给 `headSprite`（`setHeadIndex`）。
 * 之前把它当成头部帧用，`hair:1 ↔ hair:2` 交替的动作就会一直闪头。
 */
export function resolveStepFrames(
  step: MotionStep | undefined,
  dir: RoomDirection,
): { arms: number; legs: number; hairFrame: number; face?: number } {
  if (!step) return { arms: 0, legs: 0, hairFrame: 0 }
  const override = step.byDir?.[dir]
  return {
    arms: override?.arms ?? step.arms ?? 0,
    legs: override?.legs ?? step.legs ?? 0,
    hairFrame: step.hair !== undefined && step.hair >= 0 ? step.hair : 0,
    ...(step.face !== undefined ? { face: step.face } : {}),
  }
}

/**
 * 官方 `motionConfig` 的帧号是 **1 起**，且缺省 = `-1`（表示这一步不改，沿用上一步）。
 * 源码：`putArms((c.arms|0)-1)` / `putLegs((c.legs|0)-1)` / `putHair((c.hair|0)-1)`。
 */
export function toZeroBasedFrames(steps: MotionStep[]): MotionStep[] {
  return steps.map((step) => ({
    ...step,
    ...(step.arms !== undefined ? { arms: step.arms - 1 } : {}),
    ...(step.legs !== undefined ? { legs: step.legs - 1 } : {}),
    ...(step.hair !== undefined ? { hair: step.hair - 1 } : {}),
    ...(step.byDir
      ? {
          byDir: Object.fromEntries(
            Object.entries(step.byDir).map(([dir, override]) => [
              dir,
              {
                ...(override?.arms !== undefined ? { arms: override.arms - 1 } : {}),
                ...(override?.legs !== undefined ? { legs: override.legs - 1 } : {}),
              },
            ]),
          ),
        }
      : {}),
  }))
}

/** 动作总时长（一轮）。 */
export function clipDuration(clip: MotionClip): number {
  return clip.steps.reduce((sum, step) => sum + (step.duration ?? DEFAULT_STEP_DURATION), 0)
}

/**
 * 按时间取值。
 *
 * - `loop`：对总时长取模；
 * - 非循环：时间越界后停在最后一步，`done = true`。
 */
export function evaluateClip(clip: MotionClip, timeMs: number, dir: RoomDirection): PoseSample {
  const steps = clip.steps
  if (steps.length === 0) {
    return {
      step: 0,
      elapsed: 0,
      done: true,
      arms: 0,
      legs: 0,
      hairFrame: 0,
      offset: { x: 0, y: 0 },
    }
  }

  const total = clipDuration(clip) || DEFAULT_STEP_DURATION
  let time = Math.max(0, timeMs)
  let done = false
  if (clip.loop) {
    time %= total
  } else if (time >= total) {
    time = total - 1
    done = true
  }

  let cursor = 0
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i]!
    const duration = step.duration ?? DEFAULT_STEP_DURATION
    if (time < cursor + duration || i === steps.length - 1) {
      const frames = resolveInherited(steps, i, dir)
      return {
        step: i,
        elapsed: time - cursor,
        done,
        ...frames,
        ...(step.facing !== undefined ? { dir: step.facing } : {}),
        offset: parseOffset(step.offset),
      }
    }
    cursor += duration
  }

  const last = steps[steps.length - 1]!
  return {
    step: steps.length - 1,
    elapsed: 0,
    done,
    ...resolveInherited(steps, steps.length - 1, dir),
    offset: parseOffset(last.offset),
  }
}

/**
 * 取第 index 步的帧，并把 `-1`（官方「沿用上一步」）往前回溯。
 *
 * 官方只在值 `>= 0` 时调 `setArmIndex`，所以 `-1` 等于「保持当前帧」；
 * 这里直接回溯到最近一个有效值，语义等价且与帧率无关。
 */
export function resolveInherited(
  steps: MotionStep[],
  index: number,
  dir: RoomDirection,
): { arms: number; legs: number; hairFrame: number; face?: number } {
  let arms: number | null = null
  let legs: number | null = null
  let hairFrame: number | null = null
  let face: number | undefined
  for (let i = 0; i <= index && i < steps.length; i += 1) {
    const frames = resolveStepFrames(steps[i], dir)
    const step = steps[i]!
    if (step.byDir?.[dir]?.arms !== undefined || step.arms !== undefined) {
      if (frames.arms >= 0) arms = frames.arms
    }
    if (step.byDir?.[dir]?.legs !== undefined || step.legs !== undefined) {
      if (frames.legs >= 0) legs = frames.legs
    }
    if (frames.hairFrame >= 0) hairFrame = frames.hairFrame
    if (frames.face !== undefined) face = frames.face
  }
  return {
    arms: arms ?? 0,
    legs: legs ?? 0,
    hairFrame: hairFrame ?? 0,
    ...(face !== undefined ? { face } : {}),
  }
}

/** 构造一段动作片。 */
export function makeClip(id: string, name: string, steps: MotionStep[], loop = false): MotionClip {
  return { id, name, loop, steps }
}

/**
 * 行走动作：官方没有单独的 walk 动作时，用腿帧循环做最朴素的行走。
 * 每 120ms 换一帧，取 0/3/6/9 四帧（小模型腿部的迈步循环）。
 */
export function walkClip(id = 'walk'): MotionClip {
  const frames = [0, 3, 6, 9]
  return makeClip(
    id,
    '行走',
    frames.map((legs) => ({ legs, duration: 120 })),
    true,
  )
}

/** 待机：官方用 `stand`，这里保持第 0 帧。 */
export function standClip(id = 'stand'): MotionClip {
  return makeClip(id, '待机', [{ arms: 0, legs: 0, duration: 1000 }], true)
}

/** 坐下：腿 1 / 臂 0（配合家具的坐姿偏移）。 */
export function sitClip(id = 'sit'): MotionClip {
  return makeClip(id, '坐下', [{ legs: 1, arms: 0, duration: 1000 }], true)
}

/** 躺下。 */
export function lieClip(id = 'lie'): MotionClip {
  return makeClip(id, '躺下', [{ legs: 0, arms: 0, duration: 1000 }], true)
}

/**
 * 把目录里的官方动作（`catalog.actorMotions`）转成可播放的 `MotionClip`。
 *
 * 官方 `motionConfig` 的每一步只有 arms/legs/hair/face/offset/duration，
 * `arms3` / `arms7` 已在构建期折进 `byDir`。255 组动作一次性转成 clip 很便宜。
 */
export function clipsFromCatalog(
  motions: Record<string, MotionStep[]> | undefined,
): Map<string, MotionClip> {
  const clips = new Map<string, MotionClip>()
  if (!motions) return clips
  for (const [name, steps] of Object.entries(motions)) {
    clips.set(name, {
      id: name,
      name,
      // 官方动作默认循环（stand/walk/sit 这些都是循环姿态）
      loop: true,
      steps: toZeroBasedFrames(steps).map((step) => ({
        duration: step.duration && step.duration > 0 ? step.duration : DEFAULT_STEP_DURATION,
        arms: step.arms,
        legs: step.legs,
        hair: step.hair,
        face: step.face,
        ...(step.dir !== undefined ? { dir: step.dir } : {}),
        ...(step.facing !== undefined ? { facing: step.facing } : {}),
        ...(step.offset !== undefined ? { offset: step.offset } : {}),
        ...(step.byDir ? { byDir: step.byDir } : {}),
      })),
    })
  }
  return clips
}

/** NPC 动作的一步（官方 npcMotionConfig）：帧序号 + 时长。 */
export interface NpcMotionStep {
  frame: number
  duration: number
}

/**
 * NPC 按时间取帧。
 *
 * 官方 NPC 动作与角色动作是两套美术（NPC 是整帧图，不分层），
 * 所以这里只需要「当前该显示第几帧」。
 */
export function evaluateNpcMotion(steps: NpcMotionStep[], timeMs: number): number {
  if (steps.length === 0) return 1
  const total = steps.reduce((sum, step) => sum + Math.max(1, step.duration), 0)
  let time = Math.max(0, timeMs) % total
  for (const step of steps) {
    const duration = Math.max(1, step.duration)
    if (time < duration) return step.frame
    time -= duration
  }
  return steps[steps.length - 1]!.frame
}

/** 官方 NPC 自主动作权重表：`"move:0.7&magic:1"`。 */
export function parseSelfMotion(
  raw: string | null | undefined,
): Array<{ action: string; weight: number }> {
  if (!raw) return []
  return raw
    .split('&')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [action, weight] = entry.split(':')
      return { action: (action ?? '').trim(), weight: Number(weight) || 1 }
    })
    .filter((entry) => entry.action.length > 0)
}

/** 按权重挑一个自主动作；`random` 传 0..1（默认取 Math.random）。 */
export function pickSelfMotion(
  entries: Array<{ action: string; weight: number }>,
  random: () => number = Math.random,
): string | null {
  if (entries.length === 0) return null
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0)
  if (total <= 0) return entries[0]!.action

  let roll = random() * total
  for (const entry of entries) {
    roll -= Math.max(0, entry.weight)
    if (roll <= 0) return entry.action
  }
  return entries[entries.length - 1]!.action
}
