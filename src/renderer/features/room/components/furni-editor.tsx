import * as React from 'react'
import { ButtonRoot } from '@heroui/react'

import type { CatalogFurniture, RoomDirection } from '@shared/contract'
import { furniDims, type FurniInstance } from '@engine/room'
import { FloatingWindow } from '@ui/floating'
import { useFloatingStore } from '@ui/floating/use-floating-store'

/**
 * 选中物品的悬浮编辑层。
 *
 * 贴在物品**下方**（跟着缩放走），可以改朝向、切状态、坐/躺、删除。
 * 用绝对定位而不是浮窗：它必须跟着物品走，拖动窗口会脱锚。
 */
export const FURNI_EDITOR_WINDOW_ID = 'room:furni-editor'

export function FurniEditor({
  furni,
  def,
  onSetDir,
  onSetState,
  onRemove,
}: {
  furni: FurniInstance | null
  def: CatalogFurniture | null
  onSetDir: (dir: RoomDirection) => void
  onSetState: (state: number) => void
  onRemove: () => void
}): React.ReactElement | null {
  const open = useFloatingStore((state) => state.open[FURNI_EDITOR_WINDOW_ID] ?? false)
  if (!open || !furni || !def) return null

  const dirs = availableDirs(def)
  const multiState = def.otherOverMe > 0 || def.animationMode > 0

  return (
    <FloatingWindow
      id={FURNI_EDITOR_WINDOW_ID}
      title={def.name}
      width={240}
      defaultPosition={{ x: 640, y: 220 }}
    >
      <div className="p-2">
        <p className="text-[10px] text-pkt-text-mute">
          {furniDims(def, furni.dir).cols}×{furniDims(def, furni.dir).rows} 格 ·{' '}
          {positionLabel(def.position)} · 状态 {furni.state}
          {furni.surface ? ' · 叠放' : ''}
          {furni.wallLoc ? ` · 挂墙 ${furni.wallLoc.variant}` : ''}
        </p>

        <p className="mt-1.5 text-[10px] text-pkt-text-mute">朝向（{dirs.length} 向）</p>
        <div className="flex gap-1">
          {dirs.map((dir) => (
            <ButtonRoot
              key={dir}
              size="sm"
              variant={furni.dir === dir ? 'secondary' : 'ghost'}
              onPress={() => onSetDir(dir)}
            >
              {DIR_LABEL[dir]}
            </ButtonRoot>
          ))}
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          {multiState ? (
            <ButtonRoot size="sm" variant="ghost" onPress={() => onSetState((furni.state + 1) % 2)}>
              开/关
            </ButtonRoot>
          ) : null}
          <ButtonRoot size="sm" variant="ghost" onPress={onRemove}>
            删除
          </ButtonRoot>
        </div>
      </div>
    </FloatingWindow>
  )
}

const DIR_LABEL: Record<RoomDirection, string> = {
  1: '↖',
  3: '↙',
  5: '↘',
  7: '↗',
}

/**
 * 哪些朝向可以选：
 * - `dirable=1`：只有 `_3_` 原图，`dir5` 由镜像得到 → 3 / 5
 * - `dirable=2`：3 / 5（对称件 5 是镜像）
 * - `dirable=4`：3 / 5 / 7 / 1；只有 2 帧图时另外两向是镜像，仍可选
 *   （`resolveFurniSprite` 已经做了镜像兜底）
 */
export function availableDirs(def: CatalogFurniture): RoomDirection[] {
  if (def.dirable === 4) return [1, 3, 5, 7]
  return [3, 5]
}

function positionLabel(position: number): string {
  if (position === 1) return '地面'
  if (position === 2) return '地毯'
  if (position === 3 || position === 4) return '挂墙'
  if (position === 5) return '靠墙'
  return `位置 ${position}`
}
