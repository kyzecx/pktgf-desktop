/** 角色部位与图层标识。 */
export type Part =
  'hair' | 'cset' | 'hats' | 'mask' | 'glas' | 'clot' | 'pant' | 'coat' | 'bear' | 'wing'

/** 大模型（100×150）的 16 个绘制层，顺序即 z 序。 */
export type LayerId =
  | 'backHead'
  | 'wing'
  | 'body'
  | 'lowerbody'
  | 'head'
  | 'face'
  | 'pant'
  | 'clot'
  | 'coat'
  | 'bear'
  | 'glas'
  | 'cset'
  | 'frontHead'
  | 'mask'
  | 'hat'
  | 'wingMask'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** 非预乘的 RGBA 位图。100×150 的角色画布就是这个类型。 */
export interface RgbaImage {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
}

/** 某个部位在 sheet 上用到的大图帧。 */
export interface PartBinding {
  /** 是否取 (600,0) 的「头前层」帧。 */
  frontHead?: boolean
  /** 是否取 (600,150) 的「头后层」帧。 */
  backHead?: boolean
  /** 是否取 (600,300) 的「身体」帧。 */
  body?: boolean
  /** 是否取 (600,450) 的「翅膀遮罩」帧。 */
  wingMask?: boolean
}
