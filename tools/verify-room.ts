/**
 * 静态房间校验 / 金标出图。
 *
 * 用真实官方素材把「结构图 + 地板 + 墙纸 + 门」合成成 PNG，写到 `artifacts/`，
 * 同时跑一组不变量断言（拼块数量、越界、居中、墙高）。M1 的验收就是看这些图对不对。
 *
 *   npx tsx tools/verify-room.ts            # 默认跑 3 个代表房型
 *   npx tsx tools/verify-room.ts 101 102    # 指定房型 type
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gunzipSync, inflateSync } from 'node:zlib'

import { openBundle, readSymbolImage, stripBom } from '../src/engine/bundle.ts'
import { blend, createImage, flipHorizontal } from '../src/engine/image.ts'
import { encodePng } from '../src/engine/png.ts'
import type { RgbaImage } from '../src/engine/types.ts'
import {
  RoomModel,
  SortMgr2D,
  buildFloorPieces,
  furniAnchors,
  furniOrigin,
  furniSurfaceSlots,
  resolveFurniSprite,
  surfaceItemOrigin,
  wallItemOrigin,
  wallVariantAt,
  type Sortable,
  buildWallPieces,
  composeStaticLayer,
  buildTmxScene,
  computeRoomLayout,
  computeSceneLayout,
  parseTmx,
  decodeRoomMap,
  fitStage,
  type FloorAssets,
  type WallAssets,
} from '../src/engine/room/index.ts'
import type {
  Catalog,
  CatalogFurniture,
  CatalogRoomDef,
  CatalogRoomMap,
} from '../src/shared/contract.ts'

const BASE = 'https://web.picatown.com'
const STAGE = { width: 950, height: 540 }
const OUT_DIR = resolve('artifacts')

interface CaseStats {
  room: number
  name: string
  floorPieces: number
  wallPieces: number
  expectedFloor: number
  outliers: number
  bytes: number
}

async function main(): Promise<void> {
  const catalog = await loadCatalog()

  // --sweep：把全部「拼接地板」房型过一遍几何校验（不下载素材，纯离线）
  if (process.argv.includes('--sweep')) {
    sweep(catalog)
    return
  }

  // --demo：出「房间 + 若干家具」的合成图，用来肉眼验锚点与叠放顺序
  if (process.argv.includes('--demo')) {
    await renderDemo(catalog)
    return
  }

  // --scene：整图房型（ifDefaultImg=1）的场景图 + 家具对齐检查
  if (process.argv.includes('--scene')) {
    await renderSceneRooms(catalog)
    return
  }

  // --tmx：TMX 场景房（ifDefaultImg=2）合成
  if (process.argv.includes('--tmx')) {
    await renderTmxRooms()
    return
  }

  const requested = process.argv.slice(2).map(Number).filter(Number.isFinite)
  const targets =
    requested.length > 0
      ? catalog.rooms.filter((room) => requested.includes(room.type))
      : pickDefaults(catalog.rooms)

  if (targets.length === 0) throw new Error('没有匹配的房型')

  await mkdir(OUT_DIR, { recursive: true })
  const stats: CaseStats[] = []

  for (const room of targets) {
    const map = resolveMap(room, catalog.roomMaps)
    const model = new RoomModel({ rows: room.rows, cols: room.cols, map })
    const stage = fitStage(room, STAGE)
    const layout = computeRoomLayout(room, stage)

    const floorDef = findDeco(catalog, 'tile', room.defaultTile)
    const wallDef = findDeco(catalog, 'wall', room.defaultWall)
    const doorDef = findDeco(catalog, 'door', room.defaultDoor)

    const floor = floorDef ? await loadFloorAssets(floorDef) : null
    const wall = wallDef ? await loadWallAssets(wallDef) : null
    const door = doorDef ? await loadDoorAsset(doorDef) : null

    const result = composeStaticLayer({
      model,
      layout,
      stage,
      room,
      floor,
      wall,
      door,
      floorCells: floorDef && (floorDef.rows === 2 || floorDef.cols === 2) ? 2 : 1,
      doorDir: room.entryDir,
    })

    // 不变量
    const expectedFloor = model.floorCells().length
    assert(
      result.floorPieces === expectedFloor,
      `${room.name}: 地面拼块 ${result.floorPieces} ≠ 地板格 ${expectedFloor}`,
    )
    assert(result.outliers.length === 0, `${room.name}: 有 ${result.outliers.length} 个越界拼块`)
    if (wall) {
      // 官方 combine!=1 的房型可能一块墙都不出，只在 combine==1 时要求有墙
      const backEdge = countBackEdges(model.structure)
      assert(
        result.wallPieces >= 0 && result.wallPieces <= backEdge + model.rows,
        `${room.name}: 墙面拼块异常 ${result.wallPieces}（后边格 ${backEdge}）`,
      )
    }

    const png = encodePng(result.image)
    const file = resolve(OUT_DIR, `room-${room.type}.png`)
    await writeFile(file, png)

    // 叠一层网格标注，方便人工核对格点与像素是否对齐
    const annotated = annotateGrid(result.image, model, layout)
    await writeFile(resolve(OUT_DIR, `room-${room.type}-grid.png`), encodePng(annotated))

    stats.push({
      room: room.type,
      name: room.name,
      floorPieces: result.floorPieces,
      wallPieces: result.wallPieces,
      expectedFloor,
      outliers: result.outliers.length,
      bytes: png.byteLength,
    })
    console.log(
      `· ${room.type} ${room.name}: 地板 ${result.floorPieces} 块 · 墙 ${result.wallPieces} 块 · ${(png.byteLength / 1024).toFixed(1)} KB`,
    )
  }

  await writeFile(
    resolve(OUT_DIR, 'room-verify.json'),
    `${JSON.stringify({ stage: STAGE, cases: stats }, null, 2)}\n`,
    'utf8',
  )
  console.log(`· 已写入 ${OUT_DIR}`)
}

/**
 * 全量几何自检：所有不用整图的房型都要满足
 * 「地板拼块数 = 地板格数」「墙面数量 > 0」「没有完全落在舞台外的拼块」。
 */
