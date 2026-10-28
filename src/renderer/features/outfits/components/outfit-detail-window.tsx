import { ButtonRoot } from '@heroui/react'
import * as React from 'react'

import type { CatalogItem, Part } from '@shared/contract'
import { cn } from '@ui/cn'
import { FloatingWindow } from '@ui/floating'
import { useCustomStore, type CustomAsset } from '../state/custom-store'
import { PART_LABELS, PART_ORDER } from '../state/outfit-store'
import { Section } from './section'

export const OUTFIT_DETAIL_WINDOW_ID = 'outfit-detail'

export type WornCustomAsset = Pick<
  CustomAsset,
  'id' | 'part' | 'dataUrl' | 'dynamic' | 'animateDataUrl' | 'frameCount'
>

export interface OutfitDetailWindowProps {
  worn: Partial<Record<Part, CatalogItem>>
  customAssets: CustomAsset[]
  customWorn: WornCustomAsset[]
  onToggleCustom: (asset: CustomAsset) => void
  onUnequip: (part: Part) => void
  onClear: () => void
}

/**
 * 「衣柜」二级菜单：只处理穿在身上的东西。
 *
 * 存档、表情、画面/导出都在各自的二级菜单里。
 */
export function OutfitDetailWindow({
  worn,
  customAssets,
  customWorn,
  onToggleCustom,
  onUnequip,
  onClear,
}: OutfitDetailWindowProps): React.ReactElement | null {
  const wornList = React.useMemo(
    () =>
      PART_ORDER.map((part) => ({ part, item: worn[part] })).filter(
        (entry): entry is { part: Part; item: CatalogItem } => Boolean(entry.item),
      ),
    [worn],
  )

  return (
    <FloatingWindow
      id={OUTFIT_DETAIL_WINDOW_ID}
      title="衣柜"
      width={400}
      defaultPosition={{ x: 200, y: 96 }}
    >
      <div className="flex flex-col gap-2 p-2.5">
        <Section
          title="已穿戴"
          count={wornList.length}
          actions={
            <ButtonRoot
              size="sm"
              variant="ghost"
              isDisabled={wornList.length === 0}
              onPress={onClear}
            >
              清空
            </ButtonRoot>
          }
        >
          {wornList.length === 0 ? (
            <EmptyHint>还没有穿戴任何物品</EmptyHint>
          ) : (
            <div className="pkt-scroll flex max-h-[300px] min-h-0 flex-col gap-0.5 overflow-y-auto pr-0.5">
              {wornList.map(({ part, item }) => (
                <button
                  key={part}
                  type="button"
                  onClick={() => onUnequip(part)}
                  className="group flex w-full items-center gap-2 rounded-pkt px-2 py-1.5 text-left transition-colors hover:bg-pkt-panel-hover"
                >
                  <span className="w-9 shrink-0 text-[10px] text-pkt-text-mute">
                    {PART_LABELS[part]}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px]">{item.name}</span>
                  <span className="shrink-0 text-[10px] text-pkt-text-mute opacity-0 transition-opacity group-hover:opacity-100">
                    移除
                  </span>
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section title="自建素材" count={customAssets.length}>
          <ImportAssetControls />
          {customAssets.length === 0 ? (
            <EmptyHint>静态素材选 700×840 官方 sheet；动态素材再同时选 100×150 帧条</EmptyHint>
          ) : (
            <div className="flex flex-wrap gap-1">
              {customAssets.map((asset) => (
                <ToggleChip
                  key={asset.id}
                  title={asset.name}
                  active={customWorn.some((entry) => entry.id === asset.id)}
                  onClick={() => onToggleCustom(asset)}
                >
                  {asset.dynamic ? `动 · ${asset.name}` : asset.name}
                </ToggleChip>
              ))}
            </div>
          )}
        </Section>
      </div>
    </FloatingWindow>
  )
}

function EmptyHint({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <p className="rounded-pkt border border-dashed border-pkt-border/80 px-3 py-3 text-center text-[11px] leading-relaxed text-pkt-text-mute">
      {children}
    </p>
  )
}

function ToggleChip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'max-w-[132px] truncate rounded-full border px-2 py-0.5 text-[11px] transition-colors',
        active
          ? 'border-pkt-accent bg-pkt-accent/15 text-pkt-accent'
          : 'border-pkt-border text-pkt-text-mute hover:border-pkt-border-strong hover:text-pkt-text',
      )}
    >
      {children}
    </button>
  )
}

/** 导入自建素材：部位 + 静态 sheet；动态素材再同时选 100×150 帧条。 */
function ImportAssetControls(): React.ReactElement {
  const add = useCustomStore((state) => state.add)
  const [part, setPart] = React.useState<Part>('hats')
  const [dynamic, setDynamic] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  const onPick = async (fileList: FileList | null): Promise<void> => {
    const files = Array.from(fileList ?? [])
    if (files.length === 0) return
    try {
      const parsed = await Promise.all(files.map(readPngFile))
      const sheet = parsed.find((file) => file.width === 700 && file.height === 840)
      const animate = parsed.find(
        (file) => file.height === 150 && file.width >= 100 && file.width % 100 === 0,
      )
      if (!sheet) {
        setMessage('静态素材必须是 700×840 官方 sheet')
        return
      }
      if (dynamic && !animate) {
        setMessage('动态素材还需要同时选择 100×150 帧条')
        return
      }

      const hasAnimation = dynamic && Boolean(animate)
      add({
        id: `custom-${Date.now().toString(36)}`,
        name: sheet.name.replace(/\.png$/i, '').slice(0, 12) || '自建',
        part,
        dataUrl: sheet.dataUrl,
        dynamic: hasAnimation,
        animateDataUrl: hasAnimation ? animate?.dataUrl : undefined,
        frameCount:
          hasAnimation && animate ? Math.max(1, Math.min(8, Math.floor(animate.width / 100))) : 1,
      })
      setMessage(null)
    } catch (error) {
      console.warn('[outfits] 自建素材读取失败', error)
      setMessage('无法读取 PNG，请重新选择')
    }
  }

  return (
    <div className="mb-2 flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={part}
          onChange={(event) => setPart(event.target.value as Part)}
          className="h-6 rounded-md border border-pkt-border bg-pkt-panel px-1 text-[10px] text-pkt-text"
        >
          {PART_ORDER.map((value) => (
            <option key={value} value={value}>
              {PART_LABELS[value]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-[10px] text-pkt-text-mute">
          <input
            type="checkbox"
            checked={dynamic}
            onChange={(event) => {
              setDynamic(event.target.checked)
              setMessage(null)
            }}
            className="size-3 accent-[var(--pkt-accent)]"
          />
          动态
        </label>
        <ButtonRoot size="sm" variant="tertiary" onPress={() => inputRef.current?.click()}>
          选择素材
        </ButtonRoot>
        <input
          ref={inputRef}
          type="file"
          accept="image/png"
          multiple={dynamic}
          className="hidden"
          onChange={(event) => {
            void onPick(event.target.files)
            event.target.value = ''
          }}
        />
      </div>
      {message ? (
        <p className="text-[10px] text-pkt-warn">{message}</p>
      ) : (
        <p className="text-[10px] text-pkt-text-mute">静态 700×840；动态再同时选 100×150 帧条</p>
      )}
    </div>
  )
}

async function readPngFile(
  file: File,
): Promise<{ name: string; dataUrl: string; width: number; height: number }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  const image = new Image()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('无法读取 PNG'))
    image.src = dataUrl
  })
  return { name: file.name, dataUrl, width: image.naturalWidth, height: image.naturalHeight }
}
