export { directionBetween } from './grid'
export {
  DIRECTIONS,
  DIR_VECTORS,
  TILE_HEIGHT,
  TILE_WIDTH,
  directionFromDelta,
  footprint,
  footprintBounds,
  footprintCells,
  footprintInside,
  gridToPixel,
  inFootprint,
  mirrorDirection,
  nextDirection,
  normalizeDirection,
  pixelToGrid,
  pixelToGridIndex,
  tileCenter,
  tileDiamond,
} from './grid'
export type { Footprint, GridPoint, PixelPoint } from './grid'

export {
  FLOOR_X_SHIFT,
  RoomModel,
  adaptStructure,
  computeRoomLayout,
  computeSceneLayout,
  decodeRoomMap,
  fitStage,
  floorCellOrigin,
  pixelToCell,
  roomBoxSize,
} from './room'

export { buildFloorPieces, floorVariantAt } from './floor'
export type { FloorPiece, FloorVariant } from './floor'
export type { SceneLayout } from './room'
export { buildWallPieces, isWallLeft, isWallRight, isWallTop, wallVariantAt } from './wall'
export type { WallPiece, WallVariant } from './wall'
export { SortMgr2D, isJustBack } from './sort'

export {
  ACTOR_HEIGHT,
  ACTOR_WIDTH,
  ARM_FRAMES,
  HEAD_FRAMES,
  LEG_FRAMES,
  actorCell,
  actorFrameCount,
  actorFrontFacing,
  actorMirrored,
  composeRoomActor,
  cropActorCell,
  idlePose,
} from './actor'
export type { ActorPartCell, ActorPose, RoomActorInput } from './actor'

export {
  DEFAULT_STEP_DURATION,
  clipDuration,
  clipsFromCatalog,
  evaluateClip,
  evaluateNpcMotion,
  parseSelfMotion,
  pickSelfMotion,
  lieClip,
  makeClip,
  parseOffset,
  resolveStepFrames,
  sitClip,
  standClip,
  walkClip,
} from './motion'
export type { PoseSample } from './motion'

export {
  CUSTOM_CODE_PREFIX,
  DEFAULT_CUSTOM_META,
  customCode,
  customId,
  isCustomCode,
  suggestBaseLoc,
  synthesizeFurniDef,
  validateCustomFurni,
} from './custom-furni'
export type { CustomFurniMeta, ValidationResult } from './custom-furni'

export {
  applyInteraction,
  enterPoints,
  facingForEnter,
  nearestEnterPoint,
  parseBehaviour,
  parseBehaviours,
  resolveInteraction,
} from './interact'
export type { BehaviourVO, InteractionDef, InteractionKind, InteractionOutcome } from './interact'

export { findPath } from './path'
export type { WalkStep } from './path'
export type { Sortable, SortProvider } from './sort'

export {
  frameSuffix,
  furniAnchors,
  furniOrigin,
  furniDims,
  furniMaskSymbol,
  furniSurfaceSlots,
  maskOrigin,
  parsePointList,
  parseSurfaceLoc,
  resolveFurniSprite,
  surfaceItemOrigin,
  wallItemOrigin,
} from './furni'
export type { FurniAnchors, FurniMeta, FurniSpriteRef } from './furni'

export { buildWallPanelRects, composeStaticLayer, doorPlacement, orientDoor } from './scene'
export { renderFrame } from './frame'
export { canStackOn, footprintRect, normalizeRect, rectsOverlap, selectInRect } from './selection'
export type { CellRect, FootprintItem } from './selection'
export {
  PKTROOM_FORMAT,
  PKTROOM_VERSION,
  deserializeRoom,
  packPktRoom,
  serializeRoom,
  unpackPktRoom,
} from './save'
export type { PktRoomAssets, PktRoomFile, RestoreResult, RoomSaveData } from './save'
export type { ExportActor, ExportFrameInput, ExportFurni } from './frame'
export { parseTmx } from './tmx'
export type { TmxLayer, TmxMap, TmxTileset } from './tmx'
export { buildTileTypes, buildTmxScene, composeTmxImage } from './scene-tmx'
export type { TmxAtlases, TmxScene } from './scene-tmx'
export type { FloorAssets, StaticLayerInput, StaticLayerResult, WallAssets } from './scene'

export { PLACEABLE_TILES, TILE_TYPE } from './types'
export type {
  ActorInstance,
  FurniCustomDef,
  FurniInstance,
  MotionClip,
  MotionStep,
  RoomLayout,
  RoomScene,
  RoomSpec,
  RoomStage,
} from './types'
