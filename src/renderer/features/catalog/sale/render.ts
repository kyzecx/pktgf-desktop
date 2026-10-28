import type { SaleArt } from './art'

export type SaleTemplate = 1 | 2
export type SaleSize = 'large' | 'small' | 'dual'

export interface SaleRenderItem {
  key: string
  name: string
  price: string
  sold: boolean
  group: string
  art: SaleArt
}

export interface SaleRenderInput {
  template: SaleTemplate
  size: SaleSize
  front: boolean
  back: boolean
  columns: number
  rowCounts?: number[]
  gap: number
  groupGap: number
  showNames: boolean
  items: SaleRenderItem[]
}

const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif'
const BEIGE = '#f3ead4'
const BEIGE_BORDER = '#e2d5b9'
const PRICE = '#b31f36'
const RENDER_SCALE = 2

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片加载失败'))
    image.src = src
  })
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
}

export async function renderSaleSheet(input: SaleRenderInput): Promise<string> {
  return input.template === 1 ? renderClothingSheet(input) : renderItemSheet(input)
}

interface PositionedItem {
  item: SaleRenderItem
  x: number
  y: number
  row: number
}

function layoutRows(
  items: SaleRenderItem[],
  columns: number,
  cellWidth: number,
  cellHeight: number,
  gap: number,
  groupGap: number,
  padding: number,
  rowCounts?: number[],
): { positions: PositionedItem[]; width: number; height: number } {
  const positions: PositionedItem[] = []
  let width = padding * 2
  let row = 0
  let start = 0
  while (start < items.length) {
    const count = Math.max(1, rowCounts?.[row] ?? columns)
    const rowItems = items.slice(start, start + count)
    start += count
    let x = padding
    rowItems.forEach((item, index) => {
      if (index > 0) {
        const previous = rowItems[index - 1]!
        x += previous.group === item.group ? groupGap : gap
      }
      positions.push({ item, x, y: padding + row * (cellHeight + gap), row })
      x += cellWidth
    })
    width = Math.max(width, x + padding)
    row += 1
  }
  return {
    positions,
    width,
    height: padding * 2 + row * cellHeight + Math.max(0, row - 1) * gap,
  }
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

async function renderClothingSheet(input: SaleRenderInput): Promise<string> {
  const columns = 4
  const padding = 24
  // 间距输入按最终 PNG 像素计；画布内部按 2× 坐标绘制。
  const gap = Math.max(0, input.gap) / RENDER_SCALE
  const groupGap = Math.max(0, Math.min(input.groupGap, input.gap)) / RENDER_SCALE
  const dual = input.size === 'dual'
  const largeOnly = input.size === 'large'
  const tileWidth = dual ? 280 : 190
  const tileHeight = dual ? 230 : 210
  const layout = layoutRows(
    input.items,
    columns,
    tileWidth,
    tileHeight,
    gap,
    groupGap,
    padding,
    input.rowCounts,
  )
  const canvas = document.createElement('canvas')
  canvas.width = layout.width * RENDER_SCALE
  canvas.height = layout.height * RENDER_SCALE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建预览画布')
  context.scale(RENDER_SCALE, RENDER_SCALE)
  context.imageSmoothingEnabled = false
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, layout.width, layout.height)
  context.textBaseline = 'middle'

  for (const position of layout.positions) {
    const { item, x, y } = position
    const [large, front, back] = await Promise.all([
      item.art.large ? loadImage(item.art.large).catch(() => null) : null,
      item.art.front ? loadImage(item.art.front).catch(() => null) : null,
      item.art.back ? loadImage(item.art.back).catch(() => null) : null,
    ])

    if (dual) {
      const hero = large ?? front ?? back
      if (hero) contain(context, hero, x + 8, y + 8, 160, 186)
      const smalls = [front, back].filter(
        (image, index): image is HTMLImageElement =>
          Boolean(image) && (index === 0 ? input.front : input.back),
      )
      smalls.forEach((image, smallIndex) => {
        contain(context, image, x + 176, y + 22 + smallIndex * 90, 78, 116)
      })
    } else if (largeOnly && large) {
      contain(context, large, x, y, tileWidth, tileHeight - 40)
    } else {
      const smalls = [front, back].filter(
        (image, index): image is HTMLImageElement =>
          Boolean(image) && (index === 0 ? input.front : input.back),
      )
      smalls.forEach((image, smallIndex) => {
        contain(context, image, x + smallIndex * 82, y + 10, 78, 116)
      })
    }

    if (input.showNames) {
      context.fillStyle = '#5b5045'
      context.font = `500 13px ${FONT}`
      context.textAlign = 'left'
      context.fillText(item.name, x + 4, y + tileHeight - 20, tileWidth * 0.55)
    }
    context.fillStyle = PRICE
    context.font = `800 24px ${FONT}`
    context.textAlign = 'right'
    context.fillText(item.price.trim() || '—', x + tileWidth - 6, y + tileHeight - 22)
    if (item.sold) drawSoldStamp(context, x + tileWidth / 2, y + tileHeight / 2, '#6b6b6b')
  }

  return canvas.toDataURL('image/png')
}

