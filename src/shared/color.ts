import type { RGB, CMYK } from './types'

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
export const clamp255 = (v: number): number => Math.min(255, Math.max(0, v))

// Figma SolidPaint.color 为 sRGB 0-1，转换为 0-255
export function figmaColorToRGB(c: { r: number; g: number; b: number }): RGB {
  return {
    r: Math.round(clamp01(c.r) * 255),
    g: Math.round(clamp01(c.g) * 255),
    b: Math.round(clamp01(c.b) * 255),
  }
}

export function rgbToHex(rgb: RGB): string {
  const h = (v: number) => clamp255(Math.round(v)).toString(16).padStart(2, '0')
  return `#${h(rgb.r)}${h(rgb.g)}${h(rgb.b)}`.toUpperCase()
}

/**
 * sRGB(0-255) -> CMYK(0-100)，采用 max-GCR 黑版生成。
 *
 * 特性：中性灰（r=g=b）会被还原为纯黑版（C/M/Y=0），
 * 这恰好符合国内印厂"中性黑文字/细线应输出单黑 K100"的规则，
 * 因此非常适合用于四色黑判定。
 *
 * 注意：这是色彩管理的数学近似，未加载 ICC 3D LUT，
 * 仅用于预检与软打样参考，正式大货颜色以打样为准。
 */
export function rgbToCmyk(rgb: RGB): CMYK {
  const r = clamp01(rgb.r / 255)
  const g = clamp01(rgb.g / 255)
  const b = clamp01(rgb.b / 255)

  const k = 1 - Math.max(r, g, b)
  if (k >= 1 - 1e-6) {
    return { c: 0, m: 0, y: 0, k: 100 }
  }

  const c = (1 - r - k) / (1 - k)
  const m = (1 - g - k) / (1 - k)
  const y = (1 - b - k) / (1 - k)

  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(k * 100),
  }
}

// 总墨量 TAC（Total Area Coverage）
export function totalInk(cmyk: CMYK): number {
  return cmyk.c + cmyk.m + cmyk.y + cmyk.k
}

// 是否为单黑（C/M/Y 均为 0）
export function isSingleBlack(cmyk: CMYK): boolean {
  return cmyk.c === 0 && cmyk.m === 0 && cmyk.y === 0
}

// 描述 CMYK 色值
export function formatCmyk(c: CMYK): string {
  return `C${c.c} M${c.m} Y${c.y} K${c.k}`
}

// 描述 RGB 色值
export function formatRgb(c: RGB): string {
  return `R${c.r} G${c.g} B${c.b}`
}

/**
 * 软打样：CMYK(0-100) -> 模拟印刷效果 RGB(0-255)。
 *
 * 采用近似 FOGRA39 胶印油墨原色的减法叠印模型：
 * 因为实际油墨不纯（青不是纯青、品红/黄都偏暗），
 * 屏幕上鲜艳的高饱和色（尤其纯蓝、纯绿、亮紫）转印刷后
 * 会明显变暗、饱和度下降。该模型可直观呈现这一变化。
 *
 * 注意：这是经验近似，非 ICC 色彩管理精确结果，
 * 正式大货颜色以数码/上机打样为准。
 */
const INK_REFLECT = {
  c: [0.0, 0.55, 0.67],
  m: [0.85, 0.15, 0.43],
  y: [0.98, 0.86, 0.24],
  k: [0.1, 0.1, 0.12],
}

export function cmykToRgbSoftProof(cmyk: CMYK): RGB {
  const c = clamp01(cmyk.c / 100)
  const m = clamp01(cmyk.m / 100)
  const y = clamp01(cmyk.y / 100)
  const k = clamp01(cmyk.k / 100)

  let r = 1
  let g = 1
  let b = 1
  const apply = (amt: number, ink: number[]) => {
    r *= 1 - amt + amt * ink[0]
    g *= 1 - amt + amt * ink[1]
    b *= 1 - amt + amt * ink[2]
  }
  apply(c, INK_REFLECT.c)
  apply(m, INK_REFLECT.m)
  apply(y, INK_REFLECT.y)
  apply(k, INK_REFLECT.k)

  return {
    r: clamp255(Math.round(r * 255)),
    g: clamp255(Math.round(g * 255)),
    b: clamp255(Math.round(b * 255)),
  }
}
