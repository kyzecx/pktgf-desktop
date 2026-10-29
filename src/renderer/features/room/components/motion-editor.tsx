import * as React from 'react'
import { ButtonRoot, InputRoot } from '@heroui/react'

import type { Catalog, RoomDirection } from '@shared/contract'
import {
  ARM_FRAMES,
  LEG_FRAMES,
  clipDuration,
  clipsFromCatalog,
  composeRoomActor,
  evaluateClip,
  lieClip,
  sitClip,
  standClip,
  walkClip,
  type MotionClip,
  type MotionStep,
} from '@engine/room'
import { FloatingWindow } from '@ui/floating'
import { cn } from '@ui/cn'

import { clipToJson, cloneAsCustom, useCustomClipStore } from '../state/custom-clip-store'
import { loadActorFrameThumb, loadPlayerActorAssets } from '../services'
import { MOTION_EDITOR_WINDOW_ID } from '../windows'

/**
 * 动作编辑器。
 *
 * 左侧选动作（官方 255 组只读 + 自定义可编辑），右侧时间轴改步骤：
 * 每步可以设时长、手臂/腿帧（用**真实帧图**选）、头/表情帧、朝向、像素偏移。
 * 自动循环预演，支持 JSON 导入导出。
 */

const PREVIEW_SIZE = 4

