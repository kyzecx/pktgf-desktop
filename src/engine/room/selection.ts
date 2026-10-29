import type { RoomDirection } from '@shared/contract'

import { furniDims, type FurniMeta } from './furni'

/**
 * 框选与叠放判定。
 *
 * 两个都是官方装修里有的操作：
 * - 框选：拖出一个格子矩形，命中**占地矩形**就算选中（不是只看锚点格）
 * - 叠放：`otherOverMe > 0` 的物件当底座，`meOverOther` 的物件才能放上去
 *   （规则来自 `Furni.otherOverMe` / `meOverOther`，见 docs/room-spec.md §6）
 */

export interface CellRect {
  /** 含端点，已规范化（x0 ≤ x1） */
  x0: number
  x1: number
  y0: number
  y1: number
}

export interface FootprintItem {
  uid: string
  x: number
  y: number
  dir: RoomDirection
  def: Pick<FurniMeta, 'rows' | 'cols'> | null
}

/** 家具占地的格子矩形（按朝向取有效行列）。 */
export function footprintRect(item: FootprintItem): CellRect {
  const dims = item.def ? furniDims(item.def, item.dir) : { rows: 1, cols: 1 }
  return {
    x0: item.x,
    x1: item.x + dims.cols - 1,
    y0: item.y,
    y1: item.y + dims.rows - 1,
  }
}

/** 规范化从两格拖出来的矩形。 */
export function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): CellRect {
  return {
    x0: Math.min(a.x, b.x),
    x1: Math.max(a.x, b.x),
    y0: Math.min(a.y, b.y),
    y1: Math.max(a.y, b.y),
  }
}

/** 两个矩形是否相交（含贴边）。 */
export function rectsOverlap(a: CellRect, b: CellRect): boolean {
  return a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1
}

/**
 * 框选命中的 uid。
 *
 * 挂墙件没有地面占地（`wallLoc`），框选直接跳过 —— 它们只能点选，
 * 否则拖一下就会把整面墙的东西全选走。
 */
export function selectInRect(
  items: FootprintItem[],
  rect: CellRect,
  options: { wallUids?: Set<string> } = {},
): string[] {
  // 单格点一下不算框选（避免和普通点击冲突）
  if (rect.x1 - rect.x0 < 1 && rect.y1 - rect.y0 < 1) return []
  return items
    .filter((item) => !options.wallUids?.has(item.uid))
    .filter((item) => rectsOverlap(footprintRect(item), rect))
    .map((item) => item.uid)
}

/** 这件东西能不能放到 host 上面（官方 `otherOverMe` / `meOverOther`）。 */
export function canStackOn(
  host: { otherOverMe: number } | null,
  child: { meOverOther: boolean } | null,
): boolean {
  if (!host || !child) return false
  return host.otherOverMe > 0 && child.meOverOther
}
