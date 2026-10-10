import type { FrameInfo, PrintSize, PrintSizeUpdate, PrintSizesResult, PrintSizeSaveOptions } from '../shared/types'
import { pxToMm, mmToPx } from '../shared/constants'
import { sizeFitsRatio, originalSizeForPrint } from '../shared/printDimensions'
import { loadFrameFonts } from './outline'

const KEY = 'printAssistant.size.v1'
interface SavedSize extends PrintSize { version: 1; widthPx: number; heightPx: number }

export function readPrintSize(frame: FrameNode): { size?: PrintSize; status: FrameInfo['printSizeStatus'] } {
  const raw = frame.getPluginData(KEY)
  if (!raw) return { status: 'unset' }
  try {
    const s = JSON.parse(raw) as SavedSize
    if (s.version !== 1 || !validSize(s) || !Number.isFinite(s.widthPx) || !Number.isFinite(s.heightPx)) return { status: 'unset' }
    const size = { widthMm: s.widthMm, heightMm: s.heightMm }
    return { size, status: Math.abs(s.widthPx - frame.width) < 0.001 && Math.abs(s.heightPx - frame.height) < 0.001 ? 'valid' : 'stale' }
  } catch { return { status: 'unset' } }
}

export function validSize(size: PrintSize): boolean {
  return Number.isFinite(size.widthMm) && Number.isFinite(size.heightMm) && size.widthMm > 0 && size.heightMm > 0
}

function validatePrintSize(frame: FrameNode, size: PrintSize, allowPixelRounding = false): void {
  if (!validSize(size) || frame.width <= 0 || frame.height <= 0) throw new Error('请输入有效的成品尺寸')
  const impliedHeight = size.widthMm * frame.height / frame.width
  const tolerance = allowPixelRounding ? pxToMm(1.5) : Math.max(0.001, size.heightMm * 0.00001)
  if (!sizeFitsRatio(frame.width,frame.height,size) && Math.abs(impliedHeight - size.heightMm) > tolerance) throw new Error('此尺寸与原稿比例不同，请启用“按成品比例调整原稿”')
}

export function savePrintSize(frame: FrameNode, size: PrintSize, allowPixelRounding = false): void {
  validatePrintSize(frame, size, allowPixelRounding)
  frame.setPluginData(KEY, JSON.stringify({ version: 1, ...size, widthPx: frame.width, heightPx: frame.height } satisfies SavedSize))
}

// Resolve first, then validate every row against the current document before any synchronous writes.
export async function savePrintSizes(updates: PrintSizeUpdate[], options:PrintSizeSaveOptions={}): Promise<PrintSizesResult> {
  const errors: PrintSizesResult['errors'] = []
  const resolved = await Promise.all(updates.map(async update => {
    try { return { update, node: await figma.getNodeByIdAsync(update.frameId) } }
    catch { return { update, node: null } }
  }))
  const seen = new Set<string>()
  const frames: { frame: FrameNode; update: PrintSizeUpdate; previous: string; dimensions: {widthPx:number;heightPx:number}; needsResize:boolean }[] = []
  for (const {update, node} of resolved) {
    try {
      if (seen.has(update.frameId)) throw new Error('画板重复，请重新保存')
      seen.add(update.frameId)
      if (!node || node.type !== 'FRAME' || node.getPluginData('isPrintPlate') === 'true') throw new Error('未找到原稿画板')
      if (node.width !== update.widthPx || node.height !== update.heightPx) throw new Error('原稿尺寸已变化，请重新确认成品尺寸')
      if(options.resizeOriginal) {if(!validSize(update) || node.width<=0 || node.height<=0)throw new Error('请输入有效的成品尺寸')}
      else validatePrintSize(node, update)
      const dimensions=options.resizeOriginal ? originalSizeForPrint(node.width,node.height,update) : {widthPx:node.width,heightPx:node.height}
      frames.push({ frame: node, update, previous: node.getPluginData(KEY), dimensions,
        needsResize:dimensions.widthPx!==node.width || dimensions.heightPx!==node.height })
    } catch (e) {
      errors.push({frameId:update.frameId, message:e instanceof Error ? e.message : String(e)})
    }
  }
  if (errors.length) return {frameIds:[], errors}
  if(options.resizeOriginal) {
    // Load every font and try resizing disposable clones before changing any original.
    for(const item of frames) {
      if(!item.needsResize)continue
      let probe:FrameNode|undefined
      try {
        if(options.scaleContent)await loadFrameFonts(item.frame)
        probe=item.frame.clone();probe.visible=false
        resizeOriginal(probe,item.dimensions,!!options.scaleContent)
      } catch(e) {errors.push({frameId:item.frame.id,message:e instanceof Error ? e.message : String(e)})}
      finally {probe?.remove()}
    }
    for(const item of frames) if(item.frame.width!==item.update.widthPx || item.frame.height!==item.update.heightPx)
      errors.push({frameId:item.frame.id,message:'原稿尺寸已变化，请重新确认成品尺寸'})
    if(errors.length)return {frameIds:[],errors}
  }
  const written: typeof frames = []
  const resized = new Set<FrameNode>()
  for (const item of frames) {
    try {
      if(item.needsResize){resizeOriginal(item.frame,item.dimensions,!!options.scaleContent);resized.add(item.frame)}
      savePrintSize(item.frame, {widthMm:item.update.widthMm, heightMm:item.update.heightMm},!!options.resizeOriginal)
      written.push(item)
    } catch (e) {
      for(const changed of [...written,item].reverse())if(resized.has(changed.frame)) {
        if(options.scaleContent)changed.frame.rescale(1/Math.min(changed.dimensions.widthPx/changed.update.widthPx,changed.dimensions.heightPx/changed.update.heightPx))
        changed.frame.resizeWithoutConstraints(changed.update.widthPx,changed.update.heightPx)
      }
      for (const previous of written) previous.frame.setPluginData(KEY, previous.previous)
      return {frameIds:[], errors:[{frameId:item.frame.id, message:e instanceof Error ? e.message : String(e)}]}
    }
  }
  return {frameIds:frames.map(item=>item.frame.id), errors:[]}
}

function resizeOriginal(frame:FrameNode,size:{widthPx:number;heightPx:number},scaleContent:boolean):void {
  const width=size.widthPx,height=size.heightPx
  if(scaleContent)frame.rescale(Math.min(width/frame.width,height/frame.height))
  frame.resizeWithoutConstraints(width,height)
}

export function exportPrintSize(frame:FrameNode):PrintSize {
  const saved=readPrintSize(frame)
  if(saved.status==='unset')return {widthMm:pxToMm(frame.width),heightMm:pxToMm(frame.height)}
  return requirePrintSize(frame)
}

export function requirePrintSize(frame: FrameNode): PrintSize {
  const saved = readPrintSize(frame)
  if (saved.status !== 'valid' || !saved.size) throw new Error(`“${frame.name}”${saved.status === 'stale' ? '画板尺寸已变化，请重新确认' : '尚未设置'}成品尺寸`)
  return saved.size
}

export function frameInfo(frame: FrameNode): FrameInfo {
  const saved = readPrintSize(frame)
  return { id: frame.id, name: frame.name, widthPx: frame.width, heightPx: frame.height,
    widthMm: pxToMm(frame.width), heightMm: pxToMm(frame.height), printSize: saved.size, printSizeStatus: saved.status }
}

// Physical points per design pixel; standard-size frames allow their existing integer-pixel rounding.
export function printScale(frame: FrameNode, size: PrintSize): { x: number; y: number } {
  return { x: mmToPx(size.widthMm) / frame.width, y: mmToPx(size.heightMm) / frame.height }
}
