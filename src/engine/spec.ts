import type { Part, PartBinding, Rect } from './types'

/** 运行时角色渲染参数。 */
export interface OfficialSpec {
  actor: {
    frameWidth: number
    frameHeight: number
    smallWidth: number
    smallHeight: number
  }
  /** 大模型的绘制顺序，从后到前。 */
  layerOrder: string[]
  /** 标准 sheet 上 100×150 大图的裁切矩形。 */
  crops: {
    frontHead: Rect
    backHead: Rect
    body: Rect
    wingMask: Rect
  }
  /** 基础角色 sheet（actor<ver>.zip 的 actor 符号）上的头部位图。 */
  baseCrops: {
    boyHead: Rect
    girlHead: Rect
  }
  /** 动态物品的帧条布局。 */
  animated: {
    frameWidth: number
    frameHeight: number
    maxFrames: number
  }
  /** 每个部位要从 sheet 上取哪些帧。 */
  parts: Record<Part, PartBinding>
  /** 会触发「整图白转透明」的部位。 */
  whiteKeyBodyParts: Part[]
}

/** 内置兜底渲染参数。 */
export const FALLBACK_SPEC: OfficialSpec = {
  actor: { frameWidth: 100, frameHeight: 150, smallWidth: 40, smallHeight: 60 },
  layerOrder: [
    'backHead',
    'wing',
    'body',
    'lowerbody',
    'head',
    'face',
    'pant',
    'clot',
    'coat',
    'bear',
    'glas',
    'cset',
    'frontHead',
    'mask',
    'hat',
    'wingMask',
  ],
  crops: {
    frontHead: { x: 600, y: 0, w: 100, h: 150 },
    backHead: { x: 600, y: 150, w: 100, h: 150 },
    body: { x: 600, y: 300, w: 100, h: 150 },
    wingMask: { x: 600, y: 450, w: 100, h: 150 },
  },
  baseCrops: {
    boyHead: { x: 600, y: 0, w: 100, h: 150 },
    girlHead: { x: 600, y: 300, w: 100, h: 150 },
  },
  animated: { frameWidth: 100, frameHeight: 150, maxFrames: 8 },
  parts: {
    hair: { frontHead: true, backHead: true },
    cset: { body: true },
    hats: { frontHead: true },
    mask: { frontHead: true },
    glas: { frontHead: true },
    clot: { body: true },
    pant: { body: true },
    coat: { body: true },
    bear: { frontHead: true },
    wing: { body: true, wingMask: true },
  },
  whiteKeyBodyParts: ['clot', 'coat', 'cset'],
}

/** 运行时参数入口；配置缺失或结构异常时退回内置常量。 */
export function loadOfficialSpec(raw?: unknown): OfficialSpec {
  if (!raw || typeof raw !== 'object') return FALLBACK_SPEC
  const candidate = raw as Partial<OfficialSpec>
  if (!Array.isArray(candidate.layerOrder) || candidate.layerOrder.length !== 16) {
    return FALLBACK_SPEC
  }
  if (!candidate.crops || !candidate.baseCrops || !candidate.parts || !candidate.actor) {
    return FALLBACK_SPEC
  }
  return {
    ...FALLBACK_SPEC,
    ...candidate,
    crops: { ...FALLBACK_SPEC.crops, ...candidate.crops },
    baseCrops: { ...FALLBACK_SPEC.baseCrops, ...candidate.baseCrops },
    animated: { ...FALLBACK_SPEC.animated, ...candidate.animated },
    parts: { ...FALLBACK_SPEC.parts, ...candidate.parts },
  } as OfficialSpec
}
