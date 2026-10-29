import * as React from 'react'

import type { Catalog, CatalogFurniture, CatalogRoomDef } from '@shared/contract'
import {
  RoomModel,
  clipsFromCatalog,
  roomBoxSize,
  composeRoomActor,
  evaluateClip,
  evaluateNpcMotion,
  findPath,
  footprint,
  furniDims,
  furniOrigin,
  normalizeRect,
  selectInRect,
  pixelToCell,
  lieClip,
  sitClip,
  standClip,
  walkClip,
  type ActorInstance,
  type FurniInstance,
  type MotionClip,
  type RoomLayout,
} from '@engine/room'

import {
  actorArtFromImage,
  furniArtKey,
  furniFrameOf,
  loadCustomActorArt,
  loadFurniArt,
  loadNpcArt,
  loadPlayerActorAssets,
  type ActorArt,
  type DecoAssets,
  type FurniArt,
} from '../services'
import {
  LIE_ANCHORS,
  SIT_ANCHORS,
  STAND_ANCHORS,
  actorOrigin,
  buildDrawList,
  drawActor,
  drawFootprint,
  drawMarquee,
  drawFurni,
  drawGrid,
  drawPlacementGhost,
  drawFurniLight,
  drawFurniMask,
  drawStatic,
  drawWallHighlight,
  drawWallSlot,
  orderScene,
  wallSegmentsAt,
} from './canvas-draw'
import { buildWallPanels } from './wall-panels'
import { useCustomClipStore } from '../state/custom-clip-store'
import {
  customActorFrameIndex,
  useCustomActorStore,
  type CustomActor,
} from '../state/custom-actor-store'

/**
 * 房间画布：静态层（地板/墙/门）+ 家具动态层 + 交互。
 *
 * 家具绘制顺序完全交给 `SortMgr2D`（官方算法），这里只负责「按顺序 drawImage」。
 */

/** 让页面可以命令某个角色按给定路径行走。 */
export interface WalkCommand {
  uid: string
  path: Array<{ cell: { x: number; y: number }; dir: 1 | 3 | 5 | 7 }>
  /** 每次命令 +1，避免相同路径不触发 */
  seq: number
}

export interface CanvasSceneState {
  furni: FurniInstance[]
  actors: ActorInstance[]
  selected: string | null
  /** 多选（含主选中） */
  selection: string[]
  selectedActor: string | null
  picking: CatalogFurniture | null
}

export interface RoomCanvasProps {
  catalog: Catalog
  room: CatalogRoomDef
  model: RoomModel
  layout: RoomLayout
  stage: { width: number; height: number }
  deco: Partial<DecoAssets>
  /** 整图房型：场景图 + 它在舞台上的位置 */
  sceneImage: { bitmap: ImageBitmap; x: number; y: number } | null
  scene: CanvasSceneState
  zoom: number
  showGrid: boolean
  onPlace: (cell: { x: number; y: number }) => void
  onPlaceWall: (cell: { x: number; y: number }) => void
  onSelect: (uid: string | null) => void
  /** Shift 点选：切换该家具的选中状态 */
  onToggleSelect: (uid: string) => void
  /** 多选整体平移（dx/dy 是格数） */
  onMoveMany: (dx: number, dy: number) => void
  /** 当前选中集合（多选拖动判定用） */
  selection: string[]
  /** 框选结果（一次选中多件） */
  onSelectMany: (uids: string[]) => void
  onMove: (uid: string, cell: { x: number; y: number }) => void
  onHover: (cell: { x: number; y: number } | null) => void
  onActorStep: (uid: string, cell: { x: number; y: number }, dir: 1 | 3 | 5 | 7) => void
  /** 拖拽落位：把角色直接放到某一格（跳过寻路） */
  onActorPlace: (uid: string, cell: { x: number; y: number }, dir: 1 | 3 | 5 | 7) => void
  onSelectActor: (uid: string) => void
  /** 点家具：让角色走过去交互 */
  onInteract?: (actorUid: string, furniUid: string) => void
  /** 角色走完一段路径 */
  onActorArrived?: (actorUid: string) => void
  /** 当前绘制顺序（自底向上）变了 —— 图层面板用 */
  onDrawOrder?: (uids: string[]) => void
  /** 视图变换变了（页面用它定位物品编辑浮层） */
  onViewChange?: (view: { scale: number; tx: number; ty: number }) => void
  walkCommand?: WalkCommand | null
}