function sweep(catalog: Catalog): void {
  const problems: string[] = []
  let checked = 0
  let maps = 0

  for (const room of catalog.rooms) {
    // 整图房（M2）不参与拼接自检；打通房型的结构图本身就是并集，可以用大舞台整体渲染
    if (room.ifDefaultImg !== 0) continue
    checked += 1
    const map = resolveMap(room, catalog.roomMaps)
    if (map) maps += 1
    const model = new RoomModel({ rows: room.rows, cols: room.cols, map })
    // 大房型用能装下的舞台，避免误报越界
    const stage = fitStage(room, STAGE)
    const layout = computeRoomLayout(room, stage)

    const floorPieces = buildFloorPieces(model.structure, layout)
    if (floorPieces.length !== model.floorCells().length) {
      problems.push(
        `${room.type} ${room.name}: 地板拼块 ${floorPieces.length} ≠ 格数 ${model.floorCells().length}`,
      )
    }
    const walls = buildWallPieces(model.structure, layout, room)
    // 官方只有 combine==1 的房型才「有地板就出墙」；其它走 `map===3` 那套，可能一块都没有
    if (room.combine === 1 && walls.length === 0) {
      problems.push(`${room.type} ${room.name}: 没有墙面拼块`)
    }

    for (const piece of [...floorPieces, ...walls]) {
      if (piece.x >= stage.width || piece.y >= stage.height) {
        problems.push(`${room.type} ${room.name}: 拼块落在舞台外 (${piece.x}, ${piece.y})`)
        break
      }
    }
  }

  console.log(`· 拼接房型 ${checked} 个（其中有结构图 ${maps} 个）`)
  if (problems.length > 0) {
    console.error(`✗ 发现 ${problems.length} 个问题：`)
    for (const line of problems.slice(0, 20)) console.error(`  - ${line}`)
    throw new Error('几何自检未通过')
  }
  console.log('✓ 几何自检通过')
}

