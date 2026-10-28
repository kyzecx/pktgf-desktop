import type { CostumeInstance } from './costume'
import { blend, createImage, whiteToAlpha } from './image'
import { resolveVisibility, shouldWhiteKeyComposite, type Worn } from './rules'
import type { OfficialSpec } from './spec'
import type { LayerId, RgbaImage } from './types'

export interface BaseActorArt {
  head: RgbaImage
  body: RgbaImage
  lowerbody: RgbaImage
}

export interface ComposeInput {
  spec: OfficialSpec
  base: BaseActorArt
  face?: RgbaImage | null
  worn?: Worn
  /** 动态物品的当前帧号（跨所有动态物品共用）。 */
  frame?: number
  showActorBase?: boolean
}

/** 按固定图层顺序合成一张 100×150 的角色图。纯函数。 */
export function composeActor(input: ComposeInput): RgbaImage {
  const { spec } = input
  const worn = input.worn ?? {}
  const frame = Math.max(0, input.frame ?? 0)
  const visibility = resolveVisibility({ worn, showActorBase: input.showActorBase })

  const canvas = createImage(spec.actor.frameWidth, spec.actor.frameHeight)

  for (const layer of spec.layerOrder as LayerId[]) {
    if (!visibility[layer]) continue
    const image = resolveLayerImage(layer, worn, input.base, input.face ?? null, frame)
    if (image) blend(canvas, image)
  }

  if (shouldWhiteKeyComposite(worn)) {
    whiteToAlpha(canvas)
  }

  return canvas
}

function resolveLayerImage(
  layer: LayerId,
  worn: Worn,
  base: BaseActorArt,
  face: RgbaImage | null,
  frame: number,
): RgbaImage | null {
  switch (layer) {
    case 'backHead':
      return pickFrame(worn.hair?.backHead, worn.hair, frame)
    case 'wing':
      return pickFrame(worn.wing?.body, worn.wing, frame)
    case 'body':
      return base.body
    case 'lowerbody':
      return base.lowerbody
    case 'head':
      return base.head
    case 'face':
      return face
    case 'pant':
      return pickFrame(worn.pant?.body, worn.pant, frame)
    case 'clot':
      return pickFrame(worn.clot?.body, worn.clot, frame)
    case 'coat':
      return pickFrame(worn.coat?.body, worn.coat, frame)
    case 'bear':
      return pickFrame(worn.bear?.frontHead, worn.bear, frame)
    case 'glas':
      return pickFrame(worn.glas?.frontHead, worn.glas, frame)
    case 'cset':
      return pickFrame(worn.cset?.body, worn.cset, frame)
    case 'frontHead':
      return pickFrame(worn.hair?.frontHead, worn.hair, frame)
    case 'mask':
      return pickFrame(worn.mask?.frontHead, worn.mask, frame)
    case 'hat':
      return pickFrame(worn.hats?.frontHead, worn.hats, frame)
    case 'wingMask':
      return pickFrame(worn.wing?.wingMask, worn.wing, frame)
    default:
      return null
  }
}

function pickFrame(
  still: RgbaImage | undefined,
  costume: CostumeInstance | undefined,
  frame: number,
): RgbaImage | null {
  if (!costume) return still ?? null
  if (costume.frames.length > 0) {
    return costume.frames[frame % costume.frames.length] ?? still ?? null
  }
  return still ?? null
}
