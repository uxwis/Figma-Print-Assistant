/// <reference types="@figma/plugin-typings" />

import { runPreflight } from './plugin/preflight'
import { generateMarks, removeMarks } from './plugin/marks'
import { fixRichBlack } from './plugin/fix'
import { exportVectorPdfPages, exportPngImages, exportCmykImages, exportCmykVectorPages } from './plugin/export'
import { DEFAULT_THRESHOLDS, DEFAULT_MARKS_CONFIG, mmToPx, pxToMm } from './shared/constants'
import type { InitInfo, MarksConfig, FrameInfo } from './shared/types'
import { getTargetFrames } from './plugin/utils'
import { frameInfo, savePrintSize, savePrintSizes, validSize } from './plugin/printSize'
import { watchCurrentPageChanges } from './plugin/watchChanges'

figma.showUI(__html__, { width: 480, height: 560, title: '印刷助手' })

let infoTarget: 'selection' | 'page' = 'selection'
let documentRevision = 0
let locatedSelection: { page: PageNode; nodeId: string } | undefined
function refreshFrameInfo() { post('frame-info', { target: infoTarget, frames: getFrameInfo(infoTarget), revision: documentRevision }) }
figma.on('selectionchange', () => {
  const located = locatedSelection
  locatedSelection = undefined
  if (located?.page === figma.currentPage && figma.currentPage.selection.length === 1 && figma.currentPage.selection[0].id === located.nodeId) {
    refreshFrameInfo()
    return
  }
  documentRevision++
  post('preflight-invalidated'); refreshFrameInfo()
})
watchCurrentPageChanges(
  () => { locatedSelection = undefined; documentRevision++; post('preflight-invalidated'); refreshFrameInfo() },
  error => post('error',{message:`页面变化监听初始化失败：${error instanceof Error ? error.message : String(error)}。请重新打开插件。`})
)

function getInitInfo(): InitInfo {
  const frames = getTargetFrames('selection')
  return {
    hasSelection: figma.currentPage.selection.length > 0,
    selectedFrameIds: frames.map((f) => f.id),
    selectedFrameNames: frames.map((f) => f.name),
  }
}

function getFrameInfo(target: 'selection' | 'page'): FrameInfo[] {
  return getTargetFrames(target).map(frameInfo)
}

// 调整画板尺寸。scaleContent=true 时连同内容等比缩放
async function resizeFrames(
  target: 'selection' | 'page',
  widthMm: number,
  heightMm: number,
  scaleContent: boolean
): Promise<string[]> {
  if (!validSize({widthMm,heightMm})) throw new Error('请输入有效的画板尺寸')
  const frames = getTargetFrames(target)
  // mm→px 取整，与 Figma 内置尺寸一致（A4=595×842）
  const w = Math.max(1, Math.round(mmToPx(widthMm)))
  const h = Math.max(1, Math.round(mmToPx(heightMm)))
  for (const f of frames) {
    if (scaleContent) {
      await scaleFrameContent(f, w, h)
    } else {
      f.resize(w, h)
    }
    savePrintSize(f, {widthMm,heightMm}, true)
  }
  return frames.map(frame=>frame.id)
}

// 新建标准尺寸空白画板（开始设计前用）
async function createFrame(widthMm: number, heightMm: number): Promise<FrameInfo> {
  if (!validSize({widthMm,heightMm})) throw new Error('请输入有效的画板尺寸')
  const w = Math.max(1, Math.round(mmToPx(widthMm)))
  const h = Math.max(1, Math.round(mmToPx(heightMm)))
  const frame = figma.createFrame()
  frame.name = `${widthMm}×${heightMm}mm`
  frame.resize(w, h)
  savePrintSize(frame, {widthMm,heightMm}, true)
  // 放在当前页面现有内容右侧，避免重叠
  let maxRight = 0
  for (const child of figma.currentPage.children) {
    if ('width' in child) maxRight = Math.max(maxRight, child.x + child.width)
  }
  frame.x = maxRight + 100
  frame.y = 0
  figma.currentPage.selection = [frame]
  figma.viewport.scrollAndZoomIntoView([frame])
  return frameInfo(frame)
}

