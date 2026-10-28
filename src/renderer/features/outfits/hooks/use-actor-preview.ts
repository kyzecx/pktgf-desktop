import * as React from 'react'

import type { Catalog, CatalogAssets, CatalogFace } from '@shared/contract'
import { blend, createImage, type RgbaImage } from '@engine/index'
import {
  composeFromCatalog,
  composeSmallFromCatalog,
  getBaseActor,
  getFaceLook,
  getFaceMiniImage,
  getSmallBaseActor,
  toDataUrl,
  type CustomCostumeSource,
} from '@/services/assets'
import { SMALL_ART_HEIGHT, SMALL_ART_WIDTH } from '@engine/index'
import { useOutfitStore, type PreviewMode, type SmallViews } from '../state/outfit-store'

const FRAME_WIDTH = 100
const FRAME_HEIGHT = 150

export interface UseActorPreviewResult {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  /** 40×60 的小模型画布（正面/背面）。 */
  smallCanvasRef: React.RefObject<HTMLCanvasElement | null>
  smallBackCanvasRef: React.RefObject<HTMLCanvasElement | null>
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** 小模型是否已经有内容；资源缺失时为 false。 */
  smallReady: boolean
  /** 大图是否有动态（目录动画或自建动态素材） */
  hasMotion: boolean
  /** 大图动画总帧数 */
  motionFrameCount: number
  error: string | null
  /** 按当前选择的大图/小图/双图导出 PNG。 */
  exportArrangementPng: (mode: PreviewMode, scale: number) => Promise<string | null>
  /** 按当前选择逐帧导出；小图模式只返回一帧。 */
  exportArrangementFrames: (mode: PreviewMode, count: number, scale: number) => Promise<RgbaImage[]>
}

/**
 * 合成 + 绘制角色预览。
 *
 * 合成走引擎的纯函数，绘制只在这里做一次；缩放交给 canvas 的
 * `imageSmoothingEnabled = false`，保证像素边缘干净。
 */