export function MotionEditor({
  catalog,
  actorOutfit,
}: {
  catalog: Catalog | null
  /** 用房间里选中的角色做预览，没有就用默认形象 */
  actorOutfit: { sex: 1 | 2; faceCode: string | null; worn: Record<string, string> } | null
}): React.ReactElement | null {
  const customClips = useCustomClipStore((state) => state.clips)
  const put = useCustomClipStore((state) => state.put)
  const remove = useCustomClipStore((state) => state.remove)
  const importJson = useCustomClipStore((state) => state.importJson)

  const builtins = React.useMemo(() => {
    const map = clipsFromCatalog(catalog?.actorMotions)
    for (const preset of [standClip(), walkClip(), sitClip(), lieClip()]) {
      if (!map.has(preset.id)) map.set(preset.id, preset)
    }
    return [...map.values()].sort((a, b) => a.id.localeCompare(b.id))
  }, [catalog])

  const [selectedId, setSelectedId] = React.useState<string>('walk')
  const [query, setQuery] = React.useState('')
  const [stepIndex, setStepIndex] = React.useState(0)
  const [time, setTime] = React.useState(0)
  const [playing, setPlaying] = React.useState(true)
  const [status, setStatus] = React.useState<string | null>(null)

  const clip = React.useMemo(() => {
    const custom = customClips.find((item) => item.id === selectedId)
    if (custom) return custom
    return builtins.find((item) => item.id === selectedId) ?? builtins[0] ?? null
  }, [builtins, customClips, selectedId])

  const isCustom = Boolean(customClips.find((item) => item.id === selectedId))
  const filteredBuiltins = React.useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return builtins.slice(0, 80)
    return builtins.filter((item) => item.id.includes(keyword)).slice(0, 80)
  }, [builtins, query])

  // 播放头
  React.useEffect(() => {
    if (!clip || !playing) return
    let raf = 0
    const start = performance.now()
    const total = Math.max(1, clipDuration(clip))
    const tick = (now: number): void => {
      const elapsed = (now - start) % total
      setTime(elapsed)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
    }
  }, [clip, playing])

  React.useEffect(() => {
    setStepIndex(0)
  }, [selectedId])

  const patchClip = (patch: Partial<MotionClip>): void => {
    if (!clip || !isCustom) return
    put({ ...clip, ...patch })
  }

  const patchStep = (index: number, patch: Partial<MotionStep>): void => {
    if (!clip || !isCustom) return
    put({
      ...clip,
      steps: clip.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    })
  }

  if (!clip) return null

  return (
    <FloatingWindow
      id={MOTION_EDITOR_WINDOW_ID}
      title="动作编辑器"
      width={560}
      defaultPosition={{ x: 420, y: 120 }}
    >
      <div className="flex h-[62vh] flex-col gap-2 p-2">
        <div className="flex min-h-0 flex-1 gap-2">
          {/* 左：动作列表 */}
          <div className="flex w-40 shrink-0 flex-col gap-1">
            <InputRoot
              value={query}
              placeholder="搜索官方动作"
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setQuery(event.target.value)
              }
            />
            <div className="pkt-scroll min-h-0 flex-1 overflow-y-auto rounded-pkt border border-pkt-border p-1">
              {customClips.length > 0 ? (
                <>
                  <p className="px-1 pb-1 text-[9px] text-pkt-text-mute">自定义</p>
                  {customClips.map((item) => (
                    <ClipRow
                      key={item.id}
                      label={item.name}
                      active={item.id === selectedId}
                      onSelect={() => setSelectedId(item.id)}
                      onRemove={() => remove(item.id)}
                    />
                  ))}
                </>
              ) : null}
              <p className="px-1 pb-1 text-[9px] text-pkt-text-mute">官方</p>
              {filteredBuiltins.map((item) => (
                <ClipRow
                  key={item.id}
                  label={item.name}
                  active={item.id === selectedId}
                  onSelect={() => setSelectedId(item.id)}
                />
              ))}
            </div>
          </div>

          {/* 右：预览 + 时间轴 */}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-start gap-2">
              <ActorPreview catalog={catalog} outfit={actorOutfit} clip={clip} time={time} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="truncate text-[11px] font-medium">{clip.name}</p>
                <p className="text-[10px] text-pkt-text-mute">
                  {clip.steps.length} 步 · 总长 {clipDuration(clip)}ms ·{' '}
                  {clip.loop ? '循环' : '单次'}
                  {isCustom ? ' · 可编辑' : ' · 只读'}
                </p>
                <div className="flex flex-wrap gap-1">
                  <ButtonRoot
                    size="sm"
                    variant="ghost"
                    onPress={() => setPlaying((value) => !value)}
                  >
                    {playing ? '暂停' : '播放'}
                  </ButtonRoot>
                  {isCustom ? (
                    <>
                      <ButtonRoot
                        size="sm"
                        variant="ghost"
                        onPress={() => patchClip({ loop: !clip.loop })}
                      >
                        {clip.loop ? '改单次' : '改循环'}
                      </ButtonRoot>
                      <ButtonRoot
                        size="sm"
                        variant="ghost"
                        onPress={() => {
                          const next = [...clip.steps]
                          next.splice(stepIndex + 1, 0, { ...clip.steps[stepIndex] })
                          patchClip({ steps: next })
                          setStepIndex(stepIndex + 1)
                        }}
                      >
                        插入步骤
                      </ButtonRoot>
                      <ButtonRoot
                        size="sm"
                        variant="ghost"
                        isDisabled={clip.steps.length <= 1}
                        onPress={() => {
                          patchClip({ steps: clip.steps.filter((_, i) => i !== stepIndex) })
                          setStepIndex(Math.max(0, stepIndex - 1))
                        }}
                      >
                        删除步骤
                      </ButtonRoot>
                    </>
                  ) : (
                    <ButtonRoot
                      size="sm"
                      variant="outline"
                      onPress={() => {
                        const copy = cloneAsCustom(clip)
                        put(copy)
                        setSelectedId(copy.id)
                      }}
                    >
                      复制为自定义
                    </ButtonRoot>
                  )}
                </div>
              </div>
            </div>

            <Timeline
              clip={clip}
              time={time}
              stepIndex={stepIndex}
              onSeek={(value) => {
                setPlaying(false)
                setTime(value)
                const step = stepAt(clip, value)
                setStepIndex(step)
              }}
              onPickStep={(index) => {
                setPlaying(false)
                setStepIndex(index)
                setTime(stepStart(clip, index))
              }}
            />

            <StepEditor
              catalog={catalog}
              step={clip.steps[stepIndex]}
              index={stepIndex}
              editable={isCustom}
              onChange={(patch) => patchStep(stepIndex, patch)}
            />

            <div className="flex flex-wrap items-center gap-1">
              <ButtonRoot
                size="sm"
                variant="ghost"
                onPress={() => {
                  const json = clipToJson(clip)
                  void window.pkt.saveFile({
                    useExportDir: true,
                    suggestedName: `${clip.name}.motion.json`,
                    dataBase64: btoa(unescape(encodeURIComponent(json))),
                  })
                }}
              >
                导出 JSON
              </ButtonRoot>
              <ButtonRoot
                size="sm"
                variant="ghost"
                onPress={() => {
                  void (async () => {
                    const file = await window.pkt.openFile({
                      filters: [{ name: '动作', extensions: ['json'] }],
                    })
                    if (!file) return
                    const raw = decodeURIComponent(escape(atob(file.base64)))
                    const result = importJson(raw)
                    setStatus(result.error ?? `已导入 ${result.added} 个动作`)
                  })()
                }}
              >
                导入 JSON
              </ButtonRoot>
              {status ? <span className="text-[10px] text-pkt-text-mute">{status}</span> : null}
            </div>
          </div>
        </div>
      </div>
    </FloatingWindow>
  )
}

