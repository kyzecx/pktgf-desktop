import { directionFromDelta, type GridPoint } from './grid'
import type { RoomModel } from './room'
import type { RoomDirection } from '@shared/contract'

/**
 * 房间内的行走寻路。
 *
 * 官方把「走到哪」交给服务端算（客户端只播 `movePath`），
 * 本地编辑器自己用 A* 在 `RoomModel.canWalk` 的可走图上找路。
 * 只走四方向（`dir 1/3/5/7`），与角色的美术一致。
 */

export interface WalkStep {
  cell: GridPoint
  /** 走向该格时的朝向 */
  dir: RoomDirection
}

const DIRECTIONS: Array<{ dx: number; dy: number }> = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
]

/**
 * A* 寻路，返回不含起点的路径；走不通返回空数组。
 *
 * 启发函数用曼哈顿距离（四方向移动下是可采纳的）。
 */
export function findPath(model: RoomModel, from: GridPoint, to: GridPoint): WalkStep[] {
  if (!model.canWalk(to.x, to.y)) return []
  if (from.x === to.x && from.y === to.y) return []

  const startKey = key(from.x, from.y)
  const goalKey = key(to.x, to.y)

  const open = new Map<string, GridPoint>()
  const cameFrom = new Map<string, string>()
  const gScore = new Map<string, number>([[startKey, 0]])
  const fScore = new Map<string, number>([[startKey, heuristic(from, to)]])
  open.set(startKey, { x: from.x, y: from.y })

  const points = new Map<string, GridPoint>([[startKey, { x: from.x, y: from.y }]])

  while (open.size > 0) {
    // 取 f 最小的节点（房间最大也是几百格，线性扫描足够）
    let currentKey = ''
    let best = Infinity
    for (const [nodeKey, node] of open) {
      const score = fScore.get(nodeKey) ?? Infinity
      if (score < best) {
        best = score
        currentKey = nodeKey
        void node
      }
    }
    if (currentKey === goalKey) return reconstruct(cameFrom, points, startKey, goalKey)
    open.delete(currentKey)
    const current = points.get(currentKey)
    if (!current) break

    for (const { dx, dy } of DIRECTIONS) {
      const nx = current.x + dx
      const ny = current.y + dy
      if (!model.canWalk(nx, ny)) continue
      const neighborKey = key(nx, ny)
      const tentative = (gScore.get(currentKey) ?? Infinity) + 1
      if (tentative >= (gScore.get(neighborKey) ?? Infinity)) continue

      cameFrom.set(neighborKey, currentKey)
      gScore.set(neighborKey, tentative)
      fScore.set(neighborKey, tentative + heuristic({ x: nx, y: ny }, to))
      if (!points.has(neighborKey)) points.set(neighborKey, { x: nx, y: ny })
      open.set(neighborKey, { x: nx, y: ny })
    }
  }

  return []
}

function reconstruct(
  cameFrom: Map<string, string>,
  points: Map<string, GridPoint>,
  startKey: string,
  goalKey: string,
): WalkStep[] {
  const cells: GridPoint[] = []
  let current = goalKey
  while (current !== startKey) {
    const point = points.get(current)
    if (!point) break
    cells.push(point)
    const previous = cameFrom.get(current)
    if (!previous) break
    current = previous
  }
  cells.reverse()

  const steps: WalkStep[] = []
  let prev = points.get(startKey) ?? { x: 0, y: 0 }
  for (const cell of cells) {
    const dir = directionFromDelta(cell.x - prev.x, cell.y - prev.y)
    if (dir) steps.push({ cell, dir })
    prev = cell
  }
  return steps
}

function heuristic(a: GridPoint, b: GridPoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function key(x: number, y: number): string {
  return `${x},${y}`
}