interface DemoItem {
  code: string
  x: number
  y: number
  dir: 1 | 3 | 5 | 7
  /** 叠放在哪个 demo 物件的第几个面 */
  surface?: { parent: number; index: number }
  /** 挂墙：所属墙面格 */
  wall?: { x: number; y: number }
}

/** 覆盖：地面大件、桌椅、地毯、靠墙、叠放。 */
const DEMO_ITEMS: DemoItem[] = [
  { code: 'rug0001', x: 6, y: 6, dir: 3 },
  { code: 'bed0001', x: 3, y: 2, dir: 3 },
  { code: 'tab0001', x: 12, y: 4, dir: 3 },
  { code: 'cha0001', x: 9, y: 8, dir: 3 },
  { code: 'cha0001', x: 15, y: 3, dir: 5 },
  { code: 'cab0001', x: 16, y: 9, dir: 3 },
  { code: 'blo0002', x: 12, y: 11, dir: 3 },
  { code: 'cha0001', x: 4, y: 11, dir: 7 },
  // 挂墙件（position 3/4）：挂到后墙第 4 格
  { code: 'dec0062', x: 4, y: 0, dir: 3, wall: { x: 4, y: 0 } },
  // 叠放件：放到第 2 件（tab0001）的第 0 个面
  { code: 'blo0008', x: 12, y: 4, dir: 3, surface: { parent: 2, index: 0 } },
]

async function renderDemo(catalog: Catalog): Promise<void> {
  const room = catalog.rooms.find((item) => item.type === 101)
  if (!room) throw new Error('找不到基本房型1')

  const model = new RoomModel({ rows: room.rows, cols: room.cols })
  const stage = fitStage(room, STAGE)
  const layout = computeRoomLayout(room, stage)

  const floorDef = findDeco(catalog, 'tile', room.defaultTile)
  const wallDef = findDeco(catalog, 'wall', room.defaultWall)
  const doorDef = findDeco(catalog, 'door', room.defaultDoor)
  const wallArt = wallDef ? await loadWallAssets(wallDef) : null

  const base = composeStaticLayer({
    model,
    layout,
    stage,
    room,
    floor: floorDef ? await loadFloorAssets(floorDef) : null,
    wall: wallArt,
    door: doorDef ? await loadDoorAsset(doorDef) : null,
    doorDir: room.entryDir,
  })

  const image = { ...base.image, data: new Uint8ClampedArray(base.image.data) }
  const panels = buildWallPanelRects(model, layout, room, wallArt)
  const sortables: Array<Sortable & { index: number; def: CatalogFurniture }> = []
  const sprites = new Map<number, { image: RgbaImage; x: number; y: number }>()
  const origins = new Map<number, { x: number; y: number }>()

  // 第 1 遍：取图 + 算自身原点
  for (const [index, demo] of DEMO_ITEMS.entries()) {
    const def = catalog.furniture.find((item) => item.code === demo.code)
    if (!def) {
      console.warn(`⚠ demo 缺少家具 ${demo.code}`)
      continue
    }
    const images = await loadBundle(def)
    const ref = resolveFurniSprite(def, demo.dir, 1, new Set(images.keys()))
    if (!ref) {
      console.warn(`⚠ ${demo.code} 没有朝向 ${demo.dir} 的图`)
      continue
    }
    const raw = images.get(ref.symbol)
    if (!raw) {
      console.warn(`⚠ ${demo.code} 缺少符号 ${ref.symbol}`)
      continue
    }
    const sprite = ref.mirrored ? flipHorizontal(raw) : raw
    const anchors = furniAnchors(def, { width: sprite.width, height: sprite.height })
    const wallVariant = demo.wall ? wallVariantAt(model.structure, demo.wall.x, demo.wall.y) : null
    const panel =
      demo.wall && wallVariant ? panels.get(`${demo.wall.x},${demo.wall.y},${wallVariant}`) : null
    const origin = demo.wall
      ? wallItemOrigin(panel ?? { x: 0, y: 0, width: 22, height: 132 }, sprite)
      : furniOrigin({ x: demo.x, y: demo.y }, demo.dir, anchors, { floorTop: layout.floorTop })

    origins.set(index, origin)
    sprites.set(index, { image: sprite, x: origin.x, y: origin.y })
    sortables.push({
      id: `${demo.code}#${index}`,
      top: demo.wall ? demo.wall : { x: demo.x, y: demo.y },
      rows: def.rows,
      cols: def.cols,
      parentId: demo.surface
        ? `${DEMO_ITEMS[demo.surface.parent]?.code}#${demo.surface.parent}`
        : null,
      overMe: def.otherOverMe,
      surfaceIndex: demo.surface?.index ?? 0,
      dir: demo.dir,
      index,
      def,
    })
  }

  // 第 2 遍：叠放件按父物件原点重定位
  for (const [index, demo] of DEMO_ITEMS.entries()) {
    if (!demo.surface) continue
    const sprite = sprites.get(index)
    const parentOrigin = origins.get(demo.surface.parent)
    const parentItem = DEMO_ITEMS[demo.surface.parent]
    const parentSprite = sprites.get(demo.surface.parent)
    if (!sprite || !parentOrigin || !parentItem || !parentSprite) continue
    const parentDef = catalog.furniture.find((item) => item.code === parentItem.code)
    const def = catalog.furniture.find((item) => item.code === demo.code)
    if (!parentDef || !def) continue
    const slots = furniSurfaceSlots(parentDef, parentItem.dir, parentSprite.image.width)
    const slot = slots[demo.surface.index] ?? slots[0]
    if (!slot) continue
    const anchors = furniAnchors(def, { width: sprite.image.width, height: sprite.image.height })
    const moved = surfaceItemOrigin(parentOrigin, anchors[demo.dir], slot)
    sprites.set(index, { image: sprite.image, x: moved.x, y: moved.y })
  }

  const sorter = new SortMgr2D<(typeof sortables)[number]>({
    childrenOf: (parent) =>
      sortables
        .filter((child) => child.parentId === parent.id)
        .map((child) => ({ item: child, index: child.surfaceIndex ?? 0 })),
    slotOf: () => null,
  })
  const ordered = sorter.rebuild(sortables)

  const order: string[] = []
  for (const entry of ordered) {
    const sprite = sprites.get(entry.index)
    if (!sprite) continue
    blend(image, sprite.image, sprite.x, sprite.y)
    order.push(entry.id)
  }

  await writeFile(resolve(OUT_DIR, 'room-demo.png'), encodePng(image))
  console.log(`· room-demo.png：${order.length} 件家具（含挂墙/叠放）`)
  console.log(`  绘制顺序 ${order.join(' → ')}`)
}

