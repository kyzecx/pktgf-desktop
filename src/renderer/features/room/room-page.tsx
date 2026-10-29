import * as React from 'react'
import { ButtonRoot, SpinnerRoot } from '@heroui/react'

import type { Catalog, CatalogFurniture, CatalogRoomDef, CatalogRoomMap } from '@shared/contract'
import {
  RoomModel,
  computeRoomLayout,
  computeSceneLayout,
  decodeRoomMap,
  fitStage,
  footprint,
  applyInteraction,
  canStackOn,
  deserializeRoom,
  enterPoints,
  findPath,
  furniDims,
  furniSurfaceSlots,
  nearestEnterPoint,
  resolveInteraction,
  wallVariantAt,
} from '@engine/room'
import { useCatalog } from '@/app/catalog-context'

import { useSaves } from '@features/saves/hooks/use-saves'
import { isOutfitSave } from '@features/outfits/state/outfit-save'

import { ActorPanel } from './components/actor-panel'
import { FloatingWindow } from '@ui/floating'
import { useFloatingStore } from '@ui/floating/use-floating-store'
import { useShortcuts } from '@ui/shortcut-config'

import { FURNI_EDITOR_WINDOW_ID, FurniEditor } from './components/furni-editor'
import { FurniLibrary } from './components/furni-library'
import { RoomTypePanel } from './components/room-type-panel'
import { CustomFurniImport } from './components/custom-furni-import'
import { CustomActorImport } from './components/custom-actor-import'
import {
  DEFAULT_EXPORT_SETTINGS,
  ExportPanel,
  type ExportSettings,
} from './components/export-panel'
import { useRoomExport } from './hooks/use-room-export'
import { useRoomArchive, type PktRoomLoad } from './hooks/use-room-archive'
import { LayerPanel } from './components/layer-panel'
import { ExportMenu } from './components/room-menu'
import { ActorActionPanel } from './components/actor-action-panel'
import { SelectionBar } from './components/selection-bar'
import { takePendingRoomSave } from './state/pending-room-save'
import { MotionEditor } from './components/motion-editor'
import { useCustomFurniStore, withCustomFurniture } from './state/custom-furni-store'
import { useCustomActorStore } from './state/custom-actor-store'
import {
  ACTOR_WINDOW_ID,
  EXPORT_WINDOW_ID,
  LAYER_WINDOW_ID,
  MOTION_EDITOR_WINDOW_ID,
  ROOM_FURNI_WINDOW_ID,
  ROOM_TYPE_WINDOW_ID,
} from './windows'
import { RoomCanvas } from './components/room-canvas'
import {
  loadDecoAssets,
  loadFurniImage,
  loadSceneArt,
  loadTmxScene,
  type DecoAssets,
} from './services'
import { nextFurniUid, useRoomStore } from './state/room-store'

/**
 * 装修页。
 *
 * 画布占满整页；房型 / 家具 / 角色都是**按钮打开的浮窗**，不常驻占位。
 * - 空格：打开家具面板并聚焦搜索框（复用搭配页的 `SearchField`，默认全分类）
 * - 点画布上的物品：在它下方弹出编辑层（朝向 / 状态 / 删除）
 * 静态层（地板/墙/门）来自 M1，动态层顺序由 `SortMgr2D` 决定。
 */

const MIN_STAGE = { width: 950, height: 540 }

