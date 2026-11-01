import {
  layoutSaleSheet,
  type SaleCellLayout,
  type SaleLabelLine,
  type SaleLayoutOptions,
  type SaleRenderItem,
  type SaleSheetLayout,
} from './layout'
import { displayPrice } from './price'

export type { SaleRenderItem } from './layout'
export type { SaleSize, SaleTemplate } from './model'

export interface SaleRenderInput extends SaleLayoutOptions {
  /** 小图展示哪些视角；与布局无关，只影响绘制。 */
  front: boolean
  back: boolean
  items: SaleRenderItem[]
}

const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif'
const BEIGE = '#f3ead4'
const BEIGE_BORDER = '#e2d5b9'
const PRICE = '#b31f36'
const NAME = '#5b5045'
const LABEL_STRIP = '#faf7f0'
const RENDER_SCALE = 2
const IMAGE_CACHE_LIMIT = 256

const imageCache = new Map<string, Promise<HTMLImageElement>>()

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src)
  if (cached) return cached

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片加载失败'))
    image.src = src
  })
  promise.catch(() => imageCache.delete(src))
  imageCache.set(src, promise)
  while (imageCache.size > IMAGE_CACHE_LIMIT) {
    const oldest = imageCache.keys().next().value
    if (oldest === undefined) break
    imageCache.delete(oldest)
  }
  return promise
}

function contain(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const scale = Math.min(width / image.width, height / image.height)
  const drawWidth = Math.max(1, Math.round(image.width * scale))
  const drawHeight = Math.max(1, Math.round(image.height * scale))
  context.drawImage(
    image,
    Math.round(x + (width - drawWidth) / 2),
    Math.round(y + (height - drawHeight) / 2),
    drawWidth,
    drawHeight,
  )
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
}

/** 按当前字体测量并裁切；避免长名称压到价格或相邻格子。 */
function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 0) return ''
  if (context.measureText(text).width <= maxWidth) return text
  const ellipsis = '…'
  let end = text.length
  while (end > 0 && context.measureText(text.slice(0, end) + ellipsis).width > maxWidth) {
    end -= 1
  }
  return end > 0 ? text.slice(0, end) + ellipsis : ''
}

function selectedSmalls(
  front: HTMLImageElement | null,
  back: HTMLImageElement | null,
  input: SaleRenderInput,
): HTMLImageElement[] {
  return [front, back].filter(
    (image, index): image is HTMLImageElement =>
      Boolean(image) && (index === 0 ? input.front : input.back),
  )
}

function computeLayout(input: SaleRenderInput): SaleSheetLayout {
  return layoutSaleSheet(input.items, {
    template: input.template,
    size: input.size,
    columns: input.columns,
    rowCounts: input.rowCounts,
    // 间距输入按最终 PNG 像素计；画布内部按 2× 坐标绘制。
    gap: Math.max(0, input.gap) / RENDER_SCALE,
    groupGap: Math.max(0, Math.min(input.groupGap, input.gap)) / RENDER_SCALE,
    showNames: input.showNames,
  })
}

function prepareCanvas(layout: SaleSheetLayout): {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
} {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(layout.width * RENDER_SCALE))
  canvas.height = Math.max(1, Math.round(layout.height * RENDER_SCALE))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建预览画布')
  context.scale(RENDER_SCALE, RENDER_SCALE)
  context.imageSmoothingEnabled = false
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, layout.width, layout.height)
  context.textBaseline = 'middle'
  return { canvas, context }
}

export async function renderSaleSheet(input: SaleRenderInput): Promise<string> {
  return input.template === 1 ? renderClothingSheet(input) : renderItemSheet(input)
}

async function renderClothingSheet(input: SaleRenderInput): Promise<string> {
  const layout = computeLayout(input)
  const { canvas, context } = prepareCanvas(layout)

  for (const cell of layout.cells) {
    await drawClothingArt(context, cell, input)
    drawClothingLabels(context, cell, input.showNames)
    if (cell.item.sold) {
      const centerX = cell.x + (input.size === 'dual' ? 88 : cell.width / 2)
      drawSoldStamp(context, centerX, cell.y + cell.artHeight / 2, '#6b6b6b')
    }
  }

  return canvas.toDataURL('image/png')
}