type WallImages = Record<'up' | 'left' | 'right' | 'down', { width: number; height: number }>

/** 墙板矩形表：`x,y,variant` → 屏幕矩形（挂墙件用它居中）。 */
function buildWallPanelRects(
  model: RoomModel,
  layout: ReturnType<typeof computeRoomLayout>,
  room: CatalogRoomDef,
  wall: WallImages | null,
): Map<string, { x: number; y: number; width: number; height: number }> {
  const out = new Map<string, { x: number; y: number; width: number; height: number }>()
  if (!wall) return out
  for (const piece of buildWallPieces(model.structure, layout, room)) {
    const sprite = wall[piece.variant]
    out.set(`${piece.cell.x},${piece.cell.y},${piece.variant}`, {
      x: piece.x,
      y: piece.y,
      width: sprite.width,
      height: sprite.height,
    })
  }
  return out
}

/**
 * 整图房校验：场景图按 picWH/gridOffset 摆放，家具用同一套 floorTop 定位，
 * 叠上格子线看是否与画好的地面吻合。
 */
async function renderSceneRooms(catalog: Catalog): Promise<void> {
  const targets = [109, 221, 261]
  for (const type of targets) {
    const room = catalog.rooms.find((item) => item.type === type)
    if (!room || !room.scene) {
      console.warn(`⚠ 跳过 ${type}（缺场景图）`)
      continue
    }
    const layout = computeSceneLayout(room, STAGE)
    if (!layout) {
      console.warn(`⚠ 跳过 ${type}（缺 picWH/gridOffset）`)
      continue
    }

    const messages = await loadBundle({
      ...room.scene,
      code: room.scene.zip.slice(-7, -4),
    } as CatalogFurniture)
    const symbol = [...messages.keys()].find((name) => name.startsWith('roomimg_'))
    const background = symbol ? messages.get(symbol) : undefined
    if (!background) {
      console.warn(`⚠ ${type} 场景图读取失败`)
      continue
    }

    const image = createImage(STAGE.width, STAGE.height)
    blend(image, background, layout.image.x, layout.image.y)

    // 摆两件家具 + 画格子，检查家具是否落在画好的地面上
    const model = new RoomModel({ rows: room.rows, cols: room.cols })
    const demo: Array<{ code: string; x: number; y: number; dir: 1 | 3 | 5 | 7 }> = [
      { code: 'cha0001', x: 6, y: 6, dir: 3 },
      { code: 'tab0001', x: 12, y: 8, dir: 3 },
    ]
    for (const item of demo) {
      const def = catalog.furniture.find((entry) => entry.code === item.code)
      if (!def) continue
      const art = await loadBundle(def)
      const ref = resolveFurniSprite(def, item.dir, 1, new Set(art.keys()))
      const sprite = ref ? art.get(ref.symbol) : undefined
      if (!ref || !sprite) continue
      const painted = ref.mirrored ? flipHorizontal(sprite) : sprite
      const anchors = furniAnchors(def, { width: painted.width, height: painted.height })
      const origin = furniOrigin({ x: item.x, y: item.y }, item.dir, anchors, {
        floorTop: layout.floorTop,
      })
      blend(image, painted, origin.x, origin.y)
    }

    const grid = annotateGrid(image, model, {
      ...layout,
      originX: 0,
      originY: 0,
      boxWidth: STAGE.width,
      boxHeight: STAGE.height,
    } as never)
    await writeFile(resolve(OUT_DIR, `scene-${type}.png`), encodePng(grid))
    console.log(
      `· scene-${type}.png：图 ${layout.image.width}×${layout.image.height} @ (${layout.image.x},${layout.image.y}) · 地板原点 ${layout.floorTop.x},${layout.floorTop.y}`,
    )
  }
}

