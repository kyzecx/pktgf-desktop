import raw from './data/official-spec.json'
import { loadOfficialSpec } from './spec'

/** 运行时渲染参数。 */
export const OFFICIAL_SPEC = loadOfficialSpec(raw)
