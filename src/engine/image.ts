import type { Rect, RgbaImage } from './types'

export function createImage(width: number, height: number): RgbaImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) }
}

export function cloneImage(image: RgbaImage): RgbaImage {
  return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) }
}

/** 按矩形裁切，越界部分用透明填充。 */
export function crop(image: RgbaImage, rect: Rect): RgbaImage {
  const out = createImage(rect.w, rect.h)
  const sx0 = Math.max(0, rect.x)
  const sy0 = Math.max(0, rect.y)
  const sx1 = Math.min(image.width, rect.x + rect.w)
  const sy1 = Math.min(image.height, rect.y + rect.h)

  for (let sy = sy0; sy < sy1; sy += 1) {
    const rowStart = sy * image.width * 4
    const dx = sx0 - rect.x
    const dy = sy - rect.y
    const width = sx1 - sx0
    if (width <= 0) continue
    out.data.set(
      image.data.subarray(rowStart + sx0 * 4, rowStart + sx1 * 4),
      (dy * out.width + dx) * 4,
    )
  }

  return out
}

/**
 * 标准 Alpha 合成（source-over，非预乘）。
 *
 * 结果与 Canvas `drawImage` 在 8bit 下可能有 ±1 的舍入差异，
 * 但整条链路只用这一份实现，回归图因此是稳定的。
 */
export function blend(dst: RgbaImage, src: RgbaImage, rawX = 0, rawY = 0): void {
  // 像素风不做亚像素混合：坐标先取整，否则下面的行/列索引会变成小数（会画出杂点）
  const dx = Math.round(rawX)
  const dy = Math.round(rawY)
  const x0 = Math.max(0, dx)
  const y0 = Math.max(0, dy)
  const x1 = Math.min(dst.width, dx + src.width)
  const y1 = Math.min(dst.height, dy + src.height)

  for (let y = y0; y < y1; y += 1) {
    let si = ((y - dy) * src.width + (x0 - dx)) * 4
    let di = (y * dst.width + x0) * 4
    for (let x = x0; x < x1; x += 1) {
      const sa = (src.data[si + 3] ?? 0) / 255
      if (sa === 0) {
        si += 4
        di += 4
        continue
      }

      const da = (dst.data[di + 3] ?? 0) / 255
      if (sa === 1 || da === 0) {
        dst.data[di] = src.data[si] ?? 0
        dst.data[di + 1] = src.data[si + 1] ?? 0
        dst.data[di + 2] = src.data[si + 2] ?? 0
        dst.data[di + 3] = src.data[si + 3] ?? 0
        si += 4
        di += 4
        continue
      }

      const outA = sa + da * (1 - sa)
      const inv = da * (1 - sa)
      dst.data[di] = Math.round(((src.data[si] ?? 0) * sa + (dst.data[di] ?? 0) * inv) / outA)
      dst.data[di + 1] = Math.round(
        ((src.data[si + 1] ?? 0) * sa + (dst.data[di + 1] ?? 0) * inv) / outA,
      )
      dst.data[di + 2] = Math.round(
        ((src.data[si + 2] ?? 0) * sa + (dst.data[di + 2] ?? 0) * inv) / outA,
      )
      dst.data[di + 3] = Math.round(outA * 255)
      si += 4
      di += 4
    }
  }
}

/** 把不透明纯白像素置为全透明。 */
export function whiteToAlpha(image: RgbaImage, inPlace = true): RgbaImage {
  const out = inPlace ? image : cloneImage(image)
  const { data } = out
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255 && data[i + 3] === 255) {
      data[i] = 0
      data[i + 1] = 0
      data[i + 2] = 0
      data[i + 3] = 0
    }
  }
  return out
}

/** 整数倍最近邻放大（像素风不能做插值）。 */
export function scaleNearest(image: RgbaImage, scale: number): RgbaImage {
  if (scale === 1) return cloneImage(image)
  const out = createImage(image.width * scale, image.height * scale)
  for (let y = 0; y < out.height; y += 1) {
    const sy = Math.floor(y / scale)
    for (let x = 0; x < out.width; x += 1) {
      const sx = Math.floor(x / scale)
      const si = (sy * image.width + sx) * 4
      const di = (y * out.width + x) * 4
      out.data[di] = image.data[si] ?? 0
      out.data[di + 1] = image.data[si + 1] ?? 0
      out.data[di + 2] = image.data[si + 2] ?? 0
      out.data[di + 3] = image.data[si + 3] ?? 0
    }
  }
  return out
}

/**
 * 水平镜像。
 *
 * 官方 `flipHorizontal` 用在两处：服饰/家具的对称方向（dir 1/5）、
 * 以及门（`Fv.getDoor(dir)` 里 dir≠5 时翻转）。像素风必须逐像素搬，不能靠画布变换取整。
 */
export function flipHorizontal(image: RgbaImage): RgbaImage {
  const out = createImage(image.width, image.height)
  const rowBytes = image.width * 4
  for (let y = 0; y < image.height; y += 1) {
    const srcRow = y * rowBytes
    const dstRow = y * rowBytes
    for (let x = 0; x < image.width; x += 1) {
      const si = srcRow + x * 4
      const di = dstRow + (image.width - 1 - x) * 4
      out.data[di] = image.data[si] ?? 0
      out.data[di + 1] = image.data[si + 1] ?? 0
      out.data[di + 2] = image.data[si + 2] ?? 0
      out.data[di + 3] = image.data[si + 3] ?? 0
    }
  }
  return out
}

/** 把透明像素填成某个纯色，用于导出「非透明背景」的图。 */
export function flattenOnColor(
  image: RgbaImage,
  color: readonly [number, number, number],
): RgbaImage {
  const out = createImage(image.width, image.height)
  for (let i = 0; i < image.data.length; i += 4) {
    const alpha = (image.data[i + 3] ?? 0) / 255
    out.data[i] = Math.round((image.data[i] ?? 0) * alpha + color[0] * (1 - alpha))
    out.data[i + 1] = Math.round((image.data[i + 1] ?? 0) * alpha + color[1] * (1 - alpha))
    out.data[i + 2] = Math.round((image.data[i + 2] ?? 0) * alpha + color[2] * (1 - alpha))
    out.data[i + 3] = 255
  }
  return out
}

/** 有些素材把整块背景留成不透明白色；顶部几行几乎全白时按白底处理。 */
export function hasWhiteBackdrop(image: RgbaImage): boolean {
  const rows = Math.min(3, image.height)
  for (let y = 0; y < rows; y += 1) {
    let white = 0
    for (let x = 0; x < image.width; x += 1) {
      const index = (y * image.width + x) * 4
      if (
        image.data[index + 3] === 255 &&
        image.data[index] === 255 &&
        image.data[index + 1] === 255 &&
        image.data[index + 2] === 255
      ) {
        white += 1
      }
    }
    if (image.width > 0 && white / image.width >= 0.8) return true
  }
  return false
}

/** 命中白色背景时原地白转透明，返回是否执行。 */
export function whiteKeyBackdrop(image: RgbaImage): boolean {
  if (!hasWhiteBackdrop(image)) return false
  whiteToAlpha(image)
  return true
}
