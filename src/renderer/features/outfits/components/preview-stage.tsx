import { KbdRoot, SpinnerRoot } from '@heroui/react'
import * as React from 'react'

import { cn } from '@ui/cn'

import type { UseActorPreviewResult } from '../hooks/use-actor-preview'
import { EXPORT_SHORTCUT, SAVE_SHORTCUT } from '../shortcuts'
import { useOutfitStore } from '../state/outfit-store'

const SMALL_ZOOM_BOTH = 2
const SMALL_ZOOM_ONLY = 4

/**
 * 预览画布。
 *
 * 缩放、导出、存档、动态播放等操作都收进「衣柜」浮窗（二级菜单），
 * 这里只负责按设置画出大模型 / 小模型。
 */
export function PreviewStage({ preview }: { preview: UseActorPreviewResult }): React.ReactElement {
  const previewMode = useOutfitStore((state) => state.previewMode)
  const smallViews = useOutfitStore((state) => state.smallViews)
  const autoScale = useOutfitStore((state) => state.autoScale)
  const scale = useOutfitStore((state) => state.scale)
  const applyAutoScale = useOutfitStore((state) => state.applyAutoScale)
  const largeRef = React.useRef<HTMLDivElement | null>(null)
  const stageRef = React.useRef<HTMLDivElement | null>(null)
  const showLarge = previewMode !== 'small'
  const showSmall = previewMode !== 'large'
  const showFront = showSmall && smallViews.front
  const showBack = showSmall && smallViews.back
  const smallZoom = previewMode === 'small' ? SMALL_ZOOM_ONLY : SMALL_ZOOM_BOTH

  React.useEffect(() => {
    if (!autoScale || !showLarge) return
    const element = largeRef.current
    const stage = stageRef.current
    if (!element || !stage) return

    const update = (): void => {
      const rect = element.getBoundingClientRect()
      const stageRect = stage.getBoundingClientRect()
      // 画布自身高度会随缩放变化，不能拿它算；用预览区容器的高度。
      if (rect.width < 10 || stageRect.height < 10) return
      const fit = Math.floor(Math.min((rect.width - 4) / 100, (stageRect.height - 20) / 150))
      const best = Math.max(2, Math.min(4, fit)) as 2 | 3 | 4
      if (best !== scale) applyAutoScale(best)
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [autoScale, showLarge, scale, applyAutoScale])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        ref={stageRef}
        className="relative flex min-h-0 flex-1 items-center justify-center gap-3 p-2"
      >
        {/*
         * 画布始终保持挂载，只用 hidden 控制显示。
         * 条件挂载会让画布在切换预览模式时重新创建，而合成 effect
         * 不会因此重跑，于是出现「切换后白屏」。
         */}
        <div
          ref={largeRef}
          className={cn(
            'min-h-0 min-w-0 flex-1 flex-col items-center justify-center',
            showLarge ? 'flex' : 'hidden',
          )}
        >
          <canvas
            ref={preview.canvasRef}
            className="pkt-pixelated pkt-checker max-h-full max-w-full rounded-pkt border border-pkt-border/60"
          />
        </div>

        <div
          className={cn(
            'relative flex shrink-0 flex-col items-center justify-center gap-2',
            showSmall ? 'flex' : 'hidden',
          )}
        >
          <div className={cn('relative', showFront ? 'block' : 'hidden')} title="小模型 · 正面">
            <canvas
              ref={preview.smallCanvasRef}
              className="pkt-pixelated pkt-checker rounded-pkt border border-pkt-border/60"
              style={{ width: 40 * smallZoom, height: 60 * smallZoom }}
            />
          </div>
          <div className={cn('relative', showBack ? 'block' : 'hidden')} title="小模型 · 背面">
            <canvas
              ref={preview.smallBackCanvasRef}
              className="pkt-pixelated pkt-checker rounded-pkt border border-pkt-border/60"
              style={{ width: 40 * smallZoom, height: 60 * smallZoom }}
            />
          </div>
          {!preview.smallReady ? (
            <span className="absolute inset-0 grid place-items-center rounded-pkt bg-pkt-bg/40">
              <SpinnerRoot size="sm" color="accent" />
            </span>
          ) : null}
        </div>

        {preview.status === 'loading' && showLarge ? (
          <div className="absolute inset-0 grid place-items-center bg-pkt-bg/30">
            <SpinnerRoot size="sm" color="accent" />
          </div>
        ) : null}
        {preview.status === 'error' ? (
          <div className="absolute inset-x-4 bottom-4 rounded-pkt bg-pkt-danger/15 p-2 text-[10px] text-pkt-danger">
            {preview.error}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 px-2 pb-2 text-[10px] text-pkt-text-mute">
        <KbdRoot className="text-[10px]">空格</KbdRoot>
        <span>搜索</span>
        <span className="mx-0.5 opacity-40">·</span>
        <KbdRoot className="text-[10px]">{SAVE_SHORTCUT}</KbdRoot>
        <span>保存</span>
        <span className="mx-0.5 opacity-40">·</span>
        <KbdRoot className="text-[10px]">{EXPORT_SHORTCUT}</KbdRoot>
        <span>导出</span>
      </div>
    </div>
  )
}