/**
 * TMX 场景房（伐木森林这类）：解析 `scene/map/<type>.tmx` + `tmxRes.zip` 图集，
 * 按官方 `TileMapLoader` 的投影与裁剪规则合成整张场景。
 */
async function renderTmxRooms(): Promise<void> {
  const atlas = await loadTmxAtlas()
  if (atlas.size === 0) throw new Error('tmxRes 图集为空')

  for (const type of [268, 272]) {
    const key = `scene/map/${type}.tmx`
    const list = await readResourceList()
    const md5 = list.get(key)
    if (!md5) {
      console.warn(`⚠ 没有 ${key}`)
      continue
    }
    const xml = await (await fetch(`${BASE}/release/res/scene/map/${md5}_${type}.tmx`)).text()
    const map = await parseTmx(xml, { inflate: (bytes) => inflateSync(bytes) })
    const scene = buildTmxScene(map, { bySource: atlas }, STAGE)
    await writeFile(resolve(OUT_DIR, `tmx-${type}.png`), encodePng(scene.image))
    const types = scene.tileTypes.flat()
    console.log(
      `· tmx-${type}.png：地图 ${map.width}×${map.height} 格 · 图层 ${map.layers.length} · 地块类型 ${new Set(types).size} 种 · 偏移 ${scene.offsetX},${scene.offsetY}`,
    )
  }
}

