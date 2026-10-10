import type { MarksConfig, PaperPreset } from './types'

// Figma 以 72DPI 为印刷基准：1px = 1pt = 1/72 inch
export const PX_PER_INCH = 72
export const MM_PER_INCH = 25.4
export const PX_PER_MM = PX_PER_INCH / MM_PER_INCH // ≈ 2.8346

export const mmToPx = (mm: number): number => mm * PX_PER_MM
export const pxToMm = (px: number): number => px / PX_PER_MM

// 国内纸张 / 常见印刷成品尺寸（mm，成品尺寸，不含出血）
export const PAPER_PRESETS: PaperPreset[] = [
  // 名片卡片
  { name: '标准名片 90×54', width: 90, height: 54, category: '名片卡片' },
  { name: '窄版名片 90×45', width: 90, height: 45, category: '名片卡片' },
  { name: '银行卡/标准卡 85.6×54', width: 85.6, height: 54, category: '名片卡片' },
  { name: '对折名片 180×54', width: 180, height: 54, category: '名片卡片' },
  { name: '明信片 100×148', width: 100, height: 148, category: '名片卡片' },
  // 常规纸张
  { name: 'A6 105×148', width: 105, height: 148, category: '常规纸张' },
  { name: 'A5 148×210', width: 148, height: 210, category: '常规纸张' },
  { name: 'A4 210×297', width: 210, height: 297, category: '常规纸张' },
  { name: 'A3 297×420', width: 297, height: 420, category: '常规纸张' },
  { name: '大16开 210×285', width: 210, height: 285, category: '常规纸张' },
  { name: '16开 185×260', width: 185, height: 260, category: '常规纸张' },
  { name: 'Letter 215.9×279.4', width: 215.9, height: 279.4, category: '常规纸张' },
  // 宣传单 / 折页
  { name: '宣传单 A4 210×285', width: 210, height: 285, category: '宣传单/折页' },
  { name: '宣传单 A5 148×210', width: 148, height: 210, category: '宣传单/折页' },
  { name: '三折页展开 285×210', width: 285, height: 210, category: '宣传单/折页' },
  { name: '对折页 420×285', width: 420, height: 285, category: '宣传单/折页' },
  // 海报展架
  { name: '海报 A2 420×594', width: 420, height: 594, category: '海报展架' },
  { name: '海报 A1 594×841', width: 594, height: 841, category: '海报展架' },
  { name: 'X展架 600×1600', width: 600, height: 1600, category: '海报展架' },
  { name: '易拉宝 800×2000', width: 800, height: 2000, category: '海报展架' },
]

export const PAPER_CATEGORIES = [
  '名片卡片',
  '常规纸张',
  '宣传单/折页',
  '海报展架',
]

export const DEFAULT_MARKS_CONFIG: MarksConfig = {
  bleed: 3,
  safetyMargin: 3,
  showCropMarks: true,
  showBleedBox: true,
  showRegistration: false,
  showSafeArea: false,
  markOffset: 3,
  markLength: 5,
}

export interface PreflightThresholds {
  targetDpi: number
  smallTextPt: number
  cmyThreshold: number // C/M/Y 超过该值判为四色黑
  darkKThreshold: number // K 超过该值才算"黑"
  tacLimit: number
  minLineWidthPt: number
  minFontSizePt: number
}

export const DEFAULT_THRESHOLDS: PreflightThresholds = {
  targetDpi: 300,
  smallTextPt: 10,
  cmyThreshold: 5,
  darkKThreshold: 60,
  tacLimit: 300,
  minLineWidthPt: 0.25,
  minFontSizePt: 5,
}

export const DPI_PRESETS = [150, 300, 600]

// A practical preflight minimum, independent of higher export resolutions.
export const imageDpiMinimum = (targetDpi: number) => Math.min(targetDpi, 200)

// 插件生成的标记图层统一命名，便于识别与清理
export const MARK_LAYER_NAME = '🖨 印前标记（勿删）'
export const MARK_FRAME_SUFFIX = '印刷版'

// 国内常用印刷尺寸预设（单位 mm）
export interface SizePreset {
  name: string
  w: number
  h: number
}
export const SIZE_PRESETS: SizePreset[] = [
  { name: '名片（横）90×54', w: 90, h: 54 },
  { name: '名片（竖）54×90', w: 54, h: 90 },
  { name: 'A3 297×420', w: 297, h: 420 },
  { name: 'A4 210×297', w: 210, h: 297 },
  { name: 'A5 148×210', w: 148, h: 210 },
  { name: 'A6 105×148', w: 105, h: 148 },
  { name: '大16开 210×285', w: 210, h: 285 },
  { name: '正16开 185×260', w: 185, h: 260 },
  { name: '大32开 140×203', w: 140, h: 203 },
  { name: '三折页展开 285×210', w: 285, h: 210 },
  { name: '海报 500×700', w: 500, h: 700 },
  { name: 'X展架 600×1600', w: 600, h: 1600 },
  { name: '易拉宝 800×2000', w: 800, h: 2000 },
]

// 物理尺寸智能单位：小尺寸 mm，中等 cm，大型喷绘 m
export function formatMm(mm: number): string {
  if (mm < 1000) return `${mm.toFixed(1)} mm`
  if (mm < 10000) return `${(mm / 10).toFixed(1)} cm`
  return `${(mm / 1000).toFixed(2)} m`
}