export function useActorPreview(
  catalog: Catalog | null,
  assets: CatalogAssets | null,
  faces: CatalogFace[],
  custom: Array<CustomCostumeSource & { frameCount?: number }> = [],
): UseActorPreviewResult {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const smallCanvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const smallBackCanvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const smallFrontRef = React.useRef<RgbaImage | null>(null)
  const smallBackRef = React.useRef<RgbaImage | null>(null)
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('loading')
  const [smallReady, setSmallReady] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const sex = useOutfitStore((state) => state.sex)
  const worn = useOutfitStore((state) => state.worn)
  const faceCode = useOutfitStore((state) => state.faceCode)
  const scale = useOutfitStore((state) => state.scale)
  const playing = useOutfitStore((state) => state.playing)
  const smallViews = useOutfitStore((state) => state.smallViews)
  const [frame, setFrame] = React.useState(0)

  // 动态物品：按 animalMotionConfig 的 duration 逐帧推进
  const motionKey = React.useMemo(() => {
    const animated = Object.values(worn).find((item) => item?.motion)
    return animated?.motion ?? null
  }, [worn])

  const steps = motionKey ? (catalog?.motions[motionKey] ?? []) : []
  const customFrameCount = React.useMemo(
    () => custom.reduce((max, asset) => Math.max(max, asset.frameCount ?? 1), 1),
    [custom],
  )
  const catalogFrameCount = steps.length > 0 ? Math.max(...steps.map((step) => step.frame)) : 0
  const motionFrameCount = Math.max(1, catalogFrameCount, customFrameCount)
  const hasMotion = motionFrameCount > 1

  React.useEffect(() => {
    if (!playing || motionFrameCount <= 1) {
      setFrame(0)
      return
    }
    if (steps.length > 0) {
      let index = 0
      let timer = 0
      const advance = (): void => {
        const step = steps[index]
        if (!step) return
        setFrame(Math.max(0, step.frame - 1))
        timer = window.setTimeout(
          () => {
            index = (index + 1) % steps.length
            advance()
          },
          Math.max(60, step.duration),
        )
      }
      advance()
      return () => window.clearTimeout(timer)
    }

    // 自建动态素材没有 animalMotionConfig，按素材帧率 24fps 播放。
    let index = 0
    const timer = window.setInterval(() => {
      index = (index + 1) % motionFrameCount
      setFrame(index)
    }, 1000 / 24)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, motionKey, catalog, motionFrameCount, steps.length])

  const composedRef = React.useRef<{
    data: Uint8ClampedArray
    width: number
    height: number
  } | null>(null)
  /** 只在这些输入变化时显示加载层；动画帧变化不能反复触发它。 */
  const sceneInputsRef = React.useRef<unknown[] | null>(null)

  React.useEffect(() => {
    if (!catalog || !assets) return
    let cancelled = false

    const sceneInputs = [catalog, assets, faces, sex, worn, faceCode, custom]
    const previousInputs = sceneInputsRef.current
    const isNewScene =
      !previousInputs ||
      sceneInputs.some((value, index) => value !== previousInputs[index])
    sceneInputsRef.current = sceneInputs
    if (isNewScene) setStatus('loading')

    const face = faces.find((entry) => entry.code === faceCode) ?? null

    void (async () => {
      try {
        const [base, faceImage] = await Promise.all([
          getBaseActor(sex, assets),
          getFaceLook(face, sex),
        ])
        const composed = await composeFromCatalog({
          sex,
          worn,
          base,
          face: faceImage,
          frame,
          custom,
        })
        if (cancelled) return

        composedRef.current = composed
        draw(canvasRef.current, composed, scale)
        setStatus('ready')
        setError(null)
      } catch (caught) {
        if (cancelled) return
        setStatus('error')
        setError(caught instanceof Error ? caught.message : String(caught))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [catalog, assets, faces, sex, worn, faceCode, scale, frame, custom])

  // 小模型只使用静态第 0 帧，不跟大模型逐帧重绘；否则动态连身会拖着
  // 两个小画布一起刷新，既浪费算力也容易出现画面抖动。
  React.useEffect(() => {
    if (!assets) return
    let cancelled = false

    const face = faces.find((entry) => entry.code === faceCode) ?? null

    void (async () => {
      try {
        const [smallBase, smallFace] = await Promise.all([
          getSmallBaseActor(assets),
          face ? getFaceMiniImage(face) : Promise.resolve(null),
        ])
        const small = await composeSmallFromCatalog({
          worn,
          base: smallBase,
          face: smallFace,
          custom,
        })
        if (cancelled) return
        smallFrontRef.current = small.front
        smallBackRef.current = small.back
        drawSmall(smallCanvasRef.current, small.front)
        drawSmall(smallBackCanvasRef.current, small.back)
        setSmallReady(true)
      } catch (smallError) {
        if (!cancelled) setSmallReady(false)
        console.warn('[outfits] 小模型合成失败', smallError)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [assets, faces, faceCode, worn, custom])

  const exportArrangementFrames = React.useCallback(
    async (mode: PreviewMode, count: number, targetScale: number): Promise<RgbaImage[]> => {
      if (!catalog || !assets) return []
      const needsFront = mode !== 'large' && smallViews.front
      const needsBack = mode !== 'large' && smallViews.back
      if ((needsFront && !smallFrontRef.current) || (needsBack && !smallBackRef.current)) {
        return []
      }

      if (mode === 'small') {
        const arranged = arrangePreview(
          mode,
          composedRef.current,
          smallFrontRef.current,
          smallBackRef.current,
          smallViews,
          targetScale,
        )
        return arranged ? [arranged] : []
      }

      const faceEntry = faces.find((entry) => entry.code === faceCode) ?? null
      const [base, faceImage] = await Promise.all([
        getBaseActor(sex, assets),
        getFaceLook(faceEntry, sex),
      ])
      const frames: RgbaImage[] = []
      for (let index = 0; index < count; index += 1) {
        const big = await composeFromCatalog({
          sex,
          worn,
          base,
          face: faceImage,
          frame: index,
          custom,
        })
        const arranged = arrangePreview(
          mode,
          big,
          smallFrontRef.current,
          smallBackRef.current,
          smallViews,
          targetScale,
        )
        if (arranged) frames.push(arranged)
      }
      return frames
    },
    [catalog, assets, faces, sex, worn, faceCode, custom, smallViews],
  )

  const exportArrangementPng = React.useCallback(
    async (mode: PreviewMode, targetScale: number): Promise<string | null> => {
      if (!composedRef.current) return null
      const arranged = arrangePreview(
        mode,
        composedRef.current,
        smallFrontRef.current,
        smallBackRef.current,
        smallViews,
        targetScale,
      )
      return arranged ? toDataUrl(arranged) : null
    },
    [smallViews],
  )

  return {
    canvasRef,
    smallCanvasRef,
    smallBackCanvasRef,
    status,
    smallReady,
    hasMotion,
    motionFrameCount,
    error,
    exportArrangementPng,
    exportArrangementFrames,
  }
}

function arrangePreview(
  mode: PreviewMode,
  large: RgbaImage | null | undefined,
  smallFront: RgbaImage | null,
  smallBack: RgbaImage | null,
  views: SmallViews,
  scale: number,
): RgbaImage | null {
  if (!large) return null
  if (mode === 'large') return scaleImage(large, scale)

  // 选中的视角必须已经合成好；没选中的不要求。
  if ((views.front && !smallFront) || (views.back && !smallBack)) return null
  const smalls = [views.front ? smallFront : null, views.back ? smallBack : null].filter(
    (image): image is RgbaImage => Boolean(image),
  )
  if (smalls.length === 0) return null

  const scaledSmalls = smalls.map((image) => scaleImage(image, scale))
  const reference = scaledSmalls[0]!

  if (mode === 'small') {
    const gap = Math.max(2, scale * 2)
    const out = createImage(
      reference.width,
      reference.height * scaledSmalls.length + gap * (scaledSmalls.length - 1),
    )
    scaledSmalls.forEach((image, index) => {
      blend(out, image, 0, index * (reference.height + gap))
    })
    return out
  }

  // 双模型：大图在左，选中的小模型视角上下排在右。
  const big = scaleImage(large, scale)
  const gapMain = Math.max(8, scale * 3)
  const gapSmall = Math.max(4, scale * 2)
  const smallHeight = reference.height * scaledSmalls.length + gapSmall * (scaledSmalls.length - 1)
  const out = createImage(big.width + gapMain + reference.width, Math.max(big.height, smallHeight))
  blend(out, big, 0, Math.floor((out.height - big.height) / 2))
  const smallTop = Math.floor((out.height - smallHeight) / 2)
  scaledSmalls.forEach((image, index) => {
    blend(out, image, big.width + gapMain, smallTop + index * (reference.height + gapSmall))
  })
  return out
}

function toImageData(image: { data: Uint8ClampedArray; width: number; height: number }): ImageData {
  // 引擎的 Uint8ClampedArray 默认泛型是 ArrayBufferLike，这里收窄到 ArrayBuffer
  const data = image.data as unknown as Uint8ClampedArray<ArrayBuffer>
  return new ImageData(data, image.width, image.height)
}

function draw(
  canvas: HTMLCanvasElement | null,
  image: { data: Uint8ClampedArray; width: number; height: number },
  scale: number,
): void {
  if (!canvas) return
  const source = document.createElement('canvas')
  source.width = image.width
  source.height = image.height
  const sourceContext = source.getContext('2d')
  if (!sourceContext) return
  sourceContext.putImageData(toImageData(image), 0, 0)

  canvas.width = FRAME_WIDTH * scale
  canvas.height = FRAME_HEIGHT * scale
  const context = canvas.getContext('2d')
  if (!context) return
  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
}

function drawSmall(
  canvas: HTMLCanvasElement | null,
  image: { data: Uint8ClampedArray; width: number; height: number },
): void {
  if (!canvas) return
  canvas.width = SMALL_ART_WIDTH
  canvas.height = SMALL_ART_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.putImageData(toImageData(image), 0, 0)
}

export function scaleImage(
  image: { data: Uint8ClampedArray; width: number; height: number },
  scale: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  if (scale === 1) return image
  const width = image.width * scale
  const height = image.height * scale
  const data = new Uint8ClampedArray(width * height * 4)

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.floor(y / scale)
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.floor(x / scale)
      const source = (sourceY * image.width + sourceX) * 4
      const target = (y * width + x) * 4
      data[target] = image.data[source] ?? 0
      data[target + 1] = image.data[source + 1] ?? 0
      data[target + 2] = image.data[source + 2] ?? 0
      data[target + 3] = image.data[source + 3] ?? 0
    }
  }

  return { data, width, height }
}
