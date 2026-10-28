/** 大模型的基础资源：都在 `actor<ver>.zip` 里。 */
import { openBundle, readSymbolImage } from './bundle'
import { crop } from './image'
import type { OfficialSpec } from './spec'
import type { RgbaImage } from './types'

export type Sex = 1 | 2

export interface BaseActorInput {
  spec: OfficialSpec
  sex: Sex
  zipBytes: Uint8Array
}

/**
 * 基础角色加载逻辑：
 *   头 = actor sheet 的 (600,0) 男 / (600,300) 女
 *   身 = model_mbody / model_fbody
 *   腿 = model_mleg / model_fleg
 */
export function loadBaseActor({ spec, sex, zipBytes }: BaseActorInput): {
  head: RgbaImage
  body: RgbaImage
  lowerbody: RgbaImage
} {
  const bundle = openBundle(zipBytes)
  const sheet = readSymbolImage(bundle, 'actor')
  if (!sheet) throw new Error('基础角色包缺少 actor 符号')

  const headRect = sex === 1 ? spec.baseCrops.boyHead : spec.baseCrops.girlHead
  const head = crop(sheet, headRect)

  const bodySymbol = sex === 1 ? 'model_mbody' : 'model_fbody'
  const legSymbol = sex === 1 ? 'model_mleg' : 'model_fleg'

  const body = readSymbolImage(bundle, bodySymbol)
  const lowerbody = readSymbolImage(bundle, legSymbol)
  if (!body) throw new Error(`基础角色包缺少 ${bodySymbol}`)
  if (!lowerbody) throw new Error(`基础角色包缺少 ${legSymbol}`)

  return { head, body, lowerbody }
}

/**
 * 表情包（faceLook）：`<code>_m_show` / `<code>_f_show` 都是 100×150。
 * 走的是图集模式，`readSymbolImage` 会自动裁。
 */
export function loadFaceLook(zipBytes: Uint8Array, code: string, sex: Sex): RgbaImage | null {
  const bundle = openBundle(zipBytes)
  return readSymbolImage(bundle, `${code}_${sex === 1 ? 'm' : 'f'}_show`)
}
