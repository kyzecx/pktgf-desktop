import { blend, createImage, crop, flipHorizontal } from '../image'
import type { RgbaImage } from '../types'

import type { TmxLayer, TmxMap, TmxTileset } from './tmx'

/**
 * TMX 场景合成。
 *
 * 官方 `TileMapLoader.drawMap()`（`SceneTmxVo` 背后的实现）：
 * ```
 * 每个 tile：c = tileWidth*mapW/2 + (a-b)*tileWidth/2 - tilesetTileW/2
 *            y = (a+b)*tileHeight/2 - tilesetTileH/2
 *      gid>0 → 从图集切 tilesetTileW×tilesetTileH
 *      gid<0 → 同上但水平翻转（Tiled 的翻转标记）
 * 最后把整张图居中裁到舞台大小：x = (w - stageW) >> 1, y = (h - stageH) >> 1
 * ```
 * 图层顺序就是 TMX 里的顺序（水面 → 背景 → 雾气 → 1..6 → 阴影…）。
 */

export interface TmxAtlases {
  /** 图案图集（`SourcesNO…png`），按 TMX 里 tileset 的 image.source 索引 */
  bySource: Map<string, RgbaImage>
}

export interface TmxScene {
  image: RgbaImage
  /** 整张地图位图在舞台上的偏移（负值，等于居中裁剪的左上角） */
  offsetX: number
  offsetY: number
  /** 地块类型表（行优先），用于走格与家具判定 */
  tileTypes: number[][]
}

/** 合成整张地图（不裁剪）。 */
export function composeTmxImage(map: TmxMap, atlases: TmxAtlases): RgbaImage {
  const width = map.width * map.tileWidth
  const height = map.height * map.tileHeight
  const canvas = createImage(Math.max(1, width), Math.max(1, height))

  for (const layer of map.layers) {
    if (!layer.visible) continue
    // mapData 是逻辑层，不画
    if (layer.name === 'mapData') continue
    drawLayer(canvas, map, atlases, layer)
  }

  return canvas
}

function drawLayer(canvas: RgbaImage, map: TmxMap, atlases: TmxAtlases, layer: TmxLayer): void {
  for (let y = 0; y < layer.data.length; y += 1) {
    const row = layer.data[y]
    if (!row) continue
    for (let x = 0; x < row.length; x += 1) {
      const raw = row[x] ?? 0
      if (raw === 0) continue

      // 负值 = 水平翻转（Tiled 用高位标记，官方也按 -gid 处理）
      const gid = Math.abs(raw)
      const flipped = raw < 0
      const found = resolveTile(map, gid)
      if (!found) continue

      const { tileset, tileId } = found
      const atlas = atlases.bySource.get(tileset.image.source)
      if (!atlas) continue
      if (tileset.columns <= 0) continue

      const sx = (tileId % tileset.columns) * tileset.tileWidth
      const sy = Math.floor(tileId / tileset.columns) * tileset.tileHeight
      if (sx >= atlas.width || sy >= atlas.height) continue

      const tile = crop(atlas, {
        x: sx,
        y: sy,
        w: Math.min(tileset.tileWidth, atlas.width - sx),
        h: Math.min(tileset.tileHeight, atlas.height - sy),
      })
      const sprite = flipped ? flipHorizontal(tile) : tile

      const dx = Math.floor(
        (map.width * map.tileWidth) / 2 + ((x - y) * map.tileWidth) / 2 - tileset.tileWidth / 2,
      )
      const dy = Math.floor((x + y) * (map.tileHeight / 2) - tileset.tileHeight / 2)
      blend(canvas, sprite, dx, dy)
    }
  }
}

function resolveTile(map: TmxMap, gid: number): { tileset: TmxTileset; tileId: number } | null {
  let best: TmxTileset | null = null
  for (const tileset of map.tilesets) {
    if (gid >= tileset.firstGid && (!best || tileset.firstGid > best.firstGid)) best = tileset
  }
  if (!best) return null
  return { tileset: best, tileId: gid - best.firstGid }
}

/** 把整张地图居中裁到舞台大小，并顺带算出地块类型表。 */
export function buildTmxScene(
  map: TmxMap,
  atlases: TmxAtlases,
  stage: { width: number; height: number },
): TmxScene {
  const full = composeTmxImage(map, atlases)
  const offsetX = (full.width - stage.width) >> 1
  const offsetY = (full.height - stage.height) >> 1

  const x = Math.max(0, offsetX)
  const y = Math.max(0, offsetY)
  const w = Math.min(full.width - x, stage.width)
  const h = Math.min(full.height - y, stage.height)
  const image = crop(full, { x, y, w: Math.max(1, w), h: Math.max(1, h) })

  const scene: TmxScene = {
    image,
    offsetX: -x,
    offsetY: -y,
    tileTypes: buildTileTypes(map),
  }
  return scene
}

/**
 * 从 `mapData` 图层读出每格的地块类型。
 *
 * 官方的逻辑层用「地块数据」图集（tileset.name === 'data'），
 * 每个 tile 的 `type` 属性给出 0/10/20…，负数（翻转标记）同样取绝对值。
 */
export function buildTileTypes(map: TmxMap): number[][] {
  const layer = map.layers.find((entry) => entry.name === 'mapData')
  const rows: number[][] = []
  if (!layer) return rows

  for (const row of layer.data) {
    rows.push(
      row.map((raw) => {
        const gid = Math.abs(raw)
        if (gid === 0) return 0
        const found = resolveTile(map, gid)
        if (!found) return 0
        return found.tileset.types.get(found.tileId) ?? 0
      }),
    )
  }
  return rows
}