export function RoomPage(): React.ReactElement {
  const { catalog, error } = useCatalog()
  const customFurni = useCustomFurniStore((state) => state.items)
  const catalogWithCustom = React.useMemo(
    () =>
      catalog
        ? { ...catalog, furniture: withCustomFurniture(catalog.furniture, customFurni) }
        : null,
    [catalog, customFurni],
  )
  const rooms = React.useMemo(() => catalog?.rooms ?? [], [catalog])
  const maps = React.useMemo(() => catalog?.roomMaps ?? [], [catalog])

  const [roomType, setRoomType] = React.useState(101)
  const [zoom, setZoom] = React.useState(2)
  const [showGrid, setShowGrid] = React.useState(false)
  const [picking, setPicking] = React.useState<CatalogFurniture | null>(null)
  const [search, setSearch] = React.useState('')
  /** 默认全分类搜索（复用搭配页搜索框的「全」按钮） */
  const [allSearch, setAllSearch] = React.useState(true)
  const searchRef = React.useRef<HTMLInputElement | null>(null)

  const toggleWindow = useFloatingStore((state) => state.toggle)
  const assetWindowOpen = useFloatingStore((state) => state.open[ROOM_FURNI_WINDOW_ID] ?? false)
  const typeWindowOpen = useFloatingStore((state) => state.open[ROOM_TYPE_WINDOW_ID] ?? false)
  const layerWindowOpen = useFloatingStore((state) => state.open[LAYER_WINDOW_ID] ?? false)
  /** 画布报告的绘制顺序（图层面板按它排列） */
  const [drawOrder, setDrawOrder] = React.useState<string[]>([])
  /** 素材浮窗里的 Tab：家具 / 人物 */
  const [assetTab, setAssetTab] = React.useState<'furni' | 'actor'>('furni')
  /** 操作反馈（叠放结果等），2.5 秒后自动消失 */
  const [notice, setNotice] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 2500)
    return () => window.clearTimeout(timer)
  }, [notice])

  /** 读档 / 导入存档：等房型 effect 跑完再落到 store，避免被 reset 清掉 */
  const [pendingScene, setPendingScene] = React.useState<PktRoomLoad | null>(null)
  const [exportSettings, setExportSettings] =
    React.useState<ExportSettings>(DEFAULT_EXPORT_SETTINGS)

  const [hover, setHover] = React.useState<{ x: number; y: number } | null>(null)
  /** 等角色走到交互点后要执行的交互 */
  const [pendingInteraction, setPendingInteraction] = React.useState<{
    actorUid: string
    furniUid: string
  } | null>(null)
  /** 行走指令（交给画布执行） */
  const [walkCommand, setWalkCommand] = React.useState<{
    uid: string
    path: Array<{ cell: { x: number; y: number }; dir: 1 | 3 | 5 | 7 }>
    seq: number
  } | null>(null)
  const walkSeq = React.useRef(0)

  const store = useRoomStore()
  const { saves } = useSaves()

  // 点中角色就打开动作面板（放置人物 → 点人物 → 应用动作）
  React.useEffect(() => {
    const floating = useFloatingStore.getState()
    if (store.selectedActor) floating.openWindow(ACTOR_WINDOW_ID)
    else floating.close(ACTOR_WINDOW_ID)
  }, [store.selectedActor])

  const outfitSaves = React.useMemo(() => saves.filter(isOutfitSave), [saves])
  const room = React.useMemo(
    () => rooms.find((entry) => entry.type === roomType) ?? rooms[0] ?? null,
    [rooms, roomType],
  )
  const model = React.useMemo(() => buildModel(room, maps), [room, maps])
  const stage = React.useMemo(() => (room ? fitStage(room, MIN_STAGE) : MIN_STAGE), [room])
  // 只有整图房才用场景图坐标（computeSceneLayout 内部也会拦，这里再显式一次）
  const sceneLayout = React.useMemo(
    () => (room && room.ifDefaultImg === 1 ? computeSceneLayout(room, stage) : null),
    [room, stage],
  )
  const layout = React.useMemo(() => {
    if (!room) return null
    // 整图房：地板原点来自 gridOffset；拼接房：走舞台居中公式
    const base = sceneLayout
      ? {
          floorTop: sceneLayout.floorTop,
          originX: sceneLayout.image.x,
          originY: sceneLayout.image.y,
          boxWidth: sceneLayout.image.width,
          boxHeight: sceneLayout.image.height,
        }
      : computeRoomLayout(room, stage)
    return base
  }, [room, stage, sceneLayout])
  const deco = useDecoAssets(catalog, room)
  const sceneImage = useSceneImage(
    room,
    room && room.ifDefaultImg === 1 ? computeSceneLayout(room, stage) : null,
  )

  // 切换房型时重建场景
  React.useEffect(() => {
    if (!room) return
    store.reset({
      type: room.type,
      category: room.category,
      rows: room.rows,
      cols: room.cols,
      tile: room.defaultTile,
      wall: room.defaultWall,
      door: room.defaultDoor,
      bg: room.defaultBg,
    })
    setPicking(null)
    if (pendingScene && pendingScene.room.type === room.type) {
      store.loadScene(pendingScene)
      setPendingScene(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.type, pendingScene])

  // 从存档页点进来的房间存档：等目录就绪后还原
  React.useEffect(() => {
    if (!catalog) return
    const data = takePendingRoomSave()
    if (!data) return
    const restored = deserializeRoom(data, {
      rows: data.room.rows,
      cols: data.room.cols,
      knownCodes: new Set(catalog.furniture.map((item) => item.code)),
      knownActors: new Set(useCustomActorStore.getState().items.map((item) => item.id)),
    })
    setRoomType(restored.room.type)
    setPendingScene({
      room: restored.room,
      furni: restored.furni,
      actors: restored.actors,
      name: '',
    })
  }, [catalog])

  const selectedActorInstance = React.useMemo(
    () => store.actors.find((item) => item.uid === store.selectedActor) ?? null,
    [store.actors, store.selectedActor],
  )

  /** 动作编辑器预览用的形象：优先当前选中的角色 */
  const previewOutfit = React.useMemo(() => {
    const actor = store.actors.find((item) => item.uid === store.selectedActor)
    return actor?.outfit ?? null
  }, [store.actors, store.selectedActor])

  const exporter = useRoomExport(
    catalog && room && model && layout
      ? {
          catalog: catalogWithCustom ?? catalog,
          room,
          model,
          layout,
          stage,
          furni: store.furni,
          actors: store.actors,
        }
      : null,
  )

  const archive = useRoomArchive({
    catalog,
    room,
    spec: store.room,
    renderPreview: () => exporter.renderPreview(),
    applyScene: (payload) => {
      setRoomType(payload.room.type)
      setPendingScene(payload)
      // 同房型时 effect 不会再跑，这里直接落地
      if (payload.room.type === roomType) {
        store.loadScene(payload)
        setPendingScene(null)
      }
    },
  })

  // 选中物品 → 打开编辑浮窗；取消选中 / 删除 → 关闭
  React.useEffect(() => {
    if (store.selected) useFloatingStore.getState().openWindow(FURNI_EDITOR_WINDOW_ID)
    else useFloatingStore.getState().close(FURNI_EDITOR_WINDOW_ID)
  }, [store.selected])

  const selected = React.useMemo(
    () => store.furni.find((item) => item.uid === store.selected) ?? null,
    [store.furni, store.selected],
  )
  const selectedDef = React.useMemo(
    () =>
      selected
        ? (catalogWithCustom?.furniture.find((item) => item.code === selected.code) ?? null)
        : null,
    [catalogWithCustom, selected],
  )

  // 素材面板开关（空格由可配置快捷键驱动）
  const toggleAssets = React.useCallback(() => {
    const open = useFloatingStore.getState().open[ROOM_FURNI_WINDOW_ID] ?? false
    if (open) {
      useFloatingStore.getState().close(ROOM_FURNI_WINDOW_ID)
      return
    }
    setAssetTab('furni')
    useFloatingStore.getState().openWindow(ROOM_FURNI_WINDOW_ID)
    window.setTimeout(() => searchRef.current?.focus(), 0)
  }, [])

  // 页面快捷键（设置页可改）；空格再按一次关闭面板
  useShortcuts(
    'room',
    {
      toggleAssets,
      undo: () => store.undo(),
      redo: () => store.redo(),
      rotate: () => {
        if (store.selection.length > 1) store.rotateSelection()
        else if (store.selected) store.rotateFurni(store.selected)
      },
      delete: () => {
        if (store.selection.length > 1) store.removeSelection()
        else if (store.selected) store.removeFurni(store.selected)
      },
      grid: () => setShowGrid((value) => !value),
    },
    { capture: true },
  )

  /** 叠到主选中：需要底座 otherOverMe>0、上层 meOverOther（官方规则） */
  const stackOntoSelected = React.useCallback(async (): Promise<void> => {
    const hostUid = store.selected
    if (!hostUid) return
    const host = store.furni.find((item) => item.uid === hostUid)
    const hostDef = host
      ? (catalogWithCustom ?? catalog)?.furniture.find((d) => d.code === host.code)
      : null
    if (!host || !hostDef) return

    const art = await loadFurniImage(hostDef, host.dir)
    const slots = furniSurfaceSlots(hostDef, host.dir, art?.image.width ?? 0)
    let index = store.furni.filter((item) => item.surface?.parent === hostUid).length

    let stacked = 0
    for (const uid of store.selection) {
      if (uid === hostUid) continue
      const child = store.furni.find((item) => item.uid === uid)
      const childDef = child
        ? (catalogWithCustom ?? catalog)?.furniture.find((d) => d.code === child.code)
        : null
      if (!child || !childDef || !canStackOn(hostDef, childDef)) continue
      const slot = index % Math.max(1, slots.length)
      store.setFurniSurface(uid, { parent: hostUid, index: slot })
      index += 1
      stacked += 1
    }
    setNotice(
      stacked > 0
        ? `已把 ${stacked} 件叠到「${hostDef.name}」上`
        : `「${hostDef.name}」不能当底座（otherOverMe = ${hostDef.otherOverMe}）`,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.furni, store.selection, store.selected, catalog, catalogWithCustom])

  // Esc：取消放置 / 关闭素材面板
  React.useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (picking) setPicking(null)
      else if (useFloatingStore.getState().open[ROOM_FURNI_WINDOW_ID]) {
        useFloatingStore.getState().close(ROOM_FURNI_WINDOW_ID)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [picking])

  if (error) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-sm text-muted">
        目录加载失败：{error}
      </div>
    )
  }

  if (!catalog || !room || !model || !layout) {
    return (
      <div className="grid h-full place-items-center gap-3">
        <div className="flex flex-col items-center gap-2 text-pkt-text-mute">
          <SpinnerRoot size="sm" color="accent" />
          <span className="text-xs">正在准备房间数据…</span>
        </div>
      </div>
    )
  }

  // 整图房（ifDefaultImg=1）要有场景图才能进编辑器；TMX 场景房（=2）留给 M2b
  if (room.ifDefaultImg === 1 && !room.scene) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="max-w-sm">
          <p className="text-sm font-medium">{room.name} 缺少整图资源</p>
          <p className="mt-1 text-xs text-pkt-text-mute">
            官方没有发布这类房型的 `roomimg_{room.type}` 场景图。
          </p>
          <ButtonRoot className="mt-3" size="sm" variant="outline" onPress={() => setRoomType(101)}>
            切到基本房型1
          </ButtonRoot>
        </div>
      </div>
    )
  }

  if (room.ifDefaultImg === 2) {
    return (
      <TmxSceneView
        room={room}
        catalog={catalog}
        stage={stage}
        zoom={zoom}
        onBack={() => setRoomType(101)}
      />
    )
  }

  /** 从搭配存档加一个角色：直接把存档里的 worn/face 搬过来。 */
  const addActorFromSave = (saveId: string): void => {
    const save = outfitSaves.find((item) => item.id === saveId)
    const data = save?.data as
      { sex?: 1 | 2; faceCode?: string | null; worn?: Record<string, string> } | undefined
    if (!data) return
    store.addActor({
      uid: nextFurniUid(),
      kind: 'player',
      outfit: {
        sex: data.sex === 1 ? 1 : 2,
        faceCode: data.faceCode ?? null,
        worn: data.worn ?? {},
      },
      x: Math.floor(model.cols / 2),
      y: Math.floor(model.rows / 2),
      dir: 3,
      clipId: 'stand',
      seat: null,
    })
  }

  const addCustomActor = (id: string): void => {
    store.addActor({
      uid: nextFurniUid(),
      kind: 'custom',
      customActor: id,
      x: Math.floor(model.cols / 2),
      y: Math.floor(model.rows / 2),
      dir: 3,
      clipId: null,
      seat: null,
    })
  }

  const addNpc = (code: string): void => {
    store.addActor({
      uid: nextFurniUid(),
      kind: 'npc',
      npcCode: code,
      x: Math.floor(model.cols / 2),
      y: Math.floor(model.rows / 2),
      dir: 3,
      clipId: 'stand',
      seat: null,
    })
  }

  /**
   * 让角色走到家具跟前并交互：
   * 找最近的可走交互点 → A* 走过去 → 到点后执行（开门 / 坐下 / 换状态）。
   */
  const interact = (actorUid: string, furniUid: string): void => {
    const actor = store.actors.find((item) => item.uid === actorUid)
    const furni = store.furni.find((item) => item.uid === furniUid)
    const def = furni ? catalog?.furniture.find((item) => item.code === furni.code) : null
    if (!actor || !furni || !def) return

    const interaction = resolveInteraction(def)
    if (interaction.kind === 'none') {
      store.select(furniUid)
      return
    }

    const dims = furniDims(def, furni.dir)
    const points = enterPoints(model, { x: furni.x, y: furni.y }, dims.rows, dims.cols)
    const target = nearestEnterPoint(points, { x: actor.x, y: actor.y })
    if (!target) return

    const alreadyThere = actor.x === target.x && actor.y === target.y
    const arrived = (): void => {
      const outcome = applyInteraction(interaction, furni.state)
      store.setFurniState(furni.uid, outcome.state)
      store.setActorClip(actor.uid, outcome.actor.clip)
      store.setActorSeat(actor.uid, outcome.actor.seat ? { uid: furni.uid, surfaceIndex: 0 } : null)
      // 坐下/躺下才把角色移到家具格上；开门之类的交互站原地
      if (outcome.actor.seat) store.placeActor(actor.uid, furni.x, furni.y, actor.dir)
    }

    if (alreadyThere) {
      arrived()
      return
    }

    const path = findPath(model, { x: actor.x, y: actor.y }, target)
    if (path.length === 0) return
    setPendingInteraction({ actorUid, furniUid })
    setWalkCommand({ uid: actorUid, path, seq: walkSeq.current + 1 })
    walkSeq.current += 1
  }

  const placeWallAt = (cell: { x: number; y: number }): void => {
    if (!picking) return
    // 挂墙件：找到该格对应的墙板变体；没有墙板就不落
    const variant = wallVariantAt(model.structure, cell.x, cell.y)
    if (!variant) return
    const occupied = store.furni.some(
      (item) =>
        item.wallLoc &&
        item.wallLoc.x === cell.x &&
        item.wallLoc.y === cell.y &&
        item.wallLoc.variant === variant,
    )
    if (occupied) return

    store.addFurni({
      uid: nextFurniUid(),
      code: picking.code,
      x: cell.x,
      y: cell.y,
      dir: 3,
      wallLoc: { x: cell.x, y: cell.y, variant },
      surface: null,
      state: 0,
    })
    setPicking(null)
  }

  const placeAt = (cell: { x: number; y: number }): void => {
    if (!picking) return
    const fresh = new RoomModel({ rows: model.rows, cols: model.cols, map: model.structure })
    for (const instance of store.furni) {
      const def = catalogWithCustom?.furniture.find((item) => item.code === instance.code)
      if (!def) continue
      const dims = furniDims(def, instance.dir)
      fresh.occupy(instance.uid, footprint(instance.x, instance.y, dims.rows, dims.cols))
    }
    // 叠放：鼠标所在的家具支持 overMe 时，吸附到最近空槽（仅限可叠放的物件）
    const hostUid = fresh.occupantAt(cell.x, cell.y)
    const host = hostUid ? store.furni.find((item) => item.uid === hostUid) : null
    const hostDef = host
      ? (catalogWithCustom?.furniture.find((item) => item.code === host.code) ?? null)
      : null
    if (host && hostDef && hostDef.otherOverMe > 0 && picking.meOverOther) {
      const used = new Set(
        store.furni
          .filter((item) => item.surface?.parent === host.uid)
          .map((item) => item.surface?.index ?? -1),
      )
      const slots = furniSurfaceSlots(hostDef, host.dir, 0)
      const total = Math.max(slots.length, 1)
      let index = -1
      for (let i = 0; i < total; i += 1) {
        if (!used.has(i)) {
          index = i
          break
        }
      }
      if (index >= 0) {
        store.addFurni({
          uid: nextFurniUid(),
          code: picking.code,
          x: host.x,
          y: host.y,
          dir: host.dir,
          wallLoc: null,
          surface: { parent: host.uid, index },
          state: 0,
        })
        setPicking(null)
        return
      }
    }

    const dims = furniDims(picking, 3)
    if (!fresh.canPlace(cell.x, cell.y, dims.rows, dims.cols)) return

    store.addFurni({
      uid: nextFurniUid(),
      code: picking.code,
      x: cell.x,
      y: cell.y,
      dir: 3,
      wallLoc: null,
      surface: null,
      state: 0,
    })
    setPicking(null)
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-pkt-border px-4 py-2">
        <ButtonRoot
          size="sm"
          variant={typeWindowOpen ? 'secondary' : 'ghost'}
          onPress={() => toggleWindow(ROOM_TYPE_WINDOW_ID)}
        >
          房型
        </ButtonRoot>
        <ButtonRoot
          size="sm"
          variant={assetWindowOpen ? 'secondary' : 'ghost'}
          onPress={toggleAssets}
        >
          素材 <span className="ml-1 text-[9px] text-pkt-text-mute">空格</span>
        </ButtonRoot>

        <ExportMenu
          busy={archive.busy}
          onOpenExport={() => toggleWindow(EXPORT_WINDOW_ID)}
          onExportPkg={() => void archive.exportPktRoom()}
          onImportPkg={() => void archive.importPktRoom()}
        />
        <ButtonRoot
          size="sm"
          variant={layerWindowOpen ? 'secondary' : 'ghost'}
          onPress={() => toggleWindow(LAYER_WINDOW_ID)}
        >
          图层
        </ButtonRoot>
        <ButtonRoot
          size="sm"
          variant="ghost"
          isDisabled={archive.busy}
          onPress={() => void archive.saveRoom()}
        >
          保存
        </ButtonRoot>

        <span className="ml-2 text-xs font-medium">{room.name}</span>
        <span className="text-[11px] text-pkt-text-mute">
          {room.cols}×{room.rows} 格 · 家具 {store.furni.length}/{room.maxFurni}
        </span>
        {archive.status ? (
          <span className="text-[11px] text-pkt-text-mute">{archive.status}</span>
        ) : null}
        {notice ? <span className="text-[11px] text-pkt-accent">{notice}</span> : null}

        <div className="ml-auto flex items-center gap-1">
          <ButtonRoot
            size="sm"
            variant="ghost"
            isDisabled={store.past.length === 0}
            onPress={() => store.undo()}
          >
            撤销
          </ButtonRoot>
          <ButtonRoot
            size="sm"
            variant="ghost"
            isDisabled={store.future.length === 0}
            onPress={() => store.redo()}
          >
            重做
          </ButtonRoot>
          <ButtonRoot
            size="sm"
            variant={showGrid ? 'secondary' : 'ghost'}
            onPress={() => setShowGrid((value) => !value)}
          >
            网格
          </ButtonRoot>
          {[1, 2, 3].map((value) => (
            <ButtonRoot
              key={value}
              size="sm"
              variant={zoom === value ? 'secondary' : 'ghost'}
              onPress={() => setZoom(value)}
            >
              {value}×
            </ButtonRoot>
          ))}
        </div>
      </div>

      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-pkt-bg-elev/40 p-3">
        {store.furni.length === 0 && store.actors.length === 0 ? (
          <div className="pointer-events-none absolute inset-x-3 top-1/3 z-10 mx-auto flex max-w-md flex-col items-center gap-1 rounded-xl border border-pkt-border/60 bg-pkt-bg/80 px-4 py-3 text-center backdrop-blur-sm">
            <p className="text-sm font-medium text-pkt-text">
              {room.ifDefaultImg === 1 || room.tmx ? '这是一间成品场景房' : '空房间：先挑家具'}
            </p>
            <p className="text-[11px] text-pkt-text-mute">
              按 <kbd className="rounded bg-pkt-panel px-1">空格</kbd> 打开素材面板，
              点「人物」标签可以放角色/NPC；Shift + 点击可多选。
            </p>
          </div>
        ) : null}
        {store.selection.length > 1 ? (
          <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex justify-center">
            <SelectionBar
              store={store}
              catalog={catalogWithCustom ?? catalog}
              onStack={() => void stackOntoSelected()}
            />
          </div>
        ) : null}
        <RoomCanvas
          catalog={catalogWithCustom ?? catalog}
          room={room}
          model={model}
          layout={layout}
          stage={stage}
          deco={deco}
          sceneImage={sceneImage}
          zoom={zoom}
          showGrid={showGrid}
          scene={{
            furni: store.furni,
            actors: store.actors,
            selected: store.selected,
            selection: store.selection,
            selectedActor: store.selectedActor,
            picking,
          }}
          onPlace={placeAt}
          onPlaceWall={placeWallAt}
          onSelect={store.select}
          onToggleSelect={store.toggleSelect}
          onDrawOrder={setDrawOrder}
          onSelectMany={store.selectMany}
          onMoveMany={store.moveSelection}
          selection={store.selection}
          onMove={(uid, cell) => store.moveFurni(uid, cell.x, cell.y)}
          onHover={setHover}
          onActorStep={(uid, cell, dir) => {
            const current = store.actors.find((item) => item.uid === uid)
            if (current?.seat) {
              store.setActorSeat(uid, null)
              store.setActorClip(uid, null)
            }
            store.placeActor(uid, cell.x, cell.y, dir)
          }}
          onSelectActor={store.selectActor}
          onActorPlace={(uid, cell, dir) => store.placeActor(uid, cell.x, cell.y, dir)}
          onInteract={interact}
          onActorArrived={(uid) => {
            const pending = pendingInteraction
            if (!pending || pending.actorUid !== uid) return
            setPendingInteraction(null)
            interact(uid, pending.furniUid)
          }}
          walkCommand={walkCommand}
        />

        <FurniEditor
          furni={selected}
          def={selectedDef}
          onSetDir={(dir) => selected && store.setFurniDir(selected.uid, dir)}
          onSetState={(state) => selected && store.setFurniState(selected.uid, state)}
          onRemove={() => {
            if (!selected) return
            store.removeFurni(selected.uid)
            useFloatingStore.getState().close(FURNI_EDITOR_WINDOW_ID)
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-pkt-border px-4 py-1.5 text-[11px] text-pkt-text-mute">
        <span>地板 {model.floorCells().length} 格</span>
        <span>{deco.status}</span>
        <span>
          悬停 {hover ? `格 (${hover.x}, ${hover.y})` : '移动鼠标'} · 点家具编辑 · 空格开家具面板
        </span>
        {picking ? (
          <span className="text-pkt-accent">放置中：{picking.name}（点画布落地 / Esc 取消）</span>
        ) : null}
      </div>

      <RoomTypePanel
        rooms={rooms}
        roomType={room.type}
        onSelect={(type) => {
          setRoomType(type)
          setHover(null)
        }}
      />

      {selectedActorInstance ? (
        <ActorActionPanel
          catalog={catalogWithCustom ?? catalog}
          actor={selectedActorInstance}
          onClip={(clipId) => store.setActorClip(selectedActorInstance.uid, clipId)}
          onDir={(dir) =>
            store.placeActor(
              selectedActorInstance.uid,
              selectedActorInstance.x,
              selectedActorInstance.y,
              dir,
            )
          }
          onRemove={() => store.removeActor(selectedActorInstance.uid)}
          onOpenMotionEditor={() => useFloatingStore.getState().openWindow(MOTION_EDITOR_WINDOW_ID)}
        />
      ) : null}
      <LayerPanel
        store={store}
        catalog={catalogWithCustom ?? catalog}
        drawOrder={drawOrder}
        onFocus={(item) => store.select(item.uid)}
      />
      <ExportPanel
        settings={exportSettings}
        onChange={(patch) => setExportSettings((current) => ({ ...current, ...patch }))}
        onExportPng={() => void exporter.exportPng(exportSettings)}
        onExportGif={() => void exporter.exportGif(exportSettings)}
        onExportVideo={() => void exporter.exportVideo(exportSettings)}
        onExportFrames={() => void exporter.exportFrames(exportSettings)}
        busy={exporter.busy}
        status={exporter.status}
        ffmpegReady={exporter.ffmpegReady}
        lastPath={exporter.lastPath}
      />
      <CustomFurniImport />
      <CustomActorImport />
      <MotionEditor catalog={catalog} actorOutfit={previewOutfit} />

      <FloatingWindow
        id={ROOM_FURNI_WINDOW_ID}
        title="素材"
        width={440}
        defaultPosition={{ x: 300, y: 120 }}
      >
        <div className="flex h-[64vh] flex-col">
          <div className="flex shrink-0 gap-1 border-b border-pkt-border px-2 pt-1.5 pb-1.5">
            {(
              [
                ['furni', '家具'],
                ['actor', '人物'],
              ] as const
            ).map(([key, label]) => (
              <ButtonRoot
                key={key}
                size="sm"
                variant={assetTab === key ? 'secondary' : 'ghost'}
                onPress={() => setAssetTab(key)}
              >
                {label}
              </ButtonRoot>
            ))}
          </div>

          {assetTab === 'furni' ? (
            <div className="min-h-0 flex-1 p-2">
              <FurniLibrary
                catalog={catalogWithCustom ?? catalog}
                pickingCode={picking?.code ?? null}
                search={search}
                onSearchChange={setSearch}
                allSearch={allSearch}
                onToggleAllSearch={() => setAllSearch((value) => !value)}
                searchRef={searchRef}
                onPick={(item) =>
                  setPicking((current) => (current?.code === item.code ? null : item))
                }
              />
            </div>
          ) : (
            <div className="pkt-scroll min-h-0 flex-1 overflow-y-auto p-2">
              <ActorPanel
                catalog={catalog}
                actors={store.actors}
                selectedActor={store.selectedActor}
                onAdd={addActorFromSave}
                onAddNpc={addNpc}
                onAddCustom={addCustomActor}
                onSelect={store.selectActor}
                onRemove={store.removeActor}
              />
            </div>
          )}
        </div>
      </FloatingWindow>
    </div>
  )
}

/**
 * TMX 场景房：合成整张地图铺满舞台（只读）。
 *
 * 这类房间的坐标是地图瓦片坐标系，与「房间格」不是一套，官方也不可装修。
 */
function TmxSceneView({
  room,
  catalog,
  stage,
  zoom,
  onBack,
}: {
  room: CatalogRoomDef
  catalog: Catalog
  stage: { width: number; height: number }
  zoom: number
  onBack: () => void
}): React.ReactElement {
  const [bitmap, setBitmap] = React.useState<ImageBitmap | null>(null)
  const [status, setStatus] = React.useState('正在合成场景…')
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setBitmap(null)
    setStatus('正在合成场景…')
    void loadTmxScene(room, catalog.assets, stage)
      .then((image) => {
        if (cancelled) return
        setBitmap(image)
        setStatus(image ? '场景已合成（TMX）' : '缺少地图资源')
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatus(`场景合成失败：${error instanceof Error ? error.message : String(error)}`)
        }
      })
    return () => {
      cancelled = true
    }
  }, [room, catalog.assets, stage])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !bitmap) return
    const ratio = window.devicePixelRatio || 1
    const desired = stage.width * (zoom / 2)
    const scale = Math.max(1, Math.round((desired * ratio) / stage.width))
    canvas.width = stage.width * scale
    canvas.height = stage.height * scale
    canvas.style.width = `${canvas.width / ratio}px`
    canvas.style.height = `${canvas.height / ratio}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, stage.width, stage.height)
    ctx.drawImage(bitmap, 0, 0)
  }, [bitmap, stage, zoom])

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-pkt-border px-4 py-2">
        <span className="text-xs font-medium">{room.name}</span>
        <span className="text-[11px] text-pkt-text-mute">
          {room.cols}×{room.rows} 格 · TMX 场景房（只读）
        </span>
        <div className="ml-auto">
          <ButtonRoot size="sm" variant="outline" onPress={onBack}>
            切到基本房型1
          </ButtonRoot>
        </div>
      </div>
      <div className="pkt-scroll flex-1 overflow-auto bg-pkt-bg-elev/40 p-4">
        <div className="inline-block">
          <canvas
            ref={canvasRef}
            className="block rounded-pkt border border-pkt-border bg-pkt-bg"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>
      </div>
      <div className="border-t border-pkt-border px-4 py-1.5 text-[11px] text-pkt-text-mute">
        {status} · 这类场景用地图瓦片坐标系，暂不支持摆家具（官方同样不可装修）
      </div>
    </div>
  )
}

interface AssetState extends Partial<DecoAssets> {
  status: string
}

function useDecoAssets(catalog: Catalog | null, room: CatalogRoomDef | null): AssetState {
  const [state, setState] = React.useState<AssetState>({ status: '素材未加载' })

  React.useEffect(() => {
    if (!catalog || !room) return
    let cancelled = false
    setState({ status: '素材加载中…' })

    void loadDecoAssets(catalog, room)
      .then((assets) => {
        if (cancelled) return
        const parts = [
          assets.floor ? '地板' : null,
          assets.wall ? '墙纸' : null,
          assets.door ? '门' : null,
        ].filter(Boolean)
        setState({ ...assets, status: `素材 ${parts.join(' / ') || '无'}` })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({
          status: `素材加载失败：${error instanceof Error ? error.message : String(error)}`,
        })
      })

    return () => {
      cancelled = true
    }
  }, [catalog, room])

  return state
}

/** 整图房型的场景图：一次性加载，切房型时重新取。 */
function useSceneImage(
  room: CatalogRoomDef | null,
  layout: { image: { x: number; y: number } } | null,
): { bitmap: ImageBitmap; x: number; y: number } | null {
  const [state, setState] = React.useState<{
    bitmap: ImageBitmap
    x: number
    y: number
  } | null>(null)

  React.useEffect(() => {
    if (!room?.scene || !layout) {
      setState(null)
      return
    }
    let cancelled = false
    void loadSceneArt(room.scene)
      .then((bitmap) => {
        if (cancelled || !bitmap) return
        setState({ bitmap, x: layout.image.x, y: layout.image.y })
      })
      .catch(() => {
        if (!cancelled) setState(null)
      })
    return () => {
      cancelled = true
    }
  }, [room, layout])

  return state
}

function buildModel(room: CatalogRoomDef | null, maps: CatalogRoomMap[]): RoomModel | null {
  if (!room) return null
  const structure = room.defaultStructure
  if (structure > 0) {
    const entry = maps.find((item) => item.type === structure)
    if (entry) {
      return new RoomModel({ rows: room.rows, cols: room.cols, map: decodeRoomMap(entry.map) })
    }
  }
  return new RoomModel({ rows: room.rows, cols: room.cols })
}