function ClipRow({
  label,
  active,
  onSelect,
  onRemove,
}: {
  label: string
  active: boolean
  onSelect: () => void
  onRemove?: () => void
}): React.ReactElement {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'min-w-0 flex-1 truncate rounded-pkt px-1.5 py-0.5 text-left text-[11px]',
          active ? 'bg-pkt-panel-active text-pkt-text' : 'text-pkt-text-dim hover:bg-pkt-panel',
        )}
      >
        {label}
      </button>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 px-1 text-[10px] text-pkt-text-mute hover:text-pkt-danger"
        >
          ×
        </button>
      ) : null}
    </div>
  )
}

/** 时间轴：每步一个块，宽度按时长。 */
function Timeline({
  clip,
  time,
  stepIndex,
  onSeek,
  onPickStep,
}: {
  clip: MotionClip
  time: number
  stepIndex: number
  onSeek: (value: number) => void
  onPickStep: (index: number) => void
}): React.ReactElement {
  const total = Math.max(1, clipDuration(clip))
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-6 w-full gap-0.5">
        {clip.steps.map((step, index) => {
          const duration = step.duration ?? 200
          return (
            <button
              key={index}
              type="button"
              onClick={() => onPickStep(index)}
              style={{ width: `${(duration / total) * 100}%` }}
              className={cn(
                'relative h-full overflow-hidden rounded-sm border text-[9px]',
                index === stepIndex
                  ? 'border-pkt-accent bg-pkt-accent/25 text-pkt-text'
                  : 'border-pkt-border bg-pkt-panel text-pkt-text-mute',
              )}
              title={`第 ${index + 1} 步 · ${duration}ms`}
            >
              {index + 1}
            </button>
          )
        })}
      </div>
      <input
        type="range"
        min={0}
        max={total - 1}
        value={Math.round(time)}
        onChange={(event) => onSeek(Number(event.target.value))}
        className="w-full"
      />
    </div>
  )
}

/** 单步参数编辑。 */
function StepEditor({
  catalog,
  step,
  index,
  editable,
  onChange,
}: {
  catalog: Catalog | null
  step: MotionStep | undefined
  index: number
  editable: boolean
  onChange: (patch: Partial<MotionStep>) => void
}): React.ReactElement {
  if (!step) return <p className="text-[10px] text-pkt-text-mute">没有步骤</p>

  const dir = 3 as RoomDirection
  const offset = String(step.offset ?? '')

  return (
    <div className="flex flex-col gap-1.5 rounded-pkt border border-pkt-border p-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-pkt-text-mute">第 {index + 1} 步</span>
        <label className="flex items-center gap-1 text-[10px]">
          时长
          <InputRoot
            className="w-16"
            value={String(step.duration ?? 200)}
            disabled={!editable}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              onChange({ duration: Math.max(16, Number(event.target.value) || 200) })
            }
          />
          ms
        </label>
        <label className="flex items-center gap-1 text-[10px]">
          偏移
          <InputRoot
            className="w-20"
            value={offset}
            disabled={!editable}
            placeholder="0,0"
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              onChange({ offset: event.target.value })
            }
          />
        </label>
        <label className="flex items-center gap-1 text-[10px]">
          朝向
          <select
            value={String(step.facing ?? '')}
            disabled={!editable}
            onChange={(event) =>
              onChange({
                facing: event.target.value
                  ? (Number(event.target.value) as RoomDirection)
                  : undefined,
              })
            }
            className="rounded-pkt border border-pkt-border bg-pkt-panel px-1 py-0.5 text-[10px]"
          >
            <option value="">不变</option>
            {[1, 3, 5, 7].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      <FrameStrip
        catalog={catalog}
        label="手臂"
        part="arm"
        count={ARM_FRAMES}
        dir={dir}
        value={step.arms ?? 0}
        disabled={!editable}
        onPick={(value) => onChange({ arms: value })}
      />
      <FrameStrip
        catalog={catalog}
        label="腿"
        part="leg"
        count={LEG_FRAMES}
        dir={dir}
        value={step.legs ?? 0}
        disabled={!editable}
        onPick={(value) => onChange({ legs: value })}
      />
    </div>
  )
}

