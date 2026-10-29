import type { RoomDirection } from '@shared/contract'

import { footprint, type GridPoint } from './grid'
import type { RoomModel } from './room'

/**
 * 家具交互解析（M5）。
 *
 * 官方把「能做什么」写在三处：
 * - `furniConfig.behaviour`：`"sit 坐下 1"` → 动作名 / 中文名 / 权限（`BehaviourVO`）
 * - `furniConfig.functionType`：`Door` / `GiftBox` / `transport` …，会额外塞行为（`setBehaviourByFunctionType`）
 * - `furniState`：当前状态，随存档持久化，驱动动画与开合
 *
 * 这里把三者折成一个可执行的 `InteractionDef`，运行期只认这一份。
 */

/** 交互种类。`none` = 纯装饰。 */
export type InteractionKind = 'none' | 'toggle' | 'cycle' | 'sit' | 'lie' | 'pose' | 'transport'

export interface BehaviourVO {
  type: string
  name: string
  admin: number
  param: string
}

/** 解析 `"sit 坐下 1"` 这种串（官方 `Gc` 构造函数原文）。 */
export function parseBehaviour(raw: string | null | undefined): BehaviourVO | null {
  const text = raw?.trim()
  if (!text) return null
  const parts = text.split(' ')
  const type = parts[0]?.trim()
  if (!type) return null
  return {
    type,
    name: parts[1]?.trim() || type,
    admin: parts[2] !== undefined ? Number(parts[2]) || 0 : 2,
    param: parts[3]?.trim() || '',
  }
}

/** `"open 打开 1&close 关闭 1"` → 多条行为。 */
export function parseBehaviours(raw: string | null | undefined): BehaviourVO[] {
  if (!raw) return []
  return raw
    .split('&')
    .map((entry) => parseBehaviour(entry))
    .filter((entry): entry is BehaviourVO => Boolean(entry))
}

export interface InteractionDef {
  kind: InteractionKind
  /** 状态数：toggle = 2，cycle = n */
  states: number
  /** 角色动作名（sit / lie / 或官方动作表里的名字） */
  clip: string | null
  /** 坐/躺时占用的面序号 */
  surface: number | null
  label: string
  /** 官方 param（第 4 段），部分功能拿来当参数 */
  param: string
}

const NONE: InteractionDef = {
  kind: 'none',
  states: 0,
  clip: null,
  surface: null,
  label: '',
  param: '',
}

/** 行为名 → 交互种类。官方行为表里常见的就是这几类。 */
const BEHAVIOUR_KIND: Record<string, InteractionKind> = {
  sit: 'sit',
  sit2: 'sit',
  lie: 'lie',
  lie2: 'lie',
  open: 'toggle',
  close: 'toggle',
  switch: 'toggle',
  door: 'toggle',
  Look: 'pose',
  stand: 'pose',
  stand2: 'pose',
  sing: 'pose',
  story: 'pose',
  dance: 'pose',
  dance2: 'pose',
}

/** `functionType` → 交互种类（官方 `setBehaviourByFunctionType` 的主干）。 */
const FUNCTION_KIND: Record<string, InteractionKind> = {
  Door: 'toggle',
  GiftBox: 'cycle',
  RandomState3: 'cycle',
  transport: 'transport',
}

export interface InteractSource {
  behaviour: string | null
  functionType: string | null
  otherOverMe: 0 | 1 | 2
}

/**
 * 解析某件家具的可交互定义。
 *
 * 优先级：`functionType`（官方会用它额外塞行为）→ `behaviour` 里的第一条。
 */
export function resolveInteraction(def: InteractSource): InteractionDef {
  const functionKind = def.functionType ? FUNCTION_KIND[def.functionType] : undefined
  const behaviours = parseBehaviours(def.behaviour)
  const first = behaviours[0]

  if (functionKind) {
    return {
      kind: functionKind,
      states: functionKind === 'toggle' ? 2 : functionKind === 'cycle' ? 3 : 0,
      clip: functionKind === 'transport' ? null : null,
      surface: null,
      label: first?.name ?? def.functionType ?? '',
      param: first?.param ?? '',
    }
  }

  if (!first) return NONE
  const kind = BEHAVIOUR_KIND[first.type]
  if (!kind) return { ...NONE, label: first.name, param: first.param }

  return {
    kind,
    states: kind === 'toggle' ? 2 : 0,
    clip: kind === 'sit' ? 'sit' : kind === 'lie' ? 'lie' : kind === 'pose' ? first.type : null,
    surface: kind === 'sit' || kind === 'lie' ? (def.otherOverMe > 0 ? 0 : null) : null,
    label: first.name,
    param: first.param,
  }
}