export function RoomCanvas(props: RoomCanvasProps): React.ReactElement {
  const { catalog, room, model, layout, stage, deco, scene, zoom, showGrid, sceneImage } = props
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const [hover, setHover] = React.useState<{ x: number; y: number } | null>(null)
  /** 正在拖（按下并移动后才有值） */
  const [drag, setDrag] = React.useState<{
    uid: string
    /** 家具左上角相对抓取格子的偏移，移动时保持这个偏移 */
    offsetX: number
    offsetY: number
  } | null>(null)
  /** 角色拖拽：按住角色拖到别的格子直接落位 */
  const [actorDrag, setActorDrag] = React.useState<{
    uid: string
    from: { x: number; y: number }
    to: { x: number; y: number }
  } | null>(null)
  const actorPressRef = React.useRef<{ uid: string; from: { x: number; y: number } } | null>(null)

  /** 框选：按住 Shift 在空地上拖出矩形 */
  const [marquee, setMarquee] = React.useState<{
    from: { x: number; y: number }
    to: { x: number; y: number }
  } | null>(null)
  /** 拖动落点（格点，可能越界，合法性由 canPlace 判） */
  const [dragTarget, setDragTarget] = React.useState<{ x: number; y: number } | null>(null)
  /** 按下时的状态：只有真的移动了才开始拖 */
  const pressRef = React.useRef<{
    uid: string
    cell: { x: number; y: number }
    origin: { x: number; y: number }
  } | null>(null)
  const [walking, setWalking] = React.useState<{
    uid: string
    path: Array<{ cell: { x: number; y: number }; dir: 1 | 3 | 5 | 7 }>
    index: number
  } | null>(null)
  const [tick, setTick] = React.useState(0)
  /** 容器尺寸（CSS px），变化时重建画布缓冲 */
  const [viewport, setViewport] = React.useState({ width: 0, height: 0 })
  /** 当前视图变换：stage 逻辑坐标 → CSS 像素 */
  const viewRef = React.useRef({ scale: 1, tx: 0, ty: 0 })
  /** 视图回调放进 ref：进依赖会让 effect 每次渲染都跑，触发 setState 死循环 */
  const onViewChangeRef = React.useRef(props.onViewChange)
  onViewChangeRef.current = props.onViewChange
  /** 手动缩放倍数与平移（Ctrl+滚轮 / 触控板捏合 / 中键拖动） */
  const [viewZoom, setViewZoom] = React.useState(zoom)
  React.useEffect(() => {
    setViewZoom(zoom)
    setPan({ x: 0, y: 0 })
  }, [zoom])
  /** 自适应比例与几何信息，滚轮缩放要用它把指针锚住 */
  const fitRef = React.useRef({
    fitScale: 1,
    box: { width: 1, height: 1 },
    origin: { x: 0, y: 0 },
  })
  const [pan, setPan] = React.useState({ x: 0, y: 0 })
  const panDrag = React.useRef<{ pointerId: number; x: number; y: number } | null>(null)

  const arts = useFurniArts(catalog, scene.furni)
  const pickingArt = usePickingArt(catalog, scene.picking)

  // 角色动画：有人在走/有角色时按 140ms 推进一次腿部帧
  React.useEffect(() => {
    if (scene.actors.length === 0) return
    const timer = window.setInterval(() => setTick((value) => value + 1), 140)
    return () => window.clearInterval(timer)
  }, [scene.actors.length])

  // 外部下达的行走指令
  React.useEffect(() => {
    const command = props.walkCommand
    if (!command || command.path.length === 0) return
    setWalking({ uid: command.uid, path: command.path, index: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.walkCommand?.seq])

  const clipTime = tick * 140

  // 每个角色当前该画哪一帧：行走 / 指定动作 / NPC 帧
  const customClips = useCustomClipStore((state) => state.clips)
  const customActorList = useCustomActorStore((state) => state.items)
  const samples = React.useMemo(
    () =>
      sampleActorPoses({
        actorList: scene.actors,
        catalog,
        clipTime,
        walkingUid: walking?.uid ?? null,
        customClips,
        customActors: customActorList,
      }),
    [scene.actors, catalog, clipTime, walking?.uid, customClips, customActorList],
  )

  // 行走：每 220ms 走一格，走到终点清空
  React.useEffect(() => {
    if (!walking) return
    const timer = window.setInterval(() => {
      setWalking((current) => {
        if (!current) return null
        const step = current.path[current.index]
        if (!step) return null
        props.onActorStep(current.uid, step.cell, step.dir)
        const nextIndex = current.index + 1
        return nextIndex >= current.path.length ? null : { ...current, index: nextIndex }
      })
    }, 220)
    return () => window.clearInterval(timer)
  }, [walking, props])

  const actorArtMap = useActorArts(catalog, scene.actors, samples, customActorList)

  // 占用图：选中/拖拽中的家具不占位，避免自己挡自己
  const occupancy = React.useMemo(() => {
    const fresh = new RoomModel({ rows: model.rows, cols: model.cols, map: model.structure })
    for (const instance of scene.furni) {
      if (instance.uid === scene.selected) continue
      const def = catalog.furniture.find((item) => item.code === instance.code)
      if (!def) continue
      const dims = furniDims(def, instance.dir)
      fresh.occupy(instance.uid, footprint(instance.x, instance.y, dims.rows, dims.cols))
    }
    return fresh
  }, [catalog, model, scene.furni, scene.selected])

  const wallPanels = React.useMemo(
    () => buildWallPanels(model, layout, room, deco.wall),
    [model, layout, room, deco.wall],
  )

  const drawn = React.useMemo(
    () => buildDrawList({ catalog, arts, furni: scene.furni, layout, wallPanels }),
    [catalog, arts, scene.furni, layout, wallPanels],
  )

  React.useEffect(() => {
    props.onDrawOrder?.(drawn.map((entry) => entry.instance.uid))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn])

  React.useEffect(() => {
    const canvas = canvasRef.current
    const host = canvas?.parentElement
    if (!host) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      setViewport((previous) =>
        Math.abs(previous.width - rect.width) > 0.5 || Math.abs(previous.height - rect.height) > 0.5
          ? { width: rect.width, height: rect.height }
          : previous,
      )
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1

    // 画布铺满容器；房间按**整数倍**缩放并居中，既不拉伸也不留大片空白。
    // 1 逻辑像素 = 整数个设备像素，1px 描边不会被抽样打断。
    const box = roomBoxSize(room)
    const cssWidth = Math.max(320, viewport.width)
    const cssHeight = Math.max(240, viewport.height)
    const fitScale = Math.min(cssWidth / box.width, cssHeight / box.height)
    fitRef.current = { fitScale, box, origin: { x: layout.originX, y: layout.originY } }
    const scale = Math.max(1, Math.min(3, Math.floor(fitScale * ratio) / ratio))
    // 平移必须落在**整数设备像素**上：小数平移会让 1px 的亮/暗描边被重复采样，
    // 地砖就会浮出一层细密的“纹理”（每个格子的高光边漏出来）。
    const txDev = Math.round(((cssWidth - box.width * scale) / 2 - layout.originX * scale) * ratio)
    const tyDev = Math.round(
      ((cssHeight - box.height * scale) / 2 - layout.originY * scale) * ratio,
    )
    const tx = txDev / ratio
    const ty = tyDev / ratio
    viewRef.current = { scale, tx, ty }
    const previous = viewRef.current
    if (previous.scale !== scale || previous.tx !== tx || previous.ty !== ty) {
      onViewChangeRef.current?.({ scale, tx, ty })
    }

    canvas.width = Math.max(1, Math.round(cssWidth * ratio))
    canvas.height = Math.max(1, Math.round(cssHeight * ratio))
    canvas.style.width = `${cssWidth}px`
    canvas.style.height = `${cssHeight}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ;(window as unknown as Record<string, unknown>).__roomDebug = {
      stage,
      zoom,
      ratio,
      scale,
      tx,
      ty,
      buffer: { width: canvas.width, height: canvas.height },
      css: { width: canvas.style.width, height: canvas.style.height },
      floorCells: deco.floorCells ?? 1,
      wallCells: deco.wallCells ?? 1,
      floorTop: layout.floorTop,
      floorAsset: deco.floor ? { w: deco.floor.center.width, h: deco.floor.center.height } : null,
      wallAsset: deco.wall ? { w: deco.wall.left.width, h: deco.wall.left.height } : null,
      room: { type: room.type, rows: room.rows, cols: room.cols, combine: room.combine },
    }
    console.info('[room] 绘制参数', (window as unknown as Record<string, unknown>).__roomDebug)

    ctx.setTransform(scale * ratio, 0, 0, scale * ratio, tx * ratio, ty * ratio)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(
      -tx / scale,
      -ty / scale,
      canvas.width / ratio / scale,
      canvas.height / ratio / scale,
    )

    drawStatic(ctx, {
      room,
      model,
      layout,
      deco,
      scene: sceneImage,
      floorCells: deco.floorCells ?? 1,
    })

    // 家具与角色共用一套深度排序（官方也是同一个 SortMgr2D）
    const actorEntries = scene.actors.map((actor) => {
      const sample = samples.get(actor.uid)
      return { actor, sample, art: sample ? actorArtMap.get(sample.key) : undefined }
    })
    for (const entry of orderScene(
      drawn,
      scene.actors.map((actor) => ({ uid: actor.uid, x: actor.x, y: actor.y, dir: actor.dir })),
    )) {
      if (entry.kind === 'furni') {
        const item = drawn.find((candidate) => candidate.instance.uid === entry.id)
        if (!item) continue
        // 拖动中的家具：原位置不画，改到落点画半透明预览
        if (drag?.uid === entry.id) continue
        drawFurni(ctx, item)
        if (item.def.light) drawFurniLight(ctx, item, item.def.light)

        // 叠在 Bonsai（花盆）上的 Posy（植物）要被花盆前沿裁掉
        const parentUid = item.instance.surface?.parent
        if (parentUid) {
          const parent = drawn.find((candidate) => candidate.instance.uid === parentUid)
          const isBonsai = parent?.def.functionType === 'Bonsai'
          const isPosy = item.def.functionType === 'Posy'
          if (parent && (isBonsai || isPosy)) drawFurniMask(ctx, parent)
        }
        continue
      }
      const found = actorEntries.find((candidate) => candidate.actor.uid === entry.id)
      if (!found?.art) continue
      const actor = found.actor
      const clipId = found.actor.clipId
      const anchorSet =
        found.actor.seat || clipId === 'sit'
          ? SIT_ANCHORS
          : clipId === 'lie' || clipId === 'lie2'
            ? LIE_ANCHORS
            : STAND_ANCHORS
      const dragging = actorDrag?.uid === actor.uid ? actorDrag : null
      const placement = dragging ? dragging.to : { x: actor.x, y: actor.y }
      const origin = actorOrigin(
        placement,
        actor.dir,
        layout,
        anchorSet,
        dragging ? { x: 0, y: 0 } : (found.sample?.offset ?? { x: 0, y: 0 }),
      )
      if (dragging) {
        ctx.save()
        ctx.globalAlpha = 0.75
      }
      drawActor(ctx, { instance: actor, art: found.art, origin })
      if (dragging) ctx.restore()
      if (dragging) {
        const ok = model.exists(placement.x, placement.y) && model.canWalk(placement.x, placement.y)
        drawFootprint(
          ctx,
          layout,
          placement.x,
          placement.y,
          1,
          1,
          ok ? 'rgba(120,255,160,0.9)' : 'rgba(255,110,110,0.9)',
        )
      }
      if (actor.uid === scene.selectedActor) {
        ctx.strokeStyle = 'rgba(255,214,110,0.9)'
        ctx.strokeRect(origin.x + 4.5, origin.y + 4.5, 31, 51)
      }
    }

    if (showGrid) drawGrid(ctx, model, layout)

    if (scene.picking) {
      const isWallItem = scene.picking.position === 3 || scene.picking.position === 4
      if (isWallItem) {
        drawWallHighlight(ctx, wallPanels, null)
        if (hover) {
          for (const panel of wallSegmentsAt(wallPanels, hover)) {
            drawWallSlot(ctx, panel, scene.picking)
          }
        }
      } else {
        drawPlacementGhost(ctx, {
          room: scene.picking,
          hover,
          layout,
          occupancy,
          art: pickingArt,
          dir: 3,
        })
      }
    }

    if (marquee) {
      drawMarquee(ctx, layout, normalizeRect(marquee.from, marquee.to))
    }

    // 多选：其余选中的画细线，主选中用蓝色实线
    for (const uid of scene.selection ?? []) {
      if (uid === scene.selected) continue
      const extra = drawn.find((entry) => entry.instance.uid === uid)
      if (!extra) continue
      const dims = furniDims(extra.def, extra.instance.dir)
      drawFootprint(
        ctx,
        layout,
        extra.instance.x,
        extra.instance.y,
        dims.rows,
        dims.cols,
        'rgba(120,200,255,0.45)',
      )
    }

    if (scene.selected) {
      const selected = drawn.find((entry) => entry.instance.uid === scene.selected)
      if (selected) {
        const dims = furniDims(selected.def, selected.instance.dir)
        drawFootprint(
          ctx,
          layout,
          selected.instance.x,
          selected.instance.y,
          dims.rows,
          dims.cols,
          'rgba(120,200,255,0.9)',
        )
      }
    }

    if (drag && dragTarget) {
      const dragged = drawn.find((entry) => entry.instance.uid === drag.uid)
      if (dragged) {
        const dims = furniDims(dragged.def, dragged.instance.dir)
        const ok = occupancy.canPlace(dragTarget.x, dragTarget.y, dims.rows, dims.cols)
        drawFootprint(
          ctx,
          layout,
          dragTarget.x,
          dragTarget.y,
          dims.rows,
          dims.cols,
          ok ? 'rgba(120,255,160,0.9)' : 'rgba(255,110,110,0.9)',
        )

        // 家具本体跟到落点，半透明预览（非法时更淡）
        const origin = furniOrigin(
          { x: dragTarget.x, y: dragTarget.y },
          dragged.instance.dir,
          dragged.anchors,
          {
            floorTop: layout.floorTop,
          },
        )
        ctx.save()
        ctx.globalAlpha = ok ? 0.75 : 0.35
        if (dragged.art.mirrored) {
          ctx.translate(origin.x + dragged.art.width, origin.y)
          ctx.scale(-1, 1)
          ctx.drawImage(dragged.art.bitmap, 0, 0)
        } else {
          ctx.drawImage(dragged.art.bitmap, origin.x, origin.y)
        }
        ctx.restore()
      }
    }
  }, [
    room,
    model,
    layout,
    zoom,
    viewport.width,
    viewport.height,
    viewZoom,
    pan,
    sceneImage,
    stage,
    deco,
    drawn,
    showGrid,
    scene.picking,
    scene.selected,
    scene.selection,
    actorDrag,
    scene.actors,
    marquee,
    hover,
    drag,
    dragTarget,
    occupancy,
    pickingArt,
    wallPanels,
    actorArtMap,
    samples,
    walking,
    scene.selectedActor,
  ])

  /** 事件 → stage 逻辑坐标（已含视图变换反解） */
  const stageFromEvent = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: -1, y: -1 }
    const rect = canvas.getBoundingClientRect()
    const view = viewRef.current
    return {
      x: (event.clientX - rect.left - view.tx) / view.scale,
      y: (event.clientY - rect.top - view.ty) / view.scale,
    }
  }, [])

  /** 命中测试：用精灵的**实际包围盒**，而不是底部占地菱形。 */
  const hitFurniAt = React.useCallback(
    (point: { x: number; y: number }) => {
      for (let i = drawn.length - 1; i >= 0; i -= 1) {
        const entry = drawn[i]!
        const { origin, art } = entry
        if (
          point.x >= origin.x &&
          point.x < origin.x + art.width &&
          point.y >= origin.y &&
          point.y < origin.y + art.height
        ) {
          return entry
        }
      }
      return null
    },
    [drawn],
  )

  /** 角色在舞台上的包围盒（与绘制用同一套锚点与偏移）。 */
  const actorBox = React.useCallback(
    (actor: ActorInstance): { x: number; y: number; width: number; height: number } | null => {
      const sample = samples.get(actor.uid)
      const art = sample ? actorArtMap.get(sample.key) : null
      if (!art) return null
      const clipId = actor.clipId
      const anchorSet =
        actor.seat || clipId === 'sit'
          ? SIT_ANCHORS
          : clipId === 'lie' || clipId === 'lie2'
            ? LIE_ANCHORS
            : STAND_ANCHORS
      const origin = actorOrigin(
        { x: actor.x, y: actor.y },
        actor.dir,
        layout,
        anchorSet,
        sample?.offset ?? { x: 0, y: 0 },
      )
      return { x: origin.x, y: origin.y, width: art.width, height: art.height }
    },
    [samples, actorArtMap, layout],
  )

  const hitActorAt = React.useCallback(
    (point: { x: number; y: number }): ActorInstance | null => {
      for (let i = scene.actors.length - 1; i >= 0; i -= 1) {
        const actor = scene.actors[i]!
        const box = actorBox(actor)
        if (!box) continue
        if (
          point.x >= box.x &&
          point.x < box.x + box.width &&
          point.y >= box.y &&
          point.y < box.y + box.height
        ) {
          return actor
        }
      }
      return null
    },
    [scene.actors, actorBox],
  )

  const cellFromEvent = React.useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
      const canvas = canvasRef.current
      if (!canvas) return { x: -1, y: -1 }
      const rect = canvas.getBoundingClientRect()
      const view = viewRef.current
      const px = (event.clientX - rect.left - view.tx) / view.scale
      const py = (event.clientY - rect.top - view.ty) / view.scale
      return pixelToCell(px, py, layout)
    },
    [layout],
  )

  /**
   * 滚轮缩放。
   *
   * Ctrl/⌘ + 滚轮（macOS 触控板双指捏合也会产生 ctrl+wheel）以**指针为锚点**缩放：
   * 平移量按 `(scale1 - scale0) * (box/2 + origin - world)` 修正，
   * 保证指针下的那块地砖不动。普通滚轮则平移画布。
   */
  const handleWheel = React.useCallback(
    (event: WheelEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return

      // Ctrl/⌘ + 滚轮（macOS 双指捏合也会产生 ctrl+wheel）→ 以指针为锚缩放
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        const info = fitRef.current
        const view = viewRef.current
        const ratio = window.devicePixelRatio || 1
        const rect = canvas.getBoundingClientRect()
        const pointerX = event.clientX - rect.left
        const pointerY = event.clientY - rect.top

        const s0 = view.scale
        const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
        const nextZoom = Math.min(6, Math.max(0.5, viewZoom * factor))
        const s1 = Math.max(1, Math.round(info.fitScale * nextZoom * ratio) / ratio)
        if (s1 !== s0) {
          const worldX = (pointerX - view.tx) / s0
          const worldY = (pointerY - view.ty) / s0
          setPan((current) => ({
            x: current.x + (s1 - s0) * (info.box.width / 2 + info.origin.x - worldX),
            y: current.y + (s1 - s0) * (info.box.height / 2 + info.origin.y - worldY),
          }))
        }
        setViewZoom(nextZoom)
        return
      }

      // 普通滚轮 / 双指滑动：平移画布
      event.preventDefault()
      setPan((current) => ({
        x: current.x - (event.shiftKey ? event.deltaY : event.deltaX),
        y: current.y - (event.shiftKey ? 0 : event.deltaY),
      }))
    },
    [viewZoom],
  )

  // React 的 onWheel 是 passive，必须手动注册非被动监听才能拦住浏览器页面缩放
  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const listener = (event: WheelEvent): void => handleWheel(event)
    canvas.addEventListener('wheel', listener, { passive: false })
    return () => canvas.removeEventListener('wheel', listener)
  }, [handleWheel])

  const handleMove = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    const cell = cellFromEvent(event)
    const next = model.exists(cell.x, cell.y) ? cell : null
    setHover(next)
    props.onHover(next)

    // 拖动中：落点用**原始格子**（允许越出房间/墙外），
    // 否则指针一移到墙上就没有落点，家具会"卡住"，但实际边缘仍可放。
    if (marquee) {
      setMarquee((current) => (current ? { ...current, to: cell } : current))
      return
    }

    const actorPress = actorPressRef.current
    if (actorPress) {
      if (cell.x === actorPress.from.x && cell.y === actorPress.from.y) return
      setActorDrag({ uid: actorPress.uid, from: actorPress.from, to: cell })
      return
    }

    if (drag) {
      updateDragTarget(cell)
      return
    }

    // 按下后移动超过一格才算拖动（避免"点一下就跟着跑"）
    const press = pressRef.current
    if (!press) return
    if (cell.x === press.cell.x && cell.y === press.cell.y) return
    setDrag({
      uid: press.uid,
      offsetX: press.origin.x - press.cell.x,
      offsetY: press.origin.y - press.cell.y,
    })
    setDragTarget({ x: press.origin.x, y: press.origin.y })
  }

  /** 拖动落点 = 指针格 + 抓取偏移。 */
  const updateDragTarget = React.useCallback(
    (cell: { x: number; y: number }) => {
      const current = drag
      if (!current) return
      setDragTarget({ x: cell.x + current.offsetX, y: cell.y + current.offsetY })
    },
    [drag],
  )

  const handleDown = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    if (event.button !== 0) return
    const cell = cellFromEvent(event)
    const point = stageFromEvent(event)

    if (scene.picking) {
      const isWallItem = scene.picking.position === 3 || scene.picking.position === 4
      if (!isWallItem && model.exists(cell.x, cell.y)) props.onPlace(cell)
      else if (isWallItem) props.onPlaceWall?.(cell)
      return
    }

    // 先看有没有点到角色：用精灵包围盒（NPC 40×70、2×2 占地，按格点判定点不中身体）
    const actorHit = hitActorAt(point)
    if (actorHit) {
      props.onSelectActor(actorHit.uid)
      actorPressRef.current = { uid: actorHit.uid, from: { x: actorHit.x, y: actorHit.y } }
      setActorDrag(null)
      return
    }

    // 家具命中：用**精灵的实际包围盒**（不是底部占地菱形）
    const hit = hitFurniAt(point)
    if (!hit) {
      if (event.shiftKey && model.exists(cell.x, cell.y)) {
        setMarquee({ from: cell, to: cell })
        return
      }
      props.onSelect(null)
      // 点了空地：如果选中了角色，就让它走过去
      const actor = scene.selectedActor
        ? scene.actors.find((item) => item.uid === scene.selectedActor)
        : null
      if (actor && model.canWalk(cell.x, cell.y)) {
        const path = findPath(model, { x: actor.x, y: actor.y }, cell)
        if (path.length > 0) setWalking({ uid: actor.uid, path, index: 0 })
      }
      return
    }

    // 有选中角色时，点家具 = 让角色走过去交互
    const actor = scene.selectedActor
      ? scene.actors.find((item) => item.uid === scene.selectedActor)
      : null
    if (actor && props.onInteract) {
      props.onInteract(actor.uid, hit.instance.uid)
      return
    }

    // Shift 点选：加入/移出多选，不进入拖动
    if (event.shiftKey) {
      props.onToggleSelect(hit.instance.uid)
      return
    }

    // 选中但**先不拖动**：只有按住并移动到别的格子才进入拖拽
    props.onSelect(hit.instance.uid)
    pressRef.current = {
      uid: hit.instance.uid,
      cell,
      origin: { x: hit.instance.x, y: hit.instance.y },
    }
    setDrag(null)
  }

  /** 结束拖动：落点合法才真正移动。 */
  const finishDrag = React.useCallback(() => {
    pressRef.current = null
    const current = drag
    const target = dragTarget
    setDrag(null)
    setDragTarget(null)
    if (!current || !target) return

    const entry = drawn.find((item) => item.instance.uid === current.uid)
    if (!entry) return
    const dims = furniDims(entry.def, entry.instance.dir)
    if (!occupancy.canPlace(target.x, target.y, dims.rows, dims.cols)) return
    if (target.x === entry.instance.x && target.y === entry.instance.y) return

    const dx = target.x - entry.instance.x
    const dy = target.y - entry.instance.y
    // 多选时整体平移；单选保持原来的单件移动
    if (props.selection.length > 1 && props.selection.includes(current.uid)) {
      props.onMoveMany(dx, dy)
      return
    }
    props.onMove(current.uid, target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, dragTarget, drawn, occupancy])

  /** 框选结束：命中占地矩形的都选中 */
  const finishMarquee = React.useCallback(() => {
    const rect = marquee
    setMarquee(null)
    if (!rect) return
    const area = normalizeRect(rect.from, rect.to)
    if (area.x1 - area.x0 < 1 && area.y1 - area.y0 < 1) return
    const wallUids = new Set(
      drawn.filter((entry) => entry.instance.wallLoc).map((entry) => entry.instance.uid),
    )
    const uids = selectInRect(
      drawn.map((entry) => ({
        uid: entry.instance.uid,
        x: entry.instance.x,
        y: entry.instance.y,
        dir: entry.instance.dir,
        def: entry.def,
      })),
      area,
      { wallUids },
    )
    props.onSelectMany(uids)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marquee, drawn])

  /** 角色拖拽落位：目标格要能走（默认角色占 1 格）。 */
  const finishActorDrag = React.useCallback(() => {
    const dragState = actorDrag
    actorPressRef.current = null
    setActorDrag(null)
    if (!dragState) return
    const { uid, from, to } = dragState
    if (to.x === from.x && to.y === from.y) return
    if (!model.exists(to.x, to.y) || !model.canWalk(to.x, to.y)) return
    // 落位不改朝向（朝向由「角色动作」面板控制）
    const current = scene.actors.find((item) => item.uid === uid)
    props.onActorPlace(uid, to, current?.dir ?? 3)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorDrag, model])

  const handleUp = (): void => {
    finishDrag()
    finishMarquee()
    finishActorDrag()
  }

  /** 中键拖动平移画布 */
  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (event.button !== 1) return
    event.preventDefault()
    panDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const panning = panDrag.current
    if (!panning || panning.pointerId !== event.pointerId) return
    setPan((current) => ({
      x: current.x + (event.clientX - panning.x),
      y: current.y + (event.clientY - panning.y),
    }))
    panDrag.current = { ...panning, x: event.clientX, y: event.clientY }
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (panDrag.current?.pointerId === event.pointerId) panDrag.current = null
  }

  // 角色拖拽期间：窗口级监听，移出画布也能继续
  React.useEffect(() => {
    if (!actorDrag) return
    const onMove = (event: MouseEvent): void => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const view = viewRef.current
      const px = (event.clientX - rect.left - view.tx) / view.scale
      const py = (event.clientY - rect.top - view.ty) / view.scale
      setActorDrag((current) =>
        current ? { ...current, to: pixelToCell(px, py, layout) } : current,
      )
    }
    const onUp = (): void => finishActorDrag()
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(actorDrag), layout, finishActorDrag])

  // 框选期间：指针移出画布也能继续，松开即结算
  React.useEffect(() => {
    if (!marquee) return
    const onMove = (event: MouseEvent): void => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const view = viewRef.current
      const px = (event.clientX - rect.left - view.tx) / view.scale
      const py = (event.clientY - rect.top - view.ty) / view.scale
      setMarquee((current) => (current ? { ...current, to: pixelToCell(px, py, layout) } : current))
    }
    const onUp = (): void => finishMarquee()
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(marquee), layout, finishMarquee])

  // 拖动期间监听整窗口：指针移到墙外/画布外也能继续拖、能松手落位
  React.useEffect(() => {
    if (!drag) return
    const onMove = (event: MouseEvent): void => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const view = viewRef.current
      const px = (event.clientX - rect.left - view.tx) / view.scale
      const py = (event.clientY - rect.top - view.ty) / view.scale
      updateDragTarget(pixelToCell(px, py, layout))
    }
    const onUp = (): void => {
      finishDrag()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, layout, updateDragTarget])

  return (
    <div className="relative size-full">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={() => {
          setViewZoom(1)
          setPan({ x: 0, y: 0 })
        }}
        onMouseMove={handleMove}
        onMouseDown={handleDown}
        onMouseUp={handleUp}
        onMouseLeave={() => {
          setHover(null)
          props.onHover(null)
          setDrag(null)
        }}
        className="block rounded-pkt border border-pkt-border bg-pkt-bg"
        style={{
          imageRendering: 'pixelated',
          cursor: scene.picking ? 'copy' : drag ? 'grabbing' : 'default',
        }}
      />
    </div>
  )
}

/** 家具图按 (code, dir) 缓存；切换朝向时重新取。 */
function useFurniArts(catalog: Catalog, furni: FurniInstance[]): Map<string, FurniArt | null> {
  const [state, setState] = React.useState<Map<string, FurniArt | null>>(new Map())

  React.useEffect(() => {
    let cancelled = false
    const missing = furni.filter((instance) => {
      const def = catalog.furniture.find((item) => item.code === instance.code)
      if (!def) return false
      return !state.has(furniArtKey(instance))
    })
    if (missing.length === 0) return

    void Promise.all(
      missing.map(async (instance) => {
        const def = catalog.furniture.find((item) => item.code === instance.code)
        if (!def) return [furniArtKey(instance), null] as const
        const art = await loadFurniArt(def, instance.dir, furniFrameOf(instance)).catch(() => null)
        return [furniArtKey(instance), art] as const
      }),
    ).then((entries) => {
      if (cancelled) return
      setState((previous) => {
        const next = new Map(previous)
        for (const [key, art] of entries) next.set(key, art)
        return next
      })
    })

    return () => {
      cancelled = true
    }
  }, [catalog, furni, state])

  return state
}

function usePickingArt(catalog: Catalog, def: CatalogFurniture | null): FurniArt | null {
  const [art, setArt] = React.useState<FurniArt | null>(null)
  React.useEffect(() => {
    if (!def) {
      setArt(null)
      return
    }
    let cancelled = false
    void loadFurniArt(def, 3, 1)
      .then((value) => {
        if (!cancelled) setArt(value)
      })
      .catch(() => {
        if (!cancelled) setArt(null)
      })
    return () => {
      cancelled = true
    }
  }, [catalog, def])
  return art
}

/**
 * 角色贴图：玩家按「基础 sheet + 穿戴 + 表情」合成，NPC 直接取帧。
 *
 * 只合成当前需要的姿势（待机 / 行走那一帧），缓存键包含穿戴内容，
 * 所以换衣服、换朝向都会重新合成。
 */
/** 一个角色当前该画的东西。 */
interface ActorSample {
  key: string
  arms: number
  legs: number
  /** 头发层帧号（官方 hair，只影响头发，不影响基础头） */
  hairFrame: number
  offset: { x: number; y: number }
  npcFrame: number
}

/**
 * 采样每个角色的当前帧。
 *
 * 优先级：本地行走 > 指定动作（clipId）> NPC 自主动作 > 待机。
 * 官方动作默认循环；非循环动作播完回落到待机（这里用 `evaluateClip().done` 判断）。
 */
function sampleActorPoses(input: {
  actorList: ActorInstance[]
  catalog: Catalog
  clipTime: number
  walkingUid: string | null
  customClips?: MotionClip[]
  customActors?: CustomActor[]
}): Map<string, ActorSample> {
  const clips = clipsFromCatalog(input.catalog.actorMotions)
  // 自定义动作覆盖同名内置动作
  for (const clip of input.customClips ?? []) clips.set(clip.id, clip)
  const stand = standClip()
  // 官方有 walk 就用官方的（4 步循环），没有才用内置合成
  const walk = clips.get('walk') ?? walkClip()
  // 内置动作作为兜底（官方表里没有同名动作时也能用）
  for (const clip of [stand, walk, sitClip(), lieClip()]) {
    if (!clips.has(clip.id)) clips.set(clip.id, clip)
  }
  const out = new Map<string, ActorSample>()

  for (const actor of input.actorList) {
    if (actor.kind === 'custom' && actor.customActor) {
      const def = (input.customActors ?? []).find((item) => item.id === actor.customActor)
      const frame = def ? customActorFrameIndex(def, input.clipTime) : 0
      out.set(actor.uid, {
        key: `custom-actor:${actor.customActor}:${actor.dir}:${frame}`,
        arms: 0,
        legs: 0,
        hairFrame: 0,
        offset: { x: 0, y: 0 },
        npcFrame: frame,
      })
      continue
    }

    if (actor.kind === 'npc') {
      const def = input.catalog.npcs.find((entry) => entry.code === actor.npcCode)
      // 走路用官方 moveStyle（walk1/walk2…），站定用面板里选的动作或 standStyle
      const walking = input.walkingUid === actor.uid
      const motionName = walking
        ? (def?.moveStyle ?? 'walk1')
        : (actor.clipId ?? def?.standStyle ?? 'stand1')
      const steps = input.catalog.npcMotions[motionName] ?? input.catalog.npcMotions['stand1'] ?? []
      const frame = evaluateNpcMotion(steps, input.clipTime)
      out.set(actor.uid, {
        key: `npc:${actor.npcCode ?? ''}:${actor.dir}:${frame}`,
        arms: 0,
        legs: 0,
        hairFrame: 0,
        offset: { x: 0, y: 0 },
        npcFrame: frame,
      })
      continue
    }

    const walkingHere = input.walkingUid === actor.uid
    const clip = walkingHere ? walk : actor.clipId ? (clips.get(actor.clipId) ?? stand) : stand
    const sample = evaluateClip(clip, input.clipTime, actor.dir)
    const useStand = !walkingHere && !clip.loop && sample.done
    out.set(actor.uid, {
      key: actorArtKey(actor, useStand ? 0 : sample.legs, useStand ? 0 : sample.arms),
      arms: useStand ? 0 : sample.arms,
      legs: useStand ? 0 : sample.legs,
      hairFrame: useStand ? 0 : sample.hairFrame,
      offset: useStand ? { x: 0, y: 0 } : sample.offset,
      npcFrame: 1,
    })
  }

  return out
}

/** 角色贴图：玩家按「基础 sheet + 穿戴 + 表情」合成，NPC 直接取帧。 */
function useActorArts(
  catalog: Catalog,
  actors: ActorInstance[],
  samples: Map<string, ActorSample>,
  customActorList: CustomActor[],
): Map<string, ActorArt> {
  const [state, setState] = React.useState<Map<string, ActorArt>>(new Map())

  React.useEffect(() => {
    let cancelled = false
    const tasks = actors.map(async (actor) => {
      const sample = samples.get(actor.uid)
      if (!sample) return null
      if (state.has(sample.key)) return null

      if (actor.kind === 'custom' && actor.customActor) {
        const def = customActorList.find((item) => item.id === actor.customActor)
        if (!def) return null
        const art = await loadCustomActorArt(def, actor.dir, sample.npcFrame).catch(() => null)
        return art ? ([sample.key, art] as const) : null
      }

      if (actor.kind === 'npc' && actor.npcCode) {
        const def = catalog.npcs.find((entry) => entry.code === actor.npcCode)
        if (!def) return null
        const art = await loadNpcArt(def, actor.dir, sample.npcFrame).catch(() => null)
        return art ? ([sample.key, art] as const) : null
      }

      if (!actor.outfit || !catalog.assets) return null
      const assets = await loadPlayerActorAssets({
        catalog,
        assets: catalog.assets,
        outfit: actor.outfit,
      }).catch(() => null)
      if (!assets) return null
      const image = composeRoomActor({
        sheet: assets.sheet,
        pose: { dir: actor.dir, arms: sample.arms, legs: sample.legs, hairFrame: sample.hairFrame },
        worn: assets.worn,
        face: assets.face,
      })
      const art = await actorArtFromImage(image, sample.key)
      return [sample.key, art] as const
    })

    void Promise.all(tasks).then((entries) => {
      if (cancelled) return
      const valid = entries.filter((entry): entry is readonly [string, ActorArt] => Boolean(entry))
      if (valid.length === 0) return
      setState((previous) => {
        const next = new Map(previous)
        for (const [key, art] of valid) next.set(key, art)
        return next
      })
    })

    return () => {
      cancelled = true
    }
  }, [catalog, actors, samples, state, customActorList])

  return state
}

function actorArtKey(actor: ActorInstance, legs: number, arms: number): string {
  const outfit = actor.kind === 'npc' ? `npc:${actor.npcCode ?? ''}` : JSON.stringify(actor.outfit)
  return `${outfit}:${actor.dir}:${arms}:${legs}`
}
