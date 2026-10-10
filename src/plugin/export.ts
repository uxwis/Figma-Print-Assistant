import type { MarksConfig, CmykDataPayload, VectorPagePayload } from '../shared/types'
import { pxToMm, DPI_PRESETS } from '../shared/constants'
import { getTargetFrames } from './utils'
import { buildPlate } from './marks'
import { outlineText, loadFrameFonts } from './outline'
import { exportPrintSize } from './printSize'

function validateDpi(dpi:number) {
  if(!DPI_PRESETS.includes(dpi))throw new Error('请选择 150、300 或 600 DPI')
}

// Temporary export nodes are owned by this invocation. Never delete another
// export's nodes or an existing user-visible print plate.
async function withExportNodes<T>(target:'selection'|'page',withMarks:boolean,config:MarksConfig,run:(nodes:FrameNode[])=>Promise<T>):Promise<T> {
  const frames=getTargetFrames(target)
  if(!frames.length)throw new Error('请先选中需要导出的原稿画板')
  if(!withMarks)return run(frames)
  for(const key of ['bleed','markOffset','markLength'] as const)if(!Number.isFinite(config[key])||config[key]<0)throw new Error('请输入有效的出血和裁切线尺寸')
  frames.forEach(exportPrintSize)
  for(const frame of frames)await loadFrameFonts(frame)
  const sizes=frames.map(exportPrintSize)
  const temporary:FrameNode[]=[]
  try {
    for(let i=0;i<frames.length;i++) {
      const node=buildPlate(frames[i],config,sizes[i])
      temporary.push(node)
      node.setPluginData('printExportTemporary','true')
    }
    return await run(temporary)
  } finally {for(const node of temporary)if(!node.removed)node.remove()}
}

const trimInset=(config:MarksConfig)=>config.bleed+config.markOffset+config.markLength

export async function exportCmykVectorPages(target:'selection'|'page',dpi:number,config:MarksConfig):Promise<VectorPagePayload[]> {
  validateDpi(dpi)
  return withExportNodes(target,true,config,async nodes=>{
    const pages:VectorPagePayload[]=[]
    for(const node of nodes) {
      await outlineText(node)
      const bytes=await node.exportAsync({format:'PDF',contentsOnly:true,useAbsoluteBounds:true,colorProfile:'SRGB'})
      pages.push({kind:'vector',bytes,name:node.name,widthMm:pxToMm(node.width),heightMm:pxToMm(node.height),trimInsetMm:trimInset(config),bleedMm:config.bleed})
    }
    return pages
  })
}

export async function exportCmykImages(target:'selection'|'page',dpi:number,config:MarksConfig):Promise<CmykDataPayload[]> {
  validateDpi(dpi)
  return withExportNodes(target,true,config,async nodes=>{
    const images:CmykDataPayload[]=[],scale=dpi/72
    for(const node of nodes) {
      const width=Math.ceil(node.width*scale),height=Math.ceil(node.height*scale)
      if(width>16384 || height>16384 || width*height>40000000)throw new Error('所选分辨率下画板过大，请降低 DPI 或拆分画板')
      const bytes=await node.exportAsync({format:'PNG',colorProfile:'SRGB',useAbsoluteBounds:true,contentsOnly:true,constraint:{type:'SCALE',value:scale}})
      images.push({bytes,widthMm:pxToMm(node.width),heightMm:pxToMm(node.height),dpi,iccProfile:'',trimInsetMm:trimInset(config),bleedMm:config.bleed})
    }
    return images
  })
}

export async function exportVectorPdfPages(target:'selection'|'page',withMarks:boolean,config:MarksConfig):Promise<Uint8Array[]> {
  return withExportNodes(target,withMarks,config,async nodes=>{
    const pages:Uint8Array[]=[]
    for(const node of nodes)pages.push(await node.exportAsync({format:'PDF',contentsOnly:true,useAbsoluteBounds:true}))
    return pages
  })
}

export async function exportPngImages(target:'selection'|'page',dpi:number,withMarks:boolean,config:MarksConfig):Promise<Uint8Array[]> {
  return withExportNodes(target,withMarks,config,async nodes=>{
    const images:Uint8Array[]=[]
    for(const node of nodes)images.push(await node.exportAsync({format:'PNG',contentsOnly:true,useAbsoluteBounds:true,constraint:{type:'SCALE',value:dpi/72}}))
    return images
  })
}