async function renderItemSheet(input: SaleRenderInput): Promise<string> {
  const layout = computeLayout(input)
  const { canvas, context } = prepareCanvas(layout)

  for (const cell of layout.cells) {
    await drawItemArt(context, cell)
    drawItemLabels(context, cell, input.showNames)
    if (cell.item.sold) drawItemSoldCross(context, cell)
  }

  return canvas.toDataURL('image/png')
}

async function drawClothingArt(
  context: CanvasRenderingContext2D,
  cell: SaleCellLayout,
  input: SaleRenderInput,
): Promise<void> {
  const art = cell.item.art
  const [large, front, back] = await Promise.all([
    art.large ? loadImage(art.large).catch(() => null) : null,
    art.front ? loadImage(art.front).catch(() => null) : null,
    art.back ? loadImage(art.back).catch(() => null) : null,
  ])

  if (input.size === 'dual') {
    const hero = large ?? front ?? back
    if (hero) contain(context, hero, cell.x + 8, cell.y, 160, cell.artHeight)
    const smalls = selectedSmalls(front, back, input)
    if (smalls.length > 0) {
      const smallGap = 10
      const smallHeight = (cell.artHeight - smallGap * (smalls.length - 1)) / smalls.length
      smalls.forEach((image, index) => {
        contain(
          context,
          image,
          cell.x + 176,
          cell.y + index * (smallHeight + smallGap),
          98,
          smallHeight,
        )
      })
    }
    return
  }

  if (input.size === 'large') {
    if (large) contain(context, large, cell.x, cell.y, cell.width, cell.artHeight)
    return
  }

  const smalls = selectedSmalls(front, back, input)
  if (smalls.length === 0) return
  const slotWidth = 82
  const startX = cell.x + (cell.width - smalls.length * slotWidth) / 2
  smalls.forEach((image, index) => {
    contain(context, image, startX + index * slotWidth, cell.y, slotWidth, cell.artHeight)
  })
}

async function drawItemArt(context: CanvasRenderingContext2D, cell: SaleCellLayout): Promise<void> {
  // 只有道具本身带米色圆角底；文字排在底色块下方。
  context.fillStyle = BEIGE
  roundRect(context, cell.x, cell.y, cell.width, cell.artHeight, 9)
  context.fill()
  context.strokeStyle = BEIGE_BORDER
  context.lineWidth = 1
  roundRect(context, cell.x + 0.5, cell.y + 0.5, cell.width - 1, cell.artHeight - 1, 9)
  context.stroke()

  if (!cell.item.art.icon) return
  try {
    const icon = await loadImage(cell.item.art.icon)
    contain(context, icon, cell.x + 8, cell.y + 6, cell.width - 16, cell.artHeight - 12)
  } catch {
    /* 缺图时只显示价格 */
  }
}

function drawClothingLabels(
  context: CanvasRenderingContext2D,
  cell: SaleCellLayout,
  showNames: boolean,
): void {
  if (cell.usesLabelBlock) {
    drawLabelStrip(context, cell)
    cell.labels.forEach((line, index) => {
      drawInlineLabelLine(
        context,
        line,
        cell.x,
        cell.labelTop + index * cell.labelLineHeight + cell.labelLineHeight / 2,
        cell.width,
      )
    })
    return
  }

  const centerY = cell.artBottom + 18
  const price = displayPrice(cell.item.price)
  context.font = `800 24px ${FONT}`
  context.fillStyle = PRICE
  context.textAlign = 'right'
  const priceWidth = Math.min(context.measureText(price).width, cell.width * 0.5)
  context.fillText(fitText(context, price, cell.width * 0.5), cell.x + cell.width - 6, centerY)

  if (!showNames) return
  context.font = `500 13px ${FONT}`
  context.fillStyle = NAME
  context.textAlign = 'left'
  const maxNameWidth = cell.width - priceWidth - 16
  if (maxNameWidth > 10) {
    context.fillText(fitText(context, cell.item.name, maxNameWidth), cell.x + 4, centerY)
  }
}

