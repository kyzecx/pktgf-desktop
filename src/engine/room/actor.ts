import type { RoomDirection } from '@shared/contract'

import { blend, createImage, crop, flipHorizontal, whiteKeyBackdrop } from '../image'
import type { RgbaImage } from '../types'
import type { Part } from '../types'
import type { SmallCostumeArt, SmallWorn } from '../small'

/**
 * 房间内的角色合成（40×60 小模型）。
 *
 * 官方 `ActorRenderLayer`（`lj`）的 17 层顺序 + `Gg` 的方向映射：
 * ```
 * 方向映射：a = (dir - 1) >> 1
 *   dir 1 → 0 = 背面镜像      dir 3 → 1 = 正面
 *   dir 5 → 2 = 正面镜像      dir 7 → 3 = 背面
 * ```
 * 也就是说 **3/5 朝镜头（正面图），1/7 背对镜头（背面图）**，
 * 1 与 5 需要水平镜像（`ActorRenderLayer` 用 `dir & 根` 的镜像规则）。
 *
 * 基础 actor 图（`actor` 符号 700×840）的格子布局已用真实资源核对：
 * ```
 * 正面块 y=0    背面块 y=420
 *   头 +0（0/1 帧）  身 +60（0/1 帧）  臂 +120（15 帧）→ +180（9 帧）  腿 +300（12 帧）
 * ```
 * 注意官方 `getActorLeg` 对背面写的是 y=420（会切到头部图），
 * 实测背面腿在 y=720，这里用统一 +420 块偏移。
 */

export const ACTOR_WIDTH = 40
export const ACTOR_HEIGHT = 60

/** 手臂帧数：15 + 9（官方 `getActorArm`）。 */
export const ARM_FRAMES = 24
/** 腿帧数（官方 `getActorLeg`）。 */
export const LEG_FRAMES = 12
/** 头/身各有 2 帧。 */
export const HEAD_FRAMES = 2

export type ActorPartCell = 'head' | 'body' | 'arm' | 'leg'

/** 该朝向用正面块还是背面块（正面 = 朝镜头）。 */
export function actorFrontFacing(dir: RoomDirection): boolean {
  return dir === 3 || dir === 5
}

/** 该朝向需要水平镜像（1 与 5）。 */
export function actorMirrored(dir: RoomDirection): boolean {
  return dir === 1 || dir === 5
}

/** 基础 actor 图里某个部位某一帧的格子位置。 */
export function actorCell(
  part: ActorPartCell,
  dir: RoomDirection,
  index = 0,
): { x: number; y: number } {
  const blockY = actorFrontFacing(dir) ? 0 : 420
  switch (part) {
    case 'head':
      return { x: (index % HEAD_FRAMES) * ACTOR_WIDTH, y: blockY }
    case 'body':
      return { x: (index % HEAD_FRAMES) * ACTOR_WIDTH, y: blockY + 60 }
    case 'arm':
      return index < 15
        ? { x: index * ACTOR_WIDTH, y: blockY + 120 }
        : { x: (index - 15) * ACTOR_WIDTH, y: blockY + 180 }
    case 'leg':
      return { x: (index % LEG_FRAMES) * ACTOR_WIDTH, y: blockY + 300 }
  }
}

/** 该部位一共有多少帧。 */
export function actorFrameCount(part: ActorPartCell): number {
  if (part === 'arm') return ARM_FRAMES
  if (part === 'leg') return LEG_FRAMES
  return HEAD_FRAMES
}

/**
 * 从基础 actor 图裁一格（白底转透明）。
 *
 * 越界返回 null：官方 `getArm/getLeg/getHead` 同样做了边界检查，
 * 越界时那层不画（`motionConfig` 里有 60 组动作的手臂帧超过 23，官方就是这样静默丢掉的）。
 */
export function cropActorCell(
  sheet: RgbaImage,
  part: ActorPartCell,
  dir: RoomDirection,
  index = 0,
): RgbaImage | null {
  const safe = index >= 0 ? Math.floor(index) : 0
  if (safe >= actorFrameCount(part)) return null

  const cell = actorCell(part, dir, safe)
  const image = crop(sheet, { x: cell.x, y: cell.y, w: ACTOR_WIDTH, h: ACTOR_HEIGHT })
  whiteKeyBackdrop(image)
  return image
}

export interface ActorPose {
  dir: RoomDirection
  /** 手臂帧 0..23 */
  arms: number
  /** 腿帧 0..11 */
  legs: number
  /**
   * 头发层帧号（官方 `hair`）。
   *
   * **基础头永远取第 0 帧**（`Gg.getHead(dir, 0)`）；`hair` 只喂 `headSprite`
   * （`setHeadIndex`）。早期把它当头部帧用，`hair:1↔2` 交替的动作就会一直闪头。
   */
  hairFrame?: number
}

