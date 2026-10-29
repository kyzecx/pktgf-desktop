import type { RoomDirection } from '@shared/contract'

import type { GridPoint } from './grid'

/**
 * 房间引擎的运行时类型。
 *
 * 这里刻意与目录（`@shared/contract`）解耦：目录是「官方快照」，
 * 这里是「一份可编辑的场景」，两者之间由 `scene.ts` 装配。
 */

/** 房间格子类型，取自官方 `Zc` 枚举（docs/room-spec.md §2.3）。 */
export const TILE_TYPE = {
  /** 虚空：不可放、不可走 */
  none: 0,
  /** 地板 */
  floor: 1,
  /** 水面 */
  water: 2,
  /** 入水口 */
  enterWater: 20,
  /** 地板上的阻挡 */
  noPass: 100,
  /** 被家具占住 */
  furni: 102,
  /** 花台 */
  platPlant: 103,
  /** 地毯（可踩） */
  rug: 104,
  /** 停止通行 */
  stopPass: 105,
  /** 泳池 */
  swimmingPool: 106,
  /** 农田 / 楼梯 */
  cropLand: 107,
} as const

/** 可放家具的格点集合：地板、地板上的阻挡标记、地毯。 */
export const PLACEABLE_TILES: readonly number[] = [TILE_TYPE.floor, 3, TILE_TYPE.rug]

export interface RoomStage {
  width: number
  height: number
}

/** 房间布局：舞台居中后的地板原点等（docs/room-spec.md §2.2）。 */
export interface RoomLayout {
  /** 地板原点，所有地面物件的像素基准 */
  floorTop: GridPoint
  /** 房间在舞台上的包围盒左上角 */
  originX: number
  originY: number
  /** 包围盒尺寸（含墙高） */
  boxWidth: number
  boxHeight: number
}

/** 场景里的一个家具实例。 */
export interface FurniInstance {
  /** 场景内唯一 id */
  uid: string
  /** 目录 code；自定义包为 `custom:<id>` */
  code: string
  /** 格点 top（官方语义：占地的左上角） */
  x: number
  y: number
  dir: RoomDirection
  /**
   * 挂墙物件的落点：挂在哪个地板格所对应的墙面上。
   *
   * 官方用像素槽位 `locP`，但槽位依赖墙纸图尺寸；
   * 这里改挂「格 + 墙面变体」，渲染时按当前墙纸的墙板尺寸居中，换墙纸不会丢位置。
   */
  wallLoc: { x: number; y: number; variant: 'up' | 'left' | 'right' | 'down' } | null
  /** 叠放在哪个物件的第几个面上 */
  surface: { parent: string; index: number } | null
  /** 官方 furniState：驱动动画/开合，随存档持久化 */
  state: number
  /** 自定义包的运行时定义（官方物件为 undefined，从目录取） */
  custom?: FurniCustomDef
}

/** 自定义家具的最小定义；与官方字段同名，便于走同一套渲染。 */
export interface FurniCustomDef {
  code: string
  name: string
  rows: number
  cols: number
  dirable: 1 | 2 | 4
  symetric: boolean
  baseLoc: string
  surfaceLoc: string | null
  position: number
  usage: number
  meOverOther: boolean
  otherOverMe: 0 | 1 | 2
  behaviour: string | null
  functionType: string | null
  motion: string | null
  animationMode: number
}

/** 角色 / NPC 的动作一步（与官方 motionConfig 同构）。 */
export interface MotionStep {
  duration?: number
  arms?: number
  legs?: number
  hair?: number
  face?: number
  dir?: RoomDirection
  facing?: RoomDirection
  /** 官方配置是 `"x,y"` 字符串，自定义动作可以直接给 `[x, y]` */
  offset?: string | [number, number]
  byDir?: Partial<Record<RoomDirection, { arms?: number; legs?: number }>>
}

/** 一段动作：步骤序列 + 是否循环。 */
export interface MotionClip {
  id: string
  name: string
  loop: boolean
  steps: MotionStep[]
}

/** 场景里的一个角色（玩家形象或 NPC）。 */
export interface ActorInstance {
  uid: string
  /** player=搭配存档形象；npc=游戏 NPC；custom=导入的角色包 */
  kind: 'player' | 'npc' | 'custom'
  /** 玩家形象：直接复用搭配存档的结构 */
  outfit?: { sex: 1 | 2; faceCode: string | null; worn: Record<string, string> }
  /** NPC：目录里的 code */
  npcCode?: string
  /** 自定义角色包 id */
  customActor?: string
  x: number
  y: number
  dir: RoomDirection
  /** 当前动作 id；null = 待机 */
  clipId: string | null
  /** 坐下/躺下依附的家具 */
  seat: { uid: string; surfaceIndex: number } | null
}

/** 一份可保存的房间场景。 */
export interface RoomScene {
  version: 1
  room: RoomSpec
  furni: FurniInstance[]
  actors: ActorInstance[]
  clips: MotionClip[]
  camera: { zoom: number; x: number; y: number }
}

export interface RoomSpec {
  type: number
  category: number
  rows: number
  cols: number
  /** 地板 / 墙纸 / 门 / 背景的 deco type */
  tile: number
  wall: number
  door: number
  bg: number
  /** 目录里没有对应走格图时用的内联结构图 */
  mapOverride?: string
}