// 递归等比缩放画板内所有内容到目标尺寸
async function scaleFrameContent(frame: FrameNode, targetW: number, targetH: number): Promise<void> {
  const sx = targetW / frame.width
  const sy = targetH / frame.height
  const descendants = frame.findAll(() => true)
  // 先加载所有文字字体
  const fonts = new Set<string>()
  for (const n of descendants) {
    if (n.type === 'TEXT') {
      const segs = n.getRangeAllFontNames(0, n.characters.length)
      for (const fn of segs) fonts.add(`${fn.family}||${fn.style}`)
    }
  }
  for (const key of fonts) {
    const [family, style] = key.split('||')
    await figma.loadFontAsync({ family, style })
  }

  // 从最深层节点开始缩放，避免父级缩放影响坐标基准
  for (const n of descendants.reverse()) {
    if ('resizeWithoutConstraints' in n) {
      const r = n as (FrameNode | InstanceNode | RectangleNode | TextNode | EllipseNode | LineNode | PolygonNode | StarNode | VectorNode | ComponentNode | ComponentSetNode)
      r.resizeWithoutConstraints(r.width * sx, r.height * sy)
    }
    if ('x' in n && 'y' in n) {
      const p = n as SceneNode & LayoutMixin
      p.x = p.x * sx
      p.y = p.y * sy
    }
    if (n.type === 'TEXT') {
      const k = Math.min(sx, sy)
      if (typeof n.fontSize === 'number') {
        n.fontSize = n.fontSize * k
      } else {
        // 混合字号：分段合并后缩放
        const len = n.characters.length
        let start = 0
        let fs = n.getRangeFontSize(0, 1) as number
        for (let i = 1; i <= len; i++) {
          const cur: number | null = i < len
            ? (n.getRangeFontSize(i, i + 1) as number)
            : null
          if (cur !== fs) {
            n.setRangeFontSize(start, i, fs * k)
            if (i < len) {
              start = i
              fs = cur as number
            }
          }
        }
      }
    }
    if ('strokeWeight' in n && typeof n.strokeWeight === 'number') {
      ;(n as GeometryMixin).strokeWeight = n.strokeWeight * Math.min(sx, sy)
    }
    if ('cornerRadius' in n && typeof n.cornerRadius === 'number') {
      ;(n as CornerMixin).cornerRadius = n.cornerRadius * Math.min(sx, sy)
    }
  }
  // 最终落到精确的目标整数尺寸
  frame.resizeWithoutConstraints(targetW, targetH)
}