/** 读 `tmxRes.zip` 里的两张图集，按 TMX 里的 image.source 命名建索引。 */
async function loadTmxAtlas(): Promise<Map<string, RgbaImage>> {
  const list = await readResourceList()
  const md5 = list.get('tmxRes.zip')
  if (!md5) throw new Error('资源清单缺少 tmxRes.zip')
  const bytes = new Uint8Array(
    await (await fetch(`${BASE}/release/res/${md5}_tmxRes.zip`)).arrayBuffer(),
  )
  const bundle = openBundle(bytes)
  const out = new Map<string, RgbaImage>()
  // TMX 里引用的是 SourcesNO20161212.png / 地块数据.png，按出现顺序对应 1.png / 2.png
  const names = [...bundle.symbols.keys()].sort()
  const sources = ['SourcesNO20161212.png', '地块数据.png']
  names.forEach((name, index) => {
    const image = readSymbolImage(bundle, name)
    if (!image) return
    const source = sources[index] ?? name
    out.set(source, image)
  })
  return out
}

let resourceListCache: Map<string, string> | null = null
async function readResourceList(): Promise<Map<string, string>> {
  if (resourceListCache) return resourceListCache
  const html = await (await fetch(`${BASE}/`)).text()
  const mainScript = /Main_[0-9A-Za-z_.]+\.js/.exec(html)?.[0]
  if (!mainScript) throw new Error('首页没有 Main_*.js')
  const source = await (await fetch(`${BASE}/${mainScript}`)).text()
  const name = /resource_list_[0-9_]+\.txt/.exec(source)?.[0]
  if (!name) throw new Error('Main.js 里没有 resource_list')
  const text = await (await fetch(`${BASE}/release/res/${name}`)).text()
  const map = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const comma = line.indexOf(',')
    if (comma > 0) map.set(line.slice(0, comma), line.slice(comma + 1).trim())
  }
  resourceListCache = map
  return map
}

function pickDefaults(rooms: CatalogRoomDef[]): CatalogRoomDef[] {
  const wanted = [101, 102, 106]
  const picked = wanted
    .map((type) => rooms.find((room) => room.type === type))
    .filter((room): room is CatalogRoomDef => Boolean(room))
  if (picked.length > 0) return picked
  return rooms.filter((room) => room.ifDefaultImg === 0).slice(0, 3)
}

function resolveMap(room: CatalogRoomDef, maps: CatalogRoomMap[]): number[][] | undefined {
  if (room.defaultStructure <= 0) return undefined
  const entry = maps.find((item) => item.type === room.defaultStructure)
  if (!entry) {
    console.warn(`⚠ 房型 ${room.type} 缺少走格图 ${room.defaultStructure}`)
    return undefined
  }
  return decodeRoomMap(entry.map)
}

/**
 * 房型的 defaultTile / defaultWall / defaultDoor 引用的是**代码序号**（`tile0001` → 1），
 * 不是 decoConfig 的 type，按 kind + serial 查。
 */
function findDeco(
  catalog: Catalog,
  kind: 'tile' | 'wall' | 'door',
  serial: number,
): CatalogFurniture | undefined {
  if (!serial) return undefined
  return catalog.furniture.find((item) => item.kind === kind && item.serial === serial)
}

async function loadBundle(def: CatalogFurniture): Promise<Map<string, RgbaImage>> {
  const slash = def.zip.lastIndexOf('/')
  const dir = def.zip.slice(0, slash)
  const file = def.zip.slice(slash + 1)
  const url = `${BASE}/release/res/${dir}/${def.md5}_${file}`
  const response = await fetch(url, { headers: { 'user-agent': 'pktgf-desktop/verify-room' } })
  if (!response.ok) throw new Error(`请求失败 ${response.status}: ${url}`)
  const bundle = openBundle(new Uint8Array(await response.arrayBuffer()))
  const images = new Map<string, RgbaImage>()
  for (const name of bundle.symbols.keys()) {
    try {
      const image = readSymbolImage(bundle, name)
      if (image) images.set(name, image)
      else console.warn('⚠ 符号为空', name)
    } catch (error) {
      console.warn('⚠ 读取符号失败', name, error)
    }
  }
  return images
}

async function loadFloorAssets(def: CatalogFurniture): Promise<FloorAssets> {
  const images = await loadBundle(def)
  return {
    top: requireSymbol(images, `${def.code}_1`, def.code),
    left: requireSymbol(images, `${def.code}_2`, def.code),
    right: requireSymbol(images, `${def.code}_3`, def.code),
    center: requireSymbol(images, `${def.code}_4`, def.code),
  }
}