/** 帧选择条：横向滚动，用真实帧图。 */
function FrameStrip({
  catalog,
  label,
  part,
  count,
  dir,
  value,
  disabled,
  onPick,
}: {
  catalog: Catalog | null
  label: string
  part: 'arm' | 'leg'
  count: number
  dir: RoomDirection
  value: number
  disabled: boolean
  onPick: (value: number) => void
}): React.ReactElement {
  const [thumbs, setThumbs] = React.useState<Array<string | null>>([])

  React.useEffect(() => {
    if (!catalog?.assets) return
    let cancelled = false
    void Promise.all(
      Array.from({ length: count }, (_, index) =>
        loadActorFrameThumb(catalog.assets, part, dir, index),
      ),
    ).then((list) => {
      if (!cancelled) setThumbs(list)
    })
    return () => {
      cancelled = true
    }
  }, [catalog, part, count, dir])

  return (
    <div className="flex items-center gap-1">
      <span className="w-8 shrink-0 text-[10px] text-pkt-text-mute">{label}</span>
      <div className="pkt-scroll flex min-w-0 flex-1 gap-0.5 overflow-x-auto">
        {Array.from({ length: count }, (_, index) => (
          <button
            key={index}
            type="button"
            disabled={disabled}
            onClick={() => onPick(index)}
            title={`帧 ${index}`}
            className={cn(
              'grid size-8 shrink-0 place-items-center rounded-sm border',
              index === value
                ? 'border-pkt-accent bg-pkt-accent/20'
                : 'border-pkt-border bg-pkt-panel/60 hover:border-pkt-border-strong',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            {thumbs[index] ? (
              <img
                src={thumbs[index]!}
                alt=""
                className="max-h-7 max-w-7"
                style={{ imageRendering: 'pixelated' }}
                draggable={false}
              />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  )
}

/** 预览：按当前时间合成一帧角色。 */
function ActorPreview({
  catalog,
  outfit,
  clip,
  time,
}: {
  catalog: Catalog | null
  outfit: { sex: 1 | 2; faceCode: string | null; worn: Record<string, string> } | null
  clip: MotionClip
  time: number
}): React.ReactElement {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const [assets, setAssets] = React.useState<Awaited<
    ReturnType<typeof loadPlayerActorAssets>
  > | null>(null)

  React.useEffect(() => {
    if (!catalog?.assets) return
    let cancelled = false
    void loadPlayerActorAssets({
      catalog,
      assets: catalog.assets,
      outfit: outfit ?? { sex: 2, faceCode: null, worn: {} },
    })
      .then((value) => {
        if (!cancelled) setAssets(value)
      })
      .catch(() => {
        if (!cancelled) setAssets(null)
      })
    return () => {
      cancelled = true
    }
  }, [catalog, outfit])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !assets) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const sample = evaluateClip(clip, time, 3)
    const image = composeRoomActor({
      sheet: assets.sheet,
      pose: { dir: 3, arms: sample.arms, legs: sample.legs, hairFrame: sample.hairFrame },
      worn: assets.worn,
      face: assets.face,
    })
    canvas.width = image.width
    canvas.height = image.height
    ctx.imageSmoothingEnabled = false
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
      0,
      0,
    )
  }, [assets, clip, time])

  return (
    <canvas
      ref={canvasRef}
      className="shrink-0 rounded-pkt border border-pkt-border bg-pkt-bg"
      style={{
        width: 40 * PREVIEW_SIZE,
        height: 60 * PREVIEW_SIZE,
        imageRendering: 'pixelated',
      }}
    />
  )
}

/** 时间 → 属于第几步。 */
function stepAt(clip: MotionClip, time: number): number {
  let cursor = 0
  for (let i = 0; i < clip.steps.length; i += 1) {
    const duration = clip.steps[i]!.duration ?? 200
    if (time < cursor + duration) return i
    cursor += duration
  }
  return Math.max(0, clip.steps.length - 1)
}

/** 第几步的起始时间。 */
function stepStart(clip: MotionClip, index: number): number {
  return clip.steps.slice(0, index).reduce((sum, step) => sum + (step.duration ?? 200), 0)
}