/**
 * 交互点 —— 官方 `fc.getEnterPointByDir(dir)`：
 *
 * ```
 * dir 1：格子左边一列（x-1, y..y+rows-1）
 * dir 3：箱子下边一行（x..x+cols-1, y+rows）
 * dir 5：格子右边一列（x+cols, y..y+rows-1）
 * dir 7：箱子上边一行（x..x+cols-1, y-1）
 * ```
 * 这里把四个方向的点合并成一份候选（官方由 `interactDir` 选一个，编辑器里人物不必绕远）。
 */
export function enterPoints(
  model: RoomModel,
  top: GridPoint,
  rows: number,
  cols: number,
): GridPoint[] {
  const fp = footprint(top.x, top.y, rows, cols)
  const points: GridPoint[] = []

  for (let y = fp.y0; y <= fp.y1; y += 1) {
    points.push({ x: fp.x0 - 1, y })
    points.push({ x: fp.x1 + 1, y })
  }
  for (let x = fp.x0; x <= fp.x1; x += 1) {
    points.push({ x, y: fp.y0 - 1 })
    points.push({ x, y: fp.y1 + 1 })
  }

  const seen = new Set<string>()
  return points.filter((point) => {
    const key = `${point.x},${point.y}`
    if (seen.has(key)) return false
    seen.add(key)
    return model.canWalk(point.x, point.y)
  })
}

/** 从候选交互点里挑离角色最近的一个（曼哈顿距离）。 */
export function nearestEnterPoint(points: GridPoint[], from: GridPoint): GridPoint | null {
  let best: GridPoint | null = null
  let bestDistance = Infinity
  for (const point of points) {
    const distance = Math.abs(point.x - from.x) + Math.abs(point.y - from.y)
    if (distance < bestDistance) {
      best = point
      bestDistance = distance
    }
  }
  return best
}

/** 站到交互点后该朝哪边看（面向家具）。 */
export function facingForEnter(enter: GridPoint, top: GridPoint): RoomDirection {
  const dx = top.x - enter.x
  const dy = top.y - enter.y

  // 家具在角色的右上（-y）→ 朝 7；右下（+x）→ 5；左下（+y）→ 3；左上（-x）→ 1
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 5 : 1
  return dy >= 0 ? 3 : 7
}

export interface InteractionOutcome {
  /** 新的家具状态（同一件家具的 `state` 字段） */
  state: number
  /** 角色要做的事 */
  actor: { clip: string | null; seat: boolean }
}

/**
 * 执行一次交互，返回新的家具状态与角色动作。
 *
 * 与官方一致：`toggle` 在 0/1 之间翻，`cycle` 在 0..states-1 里轮，
 * `sit/lie` 不改变家具状态（只让角色就位）。
 */
export function applyInteraction(def: InteractionDef, currentState: number): InteractionOutcome {
  switch (def.kind) {
    case 'toggle':
      return { state: currentState === 0 ? 1 : 0, actor: { clip: 'stand', seat: false } }
    case 'cycle': {
      const states = Math.max(2, def.states)
      return { state: (currentState + 1) % states, actor: { clip: 'stand', seat: false } }
    }
    case 'sit':
      return { state: currentState, actor: { clip: def.clip ?? 'sit', seat: true } }
    case 'lie':
      return { state: currentState, actor: { clip: def.clip ?? 'lie', seat: true } }
    case 'pose':
      return { state: currentState, actor: { clip: def.clip, seat: false } }
    case 'transport':
      return { state: currentState, actor: { clip: 'stand', seat: false } }
    default:
      return { state: currentState, actor: { clip: null, seat: false } }
  }
}