function drawItemLabels(
  context: CanvasRenderingContext2D,
  cell: SaleCellLayout,
  showNames: boolean,
): void {
  if (cell.usesLabelBlock) {
    drawLabelStrip(context, cell)
    let lineIndex = 0
    for (const line of cell.labels) {
      if (line.name) {
        drawCenteredLabelLine(
          context,
          line.name,
          `500 10px ${FONT}`,
          NAME,
          cell,
          cell.labelTop + lineIndex * cell.labelLineHeight + cell.labelLineHeight / 2,
        )
        lineIndex += 1
      }
      if (line.price) {
        drawCenteredLabelLine(
          context,
          line.price,
          `800 16px ${FONT}`,
          PRICE,
          cell,
          cell.labelTop + lineIndex * cell.labelLineHeight + cell.labelLineHeight / 2,
        )
        lineIndex += 1
      }
    }
    return
  }

  if (showNames) {
    drawCenteredLabelLine(
      context,
      cell.item.name,
      `500 10px ${FONT}`,
      NAME,
      cell,
      cell.artBottom + 14,
    )
  }
  drawCenteredLabelLine(
    context,
    displayPrice(cell.item.price),
    `800 19px ${FONT}`,
    PRICE,
    cell,
    cell.artBottom + (showNames ? 32 : 18),
  )
}

/** 多行标签用浅色底和图片分组，避免相邻格子的名称/价格看起来连成一行。 */
function drawLabelStrip(context: CanvasRenderingContext2D, cell: SaleCellLayout): void {
  context.save()
  context.fillStyle = LABEL_STRIP
  roundRect(context, cell.x, cell.artBottom + 4, cell.width, cell.labelHeight - 4, 6)
  context.fill()
  context.restore()
}

function drawInlineLabelLine(
  context: CanvasRenderingContext2D,
  line: SaleLabelLine,
  x: number,
  centerY: number,
  width: number,
): void {
  let priceWidth = 0
  if (line.price) {
    context.font = `800 19px ${FONT}`
    priceWidth = Math.min(context.measureText(line.price).width, width * 0.55)
    context.fillStyle = PRICE
    context.textAlign = 'right'
    context.fillText(fitText(context, line.price, width * 0.55), x + width - 4, centerY)
  }

  if (!line.name) return
  const maxNameWidth = width - priceWidth - 14
  if (maxNameWidth <= 10) return
  context.font = `500 13px ${FONT}`
  context.fillStyle = NAME
  context.textAlign = 'left'
  context.fillText(fitText(context, line.name, maxNameWidth), x + 4, centerY)
}

function drawCenteredLabelLine(
  context: CanvasRenderingContext2D,
  text: string,
  font: string,
  color: string,
  cell: SaleCellLayout,
  centerY: number,
): void {
  if (!text) return
  context.font = font
  context.fillStyle = color
  context.textAlign = 'center'
  context.fillText(fitText(context, text, cell.width - 8), cell.x + cell.width / 2, centerY)
}

function drawSoldStamp(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
): void {
  context.save()
  context.translate(x, y)
  context.rotate(-0.16)
  context.strokeStyle = color
  context.lineWidth = 4
  context.beginPath()
  context.arc(0, 0, 42, 0, Math.PI * 2)
  context.stroke()
  context.fillStyle = color
  context.font = `700 15px ${FONT}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('卖掉了', 0, 0)
  context.restore()
  context.textBaseline = 'middle'
}

function drawItemSoldCross(context: CanvasRenderingContext2D, cell: SaleCellLayout): void {
  context.save()
  context.strokeStyle = '#d33a3a'
  context.lineWidth = 5
  context.beginPath()
  context.moveTo(cell.x + 24, cell.y + 18)
  context.lineTo(cell.x + cell.width - 24, cell.y + cell.artHeight - 14)
  context.moveTo(cell.x + cell.width - 24, cell.y + 18)
  context.lineTo(cell.x + 24, cell.y + cell.artHeight - 14)
  context.stroke()
  context.restore()
}