figma.ui.onmessage = async (msg: { type: string; payload?: any }) => {
  const { type, payload } = msg
  try {
    switch (type) {
      case 'init':
        post('init-result', getInitInfo())
        break

      case 'get-frame-info': {
        infoTarget = payload.target === 'page' ? 'page' : 'selection'
        refreshFrameInfo()
        break
      }

      case 'set-print-size': {
        const node = await figma.getNodeByIdAsync(payload.frameId)
        if (!node || node.type !== 'FRAME' || node.getPluginData('isPrintPlate') === 'true') throw new Error('未找到原稿画板')
        // Reject a save made against obsolete dimensions while the user was typing.
        if (node.width !== payload.widthPx || node.height !== payload.heightPx) throw new Error('画板尺寸已变化，请重新输入成品尺寸')
        savePrintSize(node, {widthMm:payload.widthMm,heightMm:payload.heightMm})
        post('print-size-saved', {frameId:node.id})
        post('preflight-invalidated')
        refreshFrameInfo()
        break
      }

      case 'set-print-sizes': {
        const result = await savePrintSizes(payload.updates,payload.options)
        post('print-sizes-result', {...result, requestId:payload.requestId})
        if (!result.errors.length && result.frameIds.length) post('preflight-invalidated')
        refreshFrameInfo()
        break
      }

      case 'resize-frame': {
        const { target, widthMm, heightMm, scaleContent } = payload
        const frameIds = await resizeFrames(target, widthMm, heightMm, !!scaleContent)
        post('frame-resized', { count:frameIds.length, frameIds })
        post('preflight-invalidated')
        refreshFrameInfo()
        break
      }

      case 'create-frame': {
        const { widthMm, heightMm } = payload
        const info = await createFrame(widthMm, heightMm)
        post('frame-created', info)
        refreshFrameInfo()
        break
      }

      case 'run-preflight': {
        const { target, thresholds, safetyMargin, dpi, requestId } = payload
        if (target === 'selection' && figma.currentPage.selection.length === 0) {
          throw new Error('请先选中需要预检的画板')
        }
        const revision = documentRevision
        const result = await runPreflight({
          target,
          thresholds: { ...DEFAULT_THRESHOLDS, ...thresholds, targetDpi: dpi ?? 300 },
          safetyMargin: safetyMargin ?? DEFAULT_MARKS_CONFIG.safetyMargin,
        })
        post('preflight-result', {result, requestId, stale: revision !== documentRevision})
        break
      }

      case 'generate-marks': {
        const { target, config } = payload
        const result = await generateMarks(target, { ...DEFAULT_MARKS_CONFIG, ...config })
        post('marks-result', result)
        break
      }

      case 'remove-marks': {
        const count = await removeMarks()
        post('marks-removed', { count })
        break
      }

      case 'fix-rich-black': {
        await fixRichBlack(payload.nodeId)
        post('rich-black-fixed', { nodeId: payload.nodeId })
        break
      }

      case 'select-node': {
        const node = await figma.getNodeByIdAsync(payload.nodeId)
        if (node && 'visible' in node) {
          const scene = node as SceneNode
          if (figma.currentPage.selection.length !== 1 || figma.currentPage.selection[0].id !== scene.id) {
            locatedSelection = {page: figma.currentPage, nodeId: scene.id}
            figma.currentPage.selection = [scene]
          }
          figma.viewport.scrollAndZoomIntoView([scene])
        }
        break
      }

      case 'export-pdf': {
        const { target, withMarks, config } = payload
        const pages = await exportVectorPdfPages(target, withMarks, config as MarksConfig)
        post('pdf-result', { pages })
        break
      }

      case 'export-cmyk': {
        const { config, dpi, mode } = payload
        if (!getTargetFrames('selection').length) throw new Error('请先选中需要导出的原稿画板')
        if (mode === 'raster') {
          const images = await exportCmykImages('selection', dpi ?? 300, config as MarksConfig)
          post('cmyk-result', { mode:'raster', images })
        } else {
          const pages = await exportCmykVectorPages('selection', dpi ?? 300, config as MarksConfig)
          post('cmyk-result', { mode:'vector', pages, dpi })
        }
        break
      }

      case 'export-png': {
        const { target, dpi, withMarks, config } = payload
        const images = await exportPngImages(target, dpi, withMarks, config as MarksConfig)
        post('png-result', { images })
        break
      }

      case 'softproof': {
        const frames = figma.currentPage.selection.length > 0 ? getTargetFrames('selection') : []
        if (frames.length === 0) {
          post('softproof-result', { error: '请先选中需要软打样的画板' })
          break
        }
        const images = []
        for (const f of frames.slice(0, 1)) {
          const scale = Math.min(1, 800 / Math.max(f.width, f.height))
          const bytes = await f.exportAsync({
            format: 'PNG',
            colorProfile: 'SRGB',
            constraint: { type: 'SCALE', value: scale },
          })
          images.push({ id: f.id, name: f.name, bytes })
        }
        post('softproof-result', { images })
        break
      }
    }
  } catch (e) {
    post('error', { message: e instanceof Error ? e.message : String(e) })
  }
}

function post(type: string, payload?: any) {
  figma.ui.postMessage({ type, payload })
}
