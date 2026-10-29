import type { GridPoint } from './grid'
import type { RoomDirection } from '@shared/contract'

/**
 * 房间深度排序，照抄官方 `org.jpixel.utils.SortMgr2D`（`Rb`）。
 *
 * 官方**不是**按 `y` 排序，而是维护一份 `items` 数组（索引 = 绘制顺序），
 * 新物件按 `isJustBack` 做插入，再单独处理「叠放在别的家具上」的子树。
 * 两个同 `y` 的物件前后关系取决于插入历史，所以必须整套照搬，见 docs/room-spec.md §7。
 */

export interface Sortable {
  id: string
  /** 官方 topPoint：占地的左上角格点 */
  top: GridPoint
  /** 占地行数（Y 方向） */
  rows: number
  /** 占地列数（X 方向） */
  cols: number
  /** 父物件 id（叠放在谁上面）；没有则 null */
  parentId: string | null
  /** 0 不可叠 / 1 多面 / 2 只有首面 */
  overMe: 0 | 1 | 2
  /** 叠放在父物件的第几个面 */
  surfaceIndex?: number
  /** 挂墙物件没有格点，用像素 y 参与比较 */
  isWall?: boolean
  dir?: RoomDirection
}

export interface SortProvider<T extends Sortable> {
  /** 父物件的所有子物件（含面序号） */
  childrenOf(parent: T): Array<{ item: T; index: number }>
  /** 某个面的排序点（来自 surfaceLoc）；缺省时按面序号排 */
  slotOf(parent: T, index: number): GridPoint | null
}

export class SortMgr2D<T extends Sortable> {
  private items: T[] = []

  constructor(private readonly provider?: SortProvider<T>) {}

  /** 当前绘制顺序（索引 0 最靠后）。 */
  get order(): readonly T[] {
    return this.items
  }

  clear(): void {
    this.items = []
  }

  /** 全量重建：按官方 `sortAllItems` 的顺序逐个插入。 */
  rebuild(items: T[]): T[] {
    this.items = []
    for (const item of items) this.insert(item)
    return this.items
  }

  /**
   * 官方 `addItem` + `insertByDepth`：
   * 有父物件时插到父物件后面，否则按 peer 深度插入；本身可叠放时再重排自己的子树。
   */
  insert(item: T): void {
    const rootIndex =
      item.parentId === null ? -1 : this.items.findIndex((entry) => entry.id === item.parentId)
    if (rootIndex >= 0) {
      this.items.splice(rootIndex + 1, 0, item)
      this.reorderSurfaceOf(this.items[rootIndex]!)
      return
    }

    this.insertPeerByDepth(item)
    if (item.overMe > 0) this.reorderSurfaceOf(item)
  }

  remove(id: string): void {
    const index = this.items.findIndex((entry) => entry.id === id)
    if (index >= 0) this.items.splice(index, 1)
  }

  /** 官方 `refreshItem`：位置变了先摘出来重新插入。 */
  refresh(id: string): void {
    const index = this.items.findIndex((entry) => entry.id === id)
    if (index < 0) return
    const [item] = this.items.splice(index, 1)
    if (item) this.insert(item)
  }

  /** 官方 `insertPeerByDepth`：找到第一个「我该排在它前面」的 peer。 */
  private insertPeerByDepth(item: T): void {
    for (let i = 0; i < this.items.length; i += 1) {
      const peer = this.items[i]!
      // 父子关系交给 surface 子树处理，不参与 peer 比较（官方 isSortPeerFast）
      if (peer.id === item.parentId) continue
      if (peer.parentId === item.id) continue
      if (isJustBack(item, peer)) {
        this.items.splice(i, 0, item)
        return
      }
    }
    this.items.push(item)
  }

  /**
   * 官方 `reorderSurfaceOf`：把父物件的整棵子树摘掉，再按面的排序点重新插回去。
   */
  private reorderSurfaceOf(parent: T): void {
    if (parent.overMe <= 0 || !this.provider) return

    const tree = this.collectSurfaceTree(parent)
    if (tree.length === 0) return

    const treeIds = new Set(tree.map((item) => item.id))
    this.items = this.items.filter((item) => !treeIds.has(item.id))

    const parentIndex = this.items.findIndex((item) => item.id === parent.id)
    if (parentIndex < 0) return

    const ordered: T[] = []
    this.pushSurfaceItems(parent, ordered)
    this.items.splice(parentIndex + 1, 0, ...ordered)
  }

  private pushSurfaceItems(parent: T, out: T[]): void {
    if (!this.provider) return

    if (parent.overMe === 1) {
      const children = [...this.provider.childrenOf(parent)]
      children.sort((a, b) => {
        const sa = this.provider!.slotOf(parent, a.index)
        const sb = this.provider!.slotOf(parent, b.index)
        if (sa && sb) {
          if (sa.y !== sb.y) return sa.y - sb.y
          if (sa.x !== sb.x) return sa.x - sb.x
        }
        return a.index - b.index
      })
      for (const child of children) {
        out.push(child.item)
        if (child.item.overMe > 0) this.pushSurfaceItems(child.item, out)
      }
      return
    }

    // overMe === 2：只有首面，沿链式结构一直往下
    let current: T | null = parent
    while (current !== null && current.overMe > 0) {
      const node: T = current
      const first: { item: T; index: number } | undefined = this.provider
        .childrenOf(node)
        .find((child) => child.index === 0)
      if (!first) break
      out.push(first.item)
      current = first.item
    }
  }

  private collectSurfaceTree(parent: T): T[] {
    const out: T[] = []
    if (!this.provider || parent.overMe <= 0) return out
    const walk = (node: T): void => {
      for (const child of this.provider!.childrenOf(node)) {
        out.push(child.item)
        if (child.item.overMe > 0) walk(child.item)
      }
    }
    walk(parent)
    return out
  }
}

/**
 * 官方 `isJustBack`：`a` 是否应该排在 `b` 后面（更靠前）。
 *
 * ```
 * a.top.x < b.top.x + b.cols && a.top.y < b.top.y + b.rows
 * ```
 * 注意 `cols` 加在 x、`rows` 加在 y，和 `furniConfig` 的字段命名正好相反。
 */
export function isJustBack(
  a: Pick<Sortable, 'top' | 'rows' | 'cols'>,
  b: Pick<Sortable, 'top' | 'rows' | 'cols'>,
): boolean {
  return a.top.x < b.top.x + b.cols && a.top.y < b.top.y + b.rows
}
