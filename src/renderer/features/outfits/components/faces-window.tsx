import * as React from 'react'

import type { CatalogAssets, CatalogFace } from '@shared/contract'
import { cn } from '@ui/cn'
import { FloatingWindow } from '@ui/floating'
import { getDefaultFaceMiniUrl, getFaceMiniUrl } from '@/services/assets'
import { useOutfitStore } from '../state/outfit-store'
import { Section } from './section'

export const OUTFIT_FACES_WINDOW_ID = 'outfit-faces'

/** 表情二级菜单：每个表情显示游戏里的实际小头图。 */
export function FacesWindow({
  assets,
  faces,
}: {
  assets: CatalogAssets
  faces: CatalogFace[]
}): React.ReactElement {
  const faceCode = useOutfitStore((state) => state.faceCode)
  const setFace = useOutfitStore((state) => state.setFace)

  return (
    <FloatingWindow
      id={OUTFIT_FACES_WINDOW_ID}
      title="表情"
      width={380}
      defaultPosition={{ x: 240, y: 130 }}
    >
      <div className="p-2.5">
        <Section title="表情" count={faces.length}>
          <div className="pkt-scroll grid max-h-[56vh] grid-cols-5 gap-1 overflow-y-auto pr-0.5">
            <DefaultFaceOption
              assets={assets}
              active={faceCode === null}
              onClick={() => setFace(null)}
            />
            {faces.map((face) => (
              <FaceOption
                key={face.code}
                face={face}
                active={faceCode === face.code}
                onClick={() => setFace(face.code)}
              />
            ))}
          </div>
        </Section>
      </div>
    </FloatingWindow>
  )
}

function DefaultFaceOption({
  assets,
  active,
  onClick,
}: {
  assets: CatalogAssets
  active: boolean
  onClick: () => void
}): React.ReactElement {
  const [url, setUrl] = React.useState<string | null>(null)

  React.useEffect(() => {
    let alive = true
    void getDefaultFaceMiniUrl(assets)
      .then((next) => {
        if (alive) setUrl(next)
      })
      .catch((error: unknown) => console.warn('[outfits] 默认表情预览加载失败', error))
    return () => {
      alive = false
    }
  }, [assets])

  return <FaceTile name="默认" url={url} active={active} onClick={onClick} />
}

function FaceOption({
  face,
  active,
  onClick,
}: {
  face: CatalogFace
  active: boolean
  onClick: () => void
}): React.ReactElement {
  const [url, setUrl] = React.useState<string | null>(null)

  React.useEffect(() => {
    let alive = true
    void getFaceMiniUrl(face)
      .then((next) => {
        if (alive) setUrl(next)
      })
      .catch((error: unknown) => console.warn('[outfits] 表情预览加载失败', face.code, error))
    return () => {
      alive = false
    }
  }, [face])

  return <FaceTile name={face.name} url={url} active={active} onClick={onClick} />
}

function FaceTile({
  name,
  url,
  active,
  onClick,
}: {
  name: string
  url: string | null
  active: boolean
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      title={name}
      className={cn(
        'flex min-w-0 flex-col items-center gap-0.5 rounded-pkt border px-0.5 py-1 transition-colors',
        active
          ? 'border-pkt-accent bg-pkt-accent/15 text-pkt-accent'
          : 'border-pkt-border/70 text-pkt-text-mute hover:border-pkt-border-strong hover:bg-pkt-panel-hover',
      )}
    >
      <span className="grid h-[44px] w-[40px] place-items-center">
        {url ? (
          <img src={url} alt="" className="pkt-pixelated h-[44px] w-[40px] object-contain" />
        ) : (
          <span className="size-3 animate-pulse rounded-sm bg-pkt-panel-active" />
        )}
      </span>
      <span className="w-full truncate text-center text-[9px] leading-tight">{name}</span>
    </button>
  )
}