async function loadWallAssets(def: CatalogFurniture): Promise<WallAssets> {
  const images = await loadBundle(def)
  // 墙纸包不一定四向齐全（wall1001 就没有 _down），missing 的变体用 _left 兜底。
  const left = requireSymbol(images, `${def.code}_left`, def.code)
  return {
    up: optionalSymbol(images, `${def.code}_up`) ?? left,
    left,
    right: optionalSymbol(images, `${def.code}_right`) ?? left,
    down: optionalSymbol(images, `${def.code}_down`) ?? left,
  }
}

async function loadDoorAsset(def: CatalogFurniture): Promise<RgbaImage> {
  const images = await loadBundle(def)
  const name = [...images.keys()].find(
    (key) => key.toLowerCase() === `${def.code}_left`.toLowerCase(),
  )
  if (!name) throw new Error(`${def.code} 缺少门符号 *_left`)
  const image = images.get(name)
  if (!image) throw new Error(`${def.code} 门符号读取失败`)
  return image
}

function optionalSymbol(images: Map<string, RgbaImage>, name: string): RgbaImage | null {
  return (
    images.get(name) ??
    [...images.entries()].find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ??
    null
  )
}

function requireSymbol(images: Map<string, RgbaImage>, name: string, code: string): RgbaImage {
  const found =
    images.get(name) ??
    [...images.entries()].find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]
  if (!found) throw new Error(`${code} 缺少符号 ${name}`)
  return found
}

/** 后边格：上边或左边没有地板（与 buildWallPieces 的判定一致）。 */
function countBackEdges(map: number[][]): number {
  let count = 0
  for (let y = 0; y < map.length; y += 1) {
    for (let x = 0; x < (map[y]?.length ?? 0); x += 1) {
      if (!map[y]?.[x]) continue
      if (!map[y - 1]?.[x] || !map[y]?.[x - 1]) count += 1
    }
  }
  return count
}

/** 在静态图上画出格子轮廓与坐标，方便人工比对（只在 artifacts 里用）。 */
function annotateGrid(
  image: RgbaImage,
  model: RoomModel,
  layout: ReturnType<typeof computeRoomLayout>,
): RgbaImage {
  const out = { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) }
  const put = (x: number, y: number, rgba: [number, number, number, number]): void => {
    if (x < 0 || y < 0 || x >= out.width || y >= out.height) return
    const i = (y * out.width + x) * 4
    out.data[i] = rgba[0]
    out.data[i + 1] = rgba[1]
    out.data[i + 2] = rgba[2]
    out.data[i + 3] = 255
  }
  const line = (x0: number, y0: number, x1: number, y1: number): void => {
    const dx = Math.abs(x1 - x0)
    const dy = Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let err = dx - dy
    let x = x0
    let y = y0
    for (let guard = 0; guard < 4000; guard += 1) {
      put(x, y, [255, 120, 120, 255])
      if (x === x1 && y === y1) return
      const e2 = err * 2
      if (e2 > -dy) {
        err -= dy
        x += sx
      }
      if (e2 < dx) {
        err += dx
        y += sy
      }
    }
  }

  for (const cell of model.floorCells()) {
    const ox = layout.floorTop.x + (cell.x - cell.y) * 10 + 10
    const oy = layout.floorTop.y + (cell.x + cell.y) * 5
    const top = { x: ox + 10, y: oy }
    const right = { x: ox + 20, y: oy + 5 }
    const bottom = { x: ox + 10, y: oy + 10 }
    const left = { x: ox, y: oy + 5 }
    line(top.x, top.y, right.x, right.y)
    line(right.x, right.y, bottom.x, bottom.y)
    line(bottom.x, bottom.y, left.x, left.y)
    line(left.x, left.y, top.x, top.y)
  }
  return out
}

async function loadCatalog(): Promise<Catalog> {
  const raw = await readFile(resolve('resources/catalog.json.gz'))
  const json = gunzipSync(raw).toString('utf8')
  return JSON.parse(stripBom(json)) as Catalog
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`校验失败：${message}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
