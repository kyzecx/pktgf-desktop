import type { CostumeInstance } from './costume'
import type { LayerId, Part } from './types'

export type Worn = Partial<Record<Part, CostumeInstance>>

/** 不在任何部位上，只由性别/基础模型决定的层。 */
const BASE_LAYERS: LayerId[] = ['body', 'lowerbody', 'head']

export interface VisibilityInput {
  worn: Worn
  /** 游戏里的 showActorBase：关掉后不画基础身体与头。 */
  showActorBase?: boolean
}

/** 只负责「哪一层可见」，不碰位图。 */
export function resolveVisibility({
  worn,
  showActorBase = true,
}: VisibilityInput): Record<LayerId, boolean> {
  const visibility: Record<LayerId, boolean> = {
    backHead: true,
    wing: Boolean(worn.wing),
    body: true,
    lowerbody: true,
    head: true,
    face: true,
    pant: Boolean(worn.pant),
    clot: Boolean(worn.clot),
    coat: Boolean(worn.coat),
    bear: Boolean(worn.bear),
    glas: Boolean(worn.glas),
    cset: false,
    frontHead: true,
    mask: Boolean(worn.mask),
    hat: Boolean(worn.hats),
    wingMask: Boolean(worn.wing?.wingMask),
  }

  const cset = worn.cset
  if (cset) {
    visibility.cset = Boolean(cset.body)
    visibility.body = false
    visibility.lowerbody = false
    visibility.clot = false
    visibility.coat = false
    visibility.pant = false
    visibility.wingMask = false
    if (cset.coverHead) {
      visibility.backHead = false
      visibility.frontHead = false
      visibility.hat = false
    }
  } else {
    // bodySprite.visible = showActorBase && (clot ? clot.displaytemplate : true)
    visibility.body = showActorBase && (worn.clot ? worn.clot.displaytemplate : true)
    // lowerbodySprite.visible = showActorBase && (pant ? pant.displaytemplate : true)
    visibility.lowerbody = showActorBase && (worn.pant ? worn.pant.displaytemplate : true)
    visibility.cset = false
  }

  // 头发压帽子：setHair/setHat 直接把帽子位图清空。
  if (worn.hair?.coverHead) visibility.hat = false

  if (!showActorBase) {
    for (const layer of BASE_LAYERS) visibility[layer] = false
  }

  return visibility
}

/** 任一头部部件存在且没有声明 useMask，就放弃整图白转透明。 */
export function hasOptOutHeadMask(worn: Worn): boolean {
  const headParts: Part[] = ['hats', 'mask', 'glas', 'bear', 'hair']
  return headParts.some((part) => {
    const item = worn[part]
    return Boolean(item) && !item?.useMask
  })
}

/** 合成结束后是否要整图白转透明。 */
export function shouldWhiteKeyComposite(worn: Worn): boolean {
  const needsWhiteKey = Boolean(worn.coat) || Boolean(worn.cset)
  if (!needsWhiteKey) return false
  if (worn.cset?.frames.length) return false
  return !hasOptOutHeadMask(worn)
}
