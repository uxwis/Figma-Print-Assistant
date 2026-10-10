import type { MarksConfig, PrintSize } from '../shared/types'
import { mmToPx, MARK_LAYER_NAME, MARK_FRAME_SUFFIX } from '../shared/constants'
import { getTargetFrames } from './utils'
import { requirePrintSize } from './printSize'
import { loadFrameFonts } from './outline'

export interface GenerateResult {
  created: number
  names: string[]
  warnings: string[]
}

// 生成印刷版（含出血、裁切线、套准标记、安全区）
export async function generateMarks(
  target: 'selection' | 'page',
  config: MarksConfig
): Promise<GenerateResult> {
  const frames = getTargetFrames(target).filter(
    (f) => f.getPluginData('isPrintPlate') !== 'true'
  )
  if (frames.length === 0) throw new Error('未找到原稿画板，请选中原稿后重试')
  for (const frame of frames) {
    requirePrintSize(frame)
    await loadFrameFonts(frame)
  }
  // 先确定原稿再清理，避免选中旧印刷版时删除后丢失目标。
  await removeMarks()
  const names: string[] = []
  const warnings: string[] = []

  for (const frame of frames) {
    const plate = buildPlate(frame, config, requirePrintSize(frame))
    names.push(plate.name)
    if (!getFrameBackground(frame)) {
      warnings.push(
        `“${frame.name}” 未检测到纯色背景，图片/渐变背景请手动延伸至出血区（${config.bleed}mm）`
      )
    }
  }

  return { created: frames.length, names, warnings }
}

// 移除所有印刷版
export async function removeMarks(): Promise<number> {
  let count = 0
  const plates = figma.currentPage.children.filter(
    (n) => n.type === 'FRAME' && n.getPluginData('isPrintPlate') === 'true'
  )
  for (const p of plates) {
    p.remove()
    count += 1
  }
  return count
}

export function buildPlate(frame: FrameNode, config: MarksConfig, size:PrintSize): FrameNode {
  const bleedPx = mmToPx(config.bleed)
  const offsetPx = mmToPx(config.markOffset)
  const lengthPx = mmToPx(config.markLength)
  const pad = bleedPx + offsetPx + lengthPx
  const W = mmToPx(size.widthMm)
  const H = mmToPx(size.heightMm)

  // 印刷版容器
  const plate = figma.createFrame()
  try {
  plate.name = `${frame.name} ${MARK_FRAME_SUFFIX}`
  plate.resize(W + pad * 2, H + pad * 2)
  plate.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }]
  plate.clipsContent = true
  plate.setPluginData('isPrintPlate', 'true')
  plate.x = frame.x + frame.width + mmToPx(20)
  plate.y = frame.y

  // 出血背景（纯色背景自动延伸）
  const bgFill = getFrameBackground(frame)
  if (bgFill) {
    const bleedRect = figma.createRectangle()
    plate.appendChild(bleedRect)
    bleedRect.x = pad - bleedPx
    bleedRect.y = pad - bleedPx
    bleedRect.resize(W + bleedPx * 2, H + bleedPx * 2)
    bleedRect.fills = [bgFill]
    bleedRect.strokes = []
    bleedRect.setPluginData('isPrintMark', 'true')
  }

  // 成品（clone 原稿）
  const clone = frame.clone()
  plate.appendChild(clone)
  clone.rescale(W/frame.width)
  // Correct the sub-pixel rounding of frames created at standard paper sizes.
  clone.resizeWithoutConstraints(W,H)
  clone.rotation = 0
  clone.x = pad
  clone.y = pad

  // 标记层
  const markLayer = figma.createFrame()
  plate.appendChild(markLayer)
  markLayer.name = MARK_LAYER_NAME
  markLayer.resize(plate.width, plate.height)
  markLayer.fills = []
  markLayer.strokes = []
  markLayer.clipsContent = false
  markLayer.x = 0
  markLayer.y = 0
  markLayer.setPluginData('isPrintMark', 'true')

  const black: SolidPaint = { type: 'SOLID', color: { r: 0, g: 0, b: 0 } }

  // 裁切线 × 8
  if (config.showCropMarks) {
    const x0 = pad
    const y0 = pad
    const x1 = pad + W
    const y1 = pad + H
    // 左上
    addLine(markLayer, x0 - offsetPx - lengthPx, y0, x0 - offsetPx, y0, black)
    addLine(markLayer, x0, y0 - offsetPx - lengthPx, x0, y0 - offsetPx, black)
    // 右上
    addLine(markLayer, x1 + offsetPx, y0, x1 + offsetPx + lengthPx, y0, black)
    addLine(markLayer, x1, y0 - offsetPx - lengthPx, x1, y0 - offsetPx, black)
    // 左下
    addLine(markLayer, x0 - offsetPx - lengthPx, y1, x0 - offsetPx, y1, black)
    addLine(markLayer, x0, y1 + offsetPx, x0, y1 + offsetPx + lengthPx, black)
    // 右下
    addLine(markLayer, x1 + offsetPx, y1, x1 + offsetPx + lengthPx, y1, black)
    addLine(markLayer, x1, y1 + offsetPx, x1, y1 + offsetPx + lengthPx, black)
  }

  // 套准标记 × 4（四边中点，空间足够时绘制，避免名片重叠）
  if (config.showRegistration) {
    const r = Math.min(lengthPx / 2, mmToPx(2.5))
    const cx = pad + W / 2
    const cy = pad + H / 2
    if (W > 2 * (offsetPx + lengthPx) + mmToPx(15)) {
      addRegMark(markLayer, cx, pad - offsetPx - lengthPx / 2, r, black)
      addRegMark(markLayer, cx, pad + H + offsetPx + lengthPx / 2, r, black)
    }
    if (H > 2 * (offsetPx + lengthPx) + mmToPx(15)) {
      addRegMark(markLayer, pad - offsetPx - lengthPx / 2, cy, r, black)
      addRegMark(markLayer, pad + W + offsetPx + lengthPx / 2, cy, r, black)
    }
  }

  // 安全区虚线框
  if (config.showSafeArea) {
    const safe = mmToPx(config.safetyMargin)
    addSafeRect(markLayer, pad + safe, pad + safe, W - 2 * safe, H - 2 * safe, black)
  }

  if(config.showBleedBox) {
    const border=figma.createRectangle()
    markLayer.appendChild(border)
    border.name='出血框'
    border.x=pad-bleedPx; border.y=pad-bleedPx
    border.resize(W+bleedPx*2,H+bleedPx*2)
    border.fills=[];border.strokes=[{type:'SOLID',color:{r:1,g:0,b:0}}]
    border.strokeWeight=0.5;border.strokeAlign='INSIDE'
    border.setPluginData('isPrintMark','true')
  }

  return plate
  } catch(error) {plate.remove();throw error}
}

