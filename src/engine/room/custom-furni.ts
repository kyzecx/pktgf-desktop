import type { CatalogFurniture } from '@shared/contract'

/**
 * 自定义家具（M6）。
 *
 * 用户导入的家具没有官方 `furniConfig`，所以要自己生成一份「像官方一样」的目录条目，
 * 让渲染、命中、排序、编辑都走同一条路径 —— 不做第二套特殊逻辑。
 *
 * 支持两种来源：
 * - `png`：一张图（推荐 20×10 菱形网格对齐），符号名按 `_3_01` 约定，其它朝向靠镜像
 * - `zip`：结构与官方一致的符号包（`<code>_<dir>_<NN>` + `<code>s`）
 */

export interface CustomFurniMeta {
  name: string
  /** 占地行数（Y 方向） */
  rows: number
  /** 占地列数（X 方向） */
  cols: number
  /** 1=单向 2=两向 4=四向 */
  dirable: 1 | 2 | 4
  symetric: boolean
  /** 官方原始锚点串，例如 "28 37" */
  baseLoc: string
  /** 可叠放点；空串表示不可叠 */
  surfaceLoc: string
  /** 1 地面 / 2 地毯 / 3,4 挂墙 / 5 靠墙 */
  position: number
  usage: number
  meOverOther: boolean
  otherOverMe: 0 | 1 | 2
  /** 官方动作名（可选，接入 furniMotionConfig 里的组） */
  animation: string | null
  functionType: string | null
  /** 交互模板：只允许内置几类 */
  interact: 'none' | 'toggle' | 'cycle' | 'sit' | 'lie'
}

export const CUSTOM_CODE_PREFIX = 'custom:'

export function customCode(id: string): string {
  return `${CUSTOM_CODE_PREFIX}${id}`
}

export function isCustomCode(code: string): boolean {
  return code.startsWith(CUSTOM_CODE_PREFIX)
}

export function customId(code: string): string {
  return isCustomCode(code) ? code.slice(CUSTOM_CODE_PREFIX.length) : code
}

export const DEFAULT_CUSTOM_META: CustomFurniMeta = {
  name: '自定义家具',
  rows: 1,
  cols: 1,
  dirable: 2,
  symetric: true,
  baseLoc: '10 10',
  surfaceLoc: '',
  position: 1,
  usage: 3,
  meOverOther: false,
  otherOverMe: 0,
  animation: null,
  functionType: null,
  interact: 'none',
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

/** 校验自定义家具元数据；错误会直接显示在导入向导里。 */
export function validateCustomFurni(meta: CustomFurniMeta): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!meta.name.trim()) errors.push('名称不能为空')
  if (!Number.isInteger(meta.rows) || meta.rows < 1 || meta.rows > 12) {
    errors.push('行数需为 1–12 的整数')
  }
  if (!Number.isInteger(meta.cols) || meta.cols < 1 || meta.cols > 12) {
    errors.push('列数需为 1–12 的整数')
  }
  if (![1, 2, 4].includes(meta.dirable)) errors.push('朝向只能是 1 / 2 / 4')

  const base = parsePoint(meta.baseLoc)
  if (!base) errors.push('锚点格式应为 "x y"（像素）')
  else if (base.x < 0 || base.y < 0) errors.push('锚点不能为负数')

  if (meta.surfaceLoc.trim()) {
    const bad = meta.surfaceLoc
      .split('&')
      .flatMap((group) => group.split('$'))
      .some((point) => !parsePoint(point))
    if (bad) errors.push('可叠放点格式应为 "x y$x y"')
  }

  if (meta.rows > 6 || meta.cols > 6) warnings.push('占格超过 6×6，摆放时容易和别的家具挤在一起')
  if (meta.position === 3 || meta.position === 4) {
    warnings.push('挂墙家具的锚点由程序居中，meta 里的锚点不会生效')
  }

  return { ok: errors.length === 0, errors, warnings }
}

function parsePoint(raw: string): { x: number; y: number } | null {
  const parts = raw.trim().split(/\s+/)
  if (parts.length !== 2) return null
  const x = Number(parts[0])
  const y = Number(parts[1])
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

/**
 * 合成一个目录条目，让自定义家具和官方家具走完全相同的渲染/交互路径。
 *
 * `zip` 指向自定义包（`custom/<id>`），实际位图由渲染层从自定义存储里取。
 */
export function synthesizeFurniDef(id: string, meta: CustomFurniMeta): CatalogFurniture {
  return {
    code: customCode(id),
    type: 0,
    name: meta.name.trim() || '自定义家具',
    description: '自定义导入',
    category: 'custom',
    kind: 'furni',
    serial: 0,
    zip: `custom/${id}`,
    md5: `custom-${id}`,
    rows: meta.rows,
    cols: meta.cols,
    dirable: meta.dirable,
    symetric: meta.symetric,
    baseLoc: meta.baseLoc,
    surfaceLoc: meta.surfaceLoc || null,
    position: meta.position,
    usage: meta.usage,
    meOverOther: meta.meOverOther,
    otherOverMe: meta.otherOverMe,
    behaviour: meta.interact === 'none' ? null : behaviourFor(meta.interact),
    functionType: meta.functionType,
    motion: meta.animation,
    animationMode: meta.animation ? 1 : 0,
    light: null,
  }
}

/** 交互模板 → 官方 behaviour 串。 */
function behaviourFor(kind: CustomFurniMeta['interact']): string {
  switch (kind) {
    case 'toggle':
      return 'open 打开 1'
    case 'cycle':
      return 'open 切换 1'
    case 'sit':
      return 'sit 坐下 1'
    case 'lie':
      return 'lie 躺下 1'
    default:
      return ''
  }
}

/**
 * 单图导入时推荐锚点：取「底边中点」。
 *
 * 图宽对应 (rows+cols)*10，图高大致是 (rows+cols)*5 + 侧面厚度，
 * 这样点一下就能用，用户再按预览微调。
 */
export function suggestBaseLoc(
  image: { width: number; height: number },
  rows: number,
  cols: number,
): string {
  const x = Math.round(image.width / 2)
  const y = Math.max(0, Math.round(image.height - (rows + cols) * 2.5))
  return `${x} ${y}`
}
