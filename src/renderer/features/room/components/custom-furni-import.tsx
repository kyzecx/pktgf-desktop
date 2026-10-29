import * as React from 'react'
import { ButtonRoot, InputRoot } from '@heroui/react'

import {
  DEFAULT_CUSTOM_META,
  TILE_HEIGHT,
  TILE_WIDTH,
  suggestBaseLoc,
  validateCustomFurni,
  type CustomFurniMeta,
} from '@engine/room'
import { decodePng } from '@engine/index'
import { FloatingWindow } from '@ui/floating'
import { useFloatingStore } from '@ui/floating/use-floating-store'
import { cn } from '@ui/cn'

import { MAX_CUSTOM_BYTES, useCustomFurniStore } from '../state/custom-furni-store'
import { CUSTOM_FURNI_IMPORT_WINDOW_ID } from '../windows'

/**
 * 自定义家具导入向导。
 *
 * 步骤：选图 → 填参数（占格 / 朝向 / 锚点 / 交互）→ 在网格上看锚点对不对 → 保存。
 * 图直接存 dataURL，渲染/命中/排序走和官方家具一样的路径。
 */
export function CustomFurniImport(): React.ReactElement | null {
  const open = useFloatingStore((state) => state.open[CUSTOM_FURNI_IMPORT_WINDOW_ID] ?? false)
  const add = useCustomFurniStore((state) => state.add)

  const [meta, setMeta] = React.useState<CustomFurniMeta>(DEFAULT_CUSTOM_META)
  const [image, setImage] = React.useState<{
    dataUrl: string
    width: number
    height: number
  } | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const validation = React.useMemo(() => validateCustomFurni(meta), [meta])

  const patch = (next: Partial<CustomFurniMeta>): void => {
    setMeta((current) => ({ ...current, ...next }))
  }

  const pickFile = async (): Promise<void> => {
    setError(null)
    const file = await window.pkt.openFile({
      filters: [{ name: '家具图 / 素材包', extensions: ['png', 'zip'] }],
    })
    if (!file) return

    try {
      const bytes = Uint8Array.from(atob(file.base64), (char) => char.charCodeAt(0))
      if (bytes.byteLength > MAX_CUSTOM_BYTES) {
        setError(`文件超过 ${(MAX_CUSTOM_BYTES / 1024 / 1024).toFixed(0)}MB，无法保存`)
        return
      }

      const bitmap = await loadFirstImage(bytes, file.name)
      if (!bitmap) {
        setError('没能从文件里读出图片')
        return
      }

      setImage(bitmap)
      patch({
        name: file.name.replace(/\.(png|zip)$/i, ''),
        baseLoc: suggestBaseLoc(bitmap, meta.rows, meta.cols),
      })
    } catch (cause) {
      setError(`读取失败：${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  const save = (): void => {
    if (!image || !validation.ok) return
    const id = `f${Date.now().toString(36)}`
    try {
      add({ id, meta, image: image.dataUrl, createdAt: Date.now() })
      useFloatingStore.getState().close(CUSTOM_FURNI_IMPORT_WINDOW_ID)
      setImage(null)
      setMeta(DEFAULT_CUSTOM_META)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  if (!open) return null

  return (
    <FloatingWindow
      id={CUSTOM_FURNI_IMPORT_WINDOW_ID}
      title="导入自定义家具"
      width={420}
      defaultPosition={{ x: 380, y: 120 }}
    >
      <div className="flex flex-col gap-2 p-2">
        <ButtonRoot size="sm" variant="outline" onPress={() => void pickFile()}>
          {image ? '重新选择图片' : '选择 PNG / ZIP'}
        </ButtonRoot>

        {image ? (
          <Preview meta={meta} dataUrl={image.dataUrl} width={image.width} height={image.height} />
        ) : (
          <p className="text-[11px] text-pkt-text-mute">
            单张 PNG 即可（2:1 菱形网格）；ZIP 会取其中的 `_3_01` 帧。
          </p>
        )}

        <Field label="名称">
          <InputRoot
            value={meta.name}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              patch({ name: event.target.value })
            }
          />
        </Field>

        <div className="flex gap-2">
          <Field label="行（Y）" className="flex-1">
            <InputRoot
              value={String(meta.rows)}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                patch({ rows: clampInt(event.target.value, 1, 12) })
              }
            />
          </Field>
          <Field label="列（X）" className="flex-1">
            <InputRoot
              value={String(meta.cols)}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                patch({ cols: clampInt(event.target.value, 1, 12) })
              }
            />
          </Field>
          <Field label="锚点" className="flex-[1.4]">
            <InputRoot
              value={meta.baseLoc}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                patch({ baseLoc: event.target.value })
              }
            />
          </Field>
        </div>

        <Field label="朝向">
          <div className="flex gap-1">
            {([1, 2, 4] as const).map((value) => (
              <ButtonRoot
                key={value}
                size="sm"
                variant={meta.dirable === value ? 'secondary' : 'ghost'}
                onPress={() => patch({ dirable: value })}
              >
                {value} 向
              </ButtonRoot>
            ))}
            <ButtonRoot
              size="sm"
              variant={meta.symetric ? 'secondary' : 'ghost'}
              onPress={() => patch({ symetric: !meta.symetric })}
            >
              左右对称
            </ButtonRoot>
          </div>
        </Field>

        <Field label="类型">
          <div className="flex flex-wrap gap-1">
            {(
              [
                [1, '地面'],
                [2, '地毯'],
                [5, '靠墙'],
              ] as const
            ).map(([value, label]) => (
              <ButtonRoot
                key={value}
                size="sm"
                variant={meta.position === value ? 'secondary' : 'ghost'}
                onPress={() => patch({ position: value })}
              >
                {label}
              </ButtonRoot>
            ))}
          </div>
        </Field>

        <Field label="交互">
          <div className="flex flex-wrap gap-1">
            {(
              [
                ['none', '仅装饰'],
                ['toggle', '开/关'],
                ['sit', '可坐'],
                ['lie', '可躺'],
              ] as const
            ).map(([value, label]) => (
              <ButtonRoot
                key={value}
                size="sm"
                variant={meta.interact === value ? 'secondary' : 'ghost'}
                onPress={() => patch({ interact: value })}
              >
                {label}
              </ButtonRoot>
            ))}
          </div>
        </Field>

        {validation.errors.length > 0 ? (
          <ul className="rounded-pkt border border-pkt-danger/40 bg-pkt-danger/10 p-1.5 text-[10px] text-pkt-danger">
            {validation.errors.map((message) => (
              <li key={message}>· {message}</li>
            ))}
          </ul>
        ) : null}
        {validation.warnings.length > 0 ? (
          <ul className="rounded-pkt border border-pkt-warn/40 bg-pkt-warn/10 p-1.5 text-[10px] text-pkt-warn">
            {validation.warnings.map((message) => (
              <li key={message}>· {message}</li>
            ))}
          </ul>
        ) : null}
        {error ? <p className="text-[10px] text-pkt-danger">{error}</p> : null}

        <ButtonRoot size="sm" onPress={save} isDisabled={!image || !validation.ok}>
          保存到家具库
        </ButtonRoot>
      </div>
    </FloatingWindow>
  )
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}): React.ReactElement {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-[10px] text-pkt-text-mute">{label}</span>
      {children}
    </label>
  )
}

/** 网格预览：画占格菱形 + 图片按锚点摆放，检查锚点是否压在地面上。 */
function Preview({
  meta,
  dataUrl,
  width,
  height,
}: {
  meta: CustomFurniMeta
  dataUrl: string
  width: number
  height: number
}): React.ReactElement {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const [baseX, baseY] = meta.baseLoc.split(/\s+/).map(Number)
    const span = meta.rows + meta.cols
    const pad = 24
    const w = span * 10 + pad * 2 + width
    const h = span * 5 + pad * 2 + height
    canvas.width = w
    canvas.height = h
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, w, h)

    // 占格菱形
    ctx.strokeStyle = 'rgba(120,200,255,0.6)'
    ctx.lineWidth = 1
    for (let y = 0; y < meta.rows; y += 1) {
      for (let x = 0; x < meta.cols; x += 1) {
        const cx = pad + (x - y) * 10 + span * 10
        const cy = pad + (x + y) * 5
        ctx.beginPath()
        ctx.moveTo(cx + TILE_WIDTH / 2, cy)
        ctx.lineTo(cx + TILE_WIDTH, cy + TILE_HEIGHT / 2)
        ctx.lineTo(cx + TILE_WIDTH / 2, cy + TILE_HEIGHT)
        ctx.lineTo(cx, cy + TILE_HEIGHT / 2)
        ctx.closePath()
        ctx.stroke()
      }
    }

    const img = new Image()
    img.onload = () => {
      ctx.imageSmoothingEnabled = false
      const anchorX = pad + span * 10
      const anchorY = pad
      ctx.drawImage(
        img,
        Math.round(anchorX - (baseX || 0) + 20),
        Math.round(anchorY - (baseY || 0)),
      )
    }
    img.src = dataUrl
  }, [meta, dataUrl, width, height])

  return <canvas ref={canvasRef} className="mx-auto block bg-pkt-bg" />
}

/** PNG 直接解；ZIP 取 `<code>_3_01`（没有就取第一个非图标符号）。 */
async function loadFirstImage(
  bytes: Uint8Array,
  fileName: string,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  const { openBundle, readSymbolImage } = await import('@engine/index')

  let image = null
  if (fileName.toLowerCase().endsWith('.zip')) {
    const bundle = openBundle(bytes)
    const names = [...bundle.symbols.keys()]
    const preferred =
      names.find((name) => /_3_01$/i.test(name)) ??
      names.find((name) => !/s$/i.test(name)) ??
      names[0]
    image = preferred ? readSymbolImage(bundle, preferred) : null
  } else {
    image = decodePng(bytes)
  }
  if (!image) return null

  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  canvas
    .getContext('2d')
    ?.putImageData(
      new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
      0,
      0,
    )

  return { dataUrl: canvas.toDataURL('image/png'), width: image.width, height: image.height }
}

function clampInt(raw: string, min: number, max: number): number {
  const value = Number(raw.replace(/[^0-9-]/g, ''))
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}