// ===== 绘制辅助 =====
function addLine(
  parent: FrameNode,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: SolidPaint
) {
  const v = figma.createVector()
  parent.appendChild(v)
  v.x = Math.min(x1, x2)
  v.y = Math.min(y1, y2)
  v.vectorPaths = [
    {
      windingRule: 'NONE',
      data: `M ${x1 - v.x} ${y1 - v.y} L ${x2 - v.x} ${y2 - v.y}`,
    },
  ]
  v.fills = []
  v.strokes = [stroke]
  v.strokeWeight = 0.5
  v.setPluginData('isPrintMark', 'true')
}

function addRegMark(parent: FrameNode, cx: number, cy: number, r: number, stroke: SolidPaint) {
  const ell = figma.createEllipse()
  parent.appendChild(ell)
  ell.x = cx - r
  ell.y = cy - r
  ell.resize(r * 2, r * 2)
  ell.fills = []
  ell.strokes = [stroke]
  ell.strokeWeight = 0.5
  ell.setPluginData('isPrintMark', 'true')

  addLine(parent, cx - r, cy, cx + r, cy, stroke)
  addLine(parent, cx, cy - r, cx, cy + r, stroke)
}

function addSafeRect(
  parent: FrameNode,
  x: number,
  y: number,
  w: number,
  h: number,
  stroke: SolidPaint
) {
  if (w <= 0 || h <= 0) return
  const r = figma.createRectangle()
  parent.appendChild(r)
  r.x = x
  r.y = y
  r.resize(w, h)
  r.fills = []
  r.strokes = [stroke]
  r.strokeWeight = 0.25
  r.dashPattern = [3, 2]
  r.setPluginData('isPrintMark', 'true')
}

function getFrameBackground(frame: FrameNode): SolidPaint | null {
  const fills = frame.fills
  if (fills === figma.mixed || !Array.isArray(fills)) return null
  const solid = fills.find((p) => p.type === 'SOLID' && p.visible !== false)
  return solid ? (solid as SolidPaint) : null
}
