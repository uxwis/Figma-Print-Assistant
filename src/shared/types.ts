// ============ 颜色 ============
export interface RGB {
  r: number // 0-255
  g: number
  b: number
}

export interface CMYK {
  c: number // 0-100
  m: number
  y: number
  k: number
}

// ============ 预检问题 ============
export type IssueSeverity = 'error' | 'warning' | 'info'

export type IssueType =
  | 'low-dpi'
  | 'image-dpi-unavailable'
  | 'four-color-black'
  | 'missing-font'
  | 'thin-line'
  | 'tiny-text'
  | 'safe-area'
  | 'rich-black-area'
  | 'rasterized-effect'

export interface Issue {
  id: string
  type: IssueType
  severity: IssueSeverity
  title: string
  message: string
  nodeId?: string
  nodeName?: string
  frameName?: string
  detail?: string
  fixable?: boolean
}

export interface PreflightResult {
  target: string
  frameCount: number
  nodeCount: number
  issues: Issue[]
  errorCount: number
  warningCount: number
  durationMs: number
  targetDpi: number
  complete: boolean
  skippedFrames: { id: string; name: string; reason: string }[]
}

// ============ 印刷标记 ============
export interface MarksConfig {
  bleed: number // mm
  safetyMargin: number // mm
  showCropMarks: boolean
  showBleedBox?: boolean
  showRegistration: boolean
  showSafeArea: boolean
  markOffset: number // mm，裁切线离成品边距离
  markLength: number // mm，裁切线长度
}

// ============ 导出 ============
export interface ExportConfig {
  mode: 'PDF_VECTOR' | 'PDF_CMYK' | 'PNG'
  dpi: number
  withMarks: boolean
  iccProfile: string
}

export interface PaperPreset {
  name: string
  width: number // mm
  height: number // mm
  category: string
}

// ============ 画板信息 ============
export interface FrameInfo {
  id: string
  name: string
  widthPx: number
  heightPx: number
  widthMm: number
  heightMm: number
  printSize?: PrintSize
  printSizeStatus: 'unset' | 'valid' | 'stale'
}

export interface PrintSize {
  widthMm: number
  heightMm: number
}

export interface PrintSizeUpdate extends PrintSize {
  frameId: string
  widthPx: number
  heightPx: number
}

export interface PrintSizesResult {
  frameIds: string[]
  errors: { frameId: string; message: string }[]
}

export interface PrintSizeSaveOptions {
  resizeOriginal?: boolean
  scaleContent?: boolean
}

export type PdfMode = 'vector' | 'raster'

export interface VectorPagePayload {
  kind: 'vector'
  bytes: Uint8Array
  name: string
  widthMm: number
  heightMm: number
  trimInsetMm: number
  bleedMm: number
}

// ============ 消息 ============
export interface UIMessage<P = any> {
  type: string
  payload?: P
}

export interface InitInfo {
  hasSelection: boolean
  selectedFrameIds: string[]
  selectedFrameNames: string[]
}

export interface CmykDataPayload {
  bytes: Uint8Array
  widthMm: number
  heightMm: number
  dpi: number
  iccProfile: string
  trimInsetMm?: number
  bleedMm?: number
}