async function renderItemSheet(input: SaleRenderInput): Promise<string> {
  const columns = Math.max(1, Math.min(10, Math.round(input.columns) || 5))
  const padding = 18
  // 间距输入按最终 PNG 像素计；画布内部按 2× 坐标绘制。
  const gap = Math.max(0, input.gap) / RENDER_SCALE
  const groupGap = Math.max(0, Math.min(input.groupGap, input.gap)) / RENDER_SCALE
  const cellWidth = 100
  const cellHeight = input.showNames ? 142 : 128
  const layout = layoutRows(
    input.items,
    columns,
    cellWidth,
    cellHeight,
    gap,
    groupGap,
    padding,
    input.rowCounts,
  )
  const canvas = document.createElement('canvas')
  canvas.width = layout.width * RENDER_SCALE
  canvas.height = layout.height * RENDER_SCALE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建预览画布')
  context.scale(RENDER_SCALE, RENDER_SCALE)
  context.imageSmoothingEnabled = false
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, layout.width, layout.height)
  context.textBaseline = 'middle'

  for (const position of layout.positions) {
    const { item, x, y } = position
    // 只有道具本身带米色圆角底；gap 就是两个米色格子之间的实际像素距离。
    context.fillStyle = BEIGE
    roundRect(context, x, y, cellWidth, 96, 9)
    context.fill()
    context.strokeStyle = BEIGE_BORDER
    context.lineWidth = 1
    roundRect(context, x + 0.5, y + 0.5, cellWidth - 1, 95, 9)
    context.stroke()

    if (item.art.icon) {
      try {
        const icon = await loadImage(item.art.icon)
        contain(context, icon, x + 8, y + 6, cellWidth - 16, 84)
      } catch {
        /* 缺图时只显示价格 */
      }
    }

    let textY = y + cellHeight - 16
    if (input.showNames) {
      context.fillStyle = '#5b5045'
      context.font = `500 10px ${FONT}`
      context.textAlign = 'center'
      context.fillText(item.name, x + cellWidth / 2, textY - 16, cellWidth - 10)
      textY += 0
    }
    context.fillStyle = PRICE
    context.font = `800 19px ${FONT}`
    context.textAlign = 'center'
    context.fillText(item.price.trim() || '—', x + cellWidth / 2, textY)
    if (item.sold) {
      context.save()
      context.strokeStyle = '#d33a3a'
      context.lineWidth = 5
      context.beginPath()
      context.moveTo(x + 24, y + 18)
      context.lineTo(x + cellWidth - 24, y + 82)
      context.moveTo(x + cellWidth - 24, y + 18)
      context.lineTo(x + 24, y + 82)
      context.stroke()
      context.restore()
    }
  }

  return canvas.toDataURL('image/png')
}
