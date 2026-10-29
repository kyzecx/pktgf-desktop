import type { CatalogRoomDef } from '@shared/contract'
import { buildWallPieces, type RoomLayout } from '@engine/room'
import type { RoomModel } from '@engine/room'

/**
 * 墙面槽位表：把 `buildWallPieces` 的每一块墙板换算成屏幕矩形，供挂墙家具定位。
 *
 * 挂墙家具的位置依赖墙纸图尺寸（官方也是用像素槽位），所以换墙纸时
 * 挂件会按新墙板重新居中；同一面墙里每块墙板一个槽位，`M3.5` 先限制一件挂一板。
 */

export interface WallPanel {
  x: number
  y: number
  width: number
  height: number
  variant: 'up' | 'left' | 'right' | 'down'
  cell: { x: number; y: number }
}

export function buildWallPanels(
  model: RoomModel,
  layout: RoomLayout,
  room: Pick<CatalogRoomDef, 'wallHeight' | 'wallDepth' | 'category' | 'combine'>,
  wall:
    Record<'up' | 'left' | 'right' | 'down', { width: number; height: number }> | null | undefined,
  /** 墙板名义尺寸（缺素材时用） */
  nominal: { width: number; height: number } = { width: 22, height: 132 },
): Map<string, WallPanel> {
  const panels = new Map<string, WallPanel>()
  if (!wall) return panels

  for (const piece of buildWallPieces(model.structure, layout, room, {
    tileCells: wall ? undefined : undefined,
  })) {
    const sprite = wall[piece.variant]
    const width = sprite?.width ?? nominal.width
    const height = sprite?.height ?? nominal.height
    panels.set(`${piece.cell.x},${piece.cell.y},${piece.variant}`, {
      x: piece.x,
      y: piece.y,
      width,
      height,
      variant: piece.variant,
      cell: piece.cell,
    })
  }

  return panels
}
