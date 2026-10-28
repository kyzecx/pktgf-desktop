import * as React from 'react'

import type { Catalog, CatalogItem, Part } from '@shared/contract'
import { encodeGif } from '@engine/index'
import { toBase64 } from '@/services/assets'
import { useOutfitStore } from '../state/outfit-store'
import type { UseActorPreviewResult } from './use-actor-preview'

export interface OutfitExportState {
  exportingPng: boolean
  exportingGif: boolean
  hasMotion: boolean
  exportPng: () => Promise<void>
  exportGif: () => Promise<void>
}

/**
 * 预览导出。
 *
 * 导出目标跟随当前的「预览显示」：
 * 大图 → 100×150 角色；小图 → 正/背两个 40×60；双图 → 大图在左、小模型在右。
 * PNG 固定 4× 放大；GIF 按 animalMotionConfig 的帧时长逐帧合成。
 * 小图不参与动画，因此小图模式下 GIF 按钮会禁用。
 */
export function useOutfitExport({
  catalog,
  worn,
  preview,
}: {
  catalog: Catalog
  worn: Partial<Record<Part, CatalogItem>>
  preview: UseActorPreviewResult
}): OutfitExportState {
  const [exportingPng, setExportingPng] = React.useState(false)
  const [exportingGif, setExportingGif] = React.useState(false)
  const previewMode = useOutfitStore((state) => state.previewMode)

  const animated = React.useMemo(
    () => Object.values(worn).find((item) => item?.motion) ?? null,
    [worn],
  )
  const steps = React.useMemo(
    () => (animated?.motion ? (catalog.motions[animated.motion] ?? []) : []),
    [animated, catalog],
  )
  // 小模型是静态正/背图，GIF 不适用。
  const hasMotion = preview.hasMotion && previewMode !== 'small'

  const exportPng = React.useCallback(async (): Promise<void> => {
    setExportingPng(true)
    try {
      const dataUrl = await preview.exportArrangementPng(previewMode, 4)
      if (!dataUrl) return
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
      await window.pkt.saveFile({
        suggestedName: `pktgf-outfit-${Date.now()}.png`,
        dataBase64: base64,
      })
    } catch (error) {
      console.error('[outfits] 导出 PNG 失败', error)
    } finally {
      setExportingPng(false)
    }
  }, [preview, previewMode])

  const exportGif = React.useCallback(async (): Promise<void> => {
    if (!preview.hasMotion || previewMode === 'small') return

    setExportingGif(true)
    try {
      const count = preview.motionFrameCount
      // 自建动态素材按 24fps；目录动态物品再用 animalMotionConfig 的时长覆盖。
      const delays = Array.from({ length: count }, () => Math.round(1000 / 24))
      for (const step of steps) {
        const index = step.frame - 1
        if (index >= 0 && index < delays.length) delays[index] = Math.max(60, step.duration)
      }

      const frames = await preview.exportArrangementFrames(previewMode, count, 4)
      if (frames.length === 0) return

      await window.pkt.saveFile({
        suggestedName: `pktgf-outfit-${Date.now()}.gif`,
        dataBase64: toBase64(encodeGif(frames, delays)),
      })
    } catch (error) {
      console.error('[outfits] 导出 GIF 失败', error)
    } finally {
      setExportingGif(false)
    }
  }, [preview, steps, previewMode])

  return { exportingPng, exportingGif, hasMotion, exportPng, exportGif }
}