export interface RoomActorInput {
  /** 基础 actor 的 700×840 sheet */
  sheet: RgbaImage
  pose: ActorPose
  worn?: SmallWorn
  /** 40×60 表情图；没有就用基础头 */
  face?: RgbaImage | null
  /** 地面投影（`avatar_shadow`），可选 */
  shadow?: RgbaImage | null
}

/** 官方小模型的 17 层绘制顺序（从后到前）。 */
const LAYER_ORDER = [
  'shadow',
  'wingBody',
  'head',
  'glas',
  'headSprite',
  'body',
  'leg',
  'pant',
  'csetLeg',
  'clotBody',
  'coatBody',
  'csetBody',
  'arm',
  'clotArm',
  'coatArm',
  'csetArm',
  'hat',
] as const

type LayerName = (typeof LAYER_ORDER)[number]

/** 按官方顺序合成一张 40×60 的房间角色图。 */
export function composeRoomActor(input: RoomActorInput): RgbaImage {
  const { pose, worn, sheet } = input
  const dir = pose.dir
  const block = actorFrontFacing(dir) ? 'front' : 'back'
  const layers = new Map<LayerName, RgbaImage | null>()

  // 官方按帧号取服饰图：`getHeadBmd(dir, curHeadIndex)` / `getArmBmd(dir, curArmIndex)` /
  // `getLegBmd(dir, curLegIndex)`（见 Main.js `ActorRenderLayer.drawHead/drawArm/drawLeg`）。
  const frame = (frames: RgbaImage[] | undefined, index: number): RgbaImage | null => {
    if (!frames || frames.length === 0) return null
    return frames[Math.max(0, index) % frames.length] ?? null
  }
  const costume = (part: Part, cell: 'body'): RgbaImage | null => {
    const art: SmallCostumeArt['front'] | undefined = worn?.[part]?.art[block]
    return art?.[cell] ?? null
  }
  const costumeFrames = (
    part: Part,
    cell: 'head' | 'arm' | 'leg',
    index: number,
  ): RgbaImage | null => {
    const art: SmallCostumeArt['front'] | undefined = worn?.[part]?.art[block]
    return frame(art?.[cell], index)
  }

  const cset = worn?.cset
  const csetArt = cset ? costume('cset', 'body') : null
  const headCovered = Boolean(cset?.coverHead)
  const hairFrame = pose.hairFrame ?? 0
  const arms = pose.arms
  const legs = pose.legs

  layers.set('shadow', input.shadow ?? null)
  layers.set('wingBody', costume('wing', 'body'))
  // 基础头固定第 0 帧；表情图（faceLook）在官方里也是 getFace(dir)，不跟 hair 走
  layers.set('head', input.face ?? cropActorCell(sheet, 'head', dir, 0))
  layers.set('glas', costumeFrames('glas', 'head', hairFrame))
  layers.set(
    'headSprite',
    headCovered
      ? null
      : (costumeFrames('hair', 'head', hairFrame) ?? costumeFrames('bear', 'head', hairFrame)),
  )
  // 房间小模型里基础身体/腿**始终可见**（官方 `applyActorBaseVisibility` 只看 showActorBase，
  // 与套装无关；衣柜大模型才有 setCsetable 的隐藏规则）。套装是叠在皮肤上的图层。
  layers.set('body', cropActorCell(sheet, 'body', dir, 0))
  layers.set('leg', cropActorCell(sheet, 'leg', dir, pose.legs))
  layers.set('pant', cset ? null : costumeFrames('pant', 'leg', legs))
  layers.set('csetLeg', csetArt ? costumeFrames('cset', 'leg', legs) : null)
  layers.set('clotBody', cset ? null : costume('clot', 'body'))
  layers.set('coatBody', cset ? null : costume('coat', 'body'))
  layers.set('csetBody', csetArt)
  layers.set('arm', cropActorCell(sheet, 'arm', dir, pose.arms))
  layers.set('clotArm', cset ? null : costumeFrames('clot', 'arm', arms))
  layers.set('coatArm', cset ? null : costumeFrames('coat', 'arm', arms))
  layers.set('csetArm', csetArt ? costumeFrames('cset', 'arm', arms) : null)
  layers.set(
    'hat',
    headCovered
      ? costumeFrames('cset', 'head', hairFrame)
      : costumeFrames('hats', 'head', hairFrame),
  )

  const canvas = createImage(ACTOR_WIDTH, ACTOR_HEIGHT)
  for (const name of LAYER_ORDER) {
    const image = layers.get(name)
    if (image) blend(canvas, image)
  }

  return actorMirrored(dir) ? flipHorizontal(canvas) : canvas
}

/** 待机姿势。 */
export function idlePose(dir: RoomDirection): ActorPose {
  return { dir, arms: 0, legs: 0, hairFrame: 0 }
}
