import {
  instantiate, TYPE_RGB_8, TYPE_CMYK_8, TYPE_GRAY_8,
  INTENT_RELATIVE_COLORIMETRIC, cmsFLAGS_BLACKPOINTCOMPENSATION,
} from 'lcms-wasm'
import wasmBinary from 'lcms-wasm/dist/lcms.wasm'
import coated from '../../../assets/icc/ISOcoated_v2_eci.icc'
import coated300 from '../../../assets/icc/ISOcoated_v2_300_eci.icc'

export interface PrintProfile {
  id: string
  name: string
  bytes: Uint8Array
}

export const BUILTIN_PROFILES: PrintProfile[] = [
  { id: 'fogra39-300', name: 'ISO Coated v2 300%（ECI / FOGRA39）', bytes: coated300 },
  { id: 'fogra39', name: 'ISO Coated v2（ECI / FOGRA39）', bytes: coated },
]

let engine: Promise<any> | undefined
function getEngine() {
  // Avoid resolving import.meta.url inside Figma's inline iframe. Binary is in memory.
  return engine ??= instantiate({ wasmBinary, locateFile: () => 'lcms.wasm' })
}

// Reject malformed, RGB, DeviceLink and abstract profiles before invoking LCMS.
export function validateCmykProfile(bytes: Uint8Array): void {
  if (bytes.length < 132 || bytes.length > 32 * 1024 * 1024) throw new Error('ICC 文件大小无效（最多 32 MB）')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const sig = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4))
  const size = view.getUint32(0)
  if (size < 132 || size > bytes.length || sig(36) !== 'acsp') throw new Error('不是完整的 ICC 配置文件')
  if (sig(12) !== 'prtr' || sig(16) !== 'CMYK' || !['Lab ', 'XYZ '].includes(sig(20))) {
    throw new Error('请选择 CMYK 输出设备 ICC，不能使用 RGB 或 DeviceLink 配置')
  }
  const count = view.getUint32(128)
  if (count > 4096 || 132 + count * 12 > size) throw new Error('ICC 标签表无效')
  for (let i = 0; i < count; i++) {
    const offset = view.getUint32(132 + i * 12 + 4)
    const length = view.getUint32(132 + i * 12 + 8)
    if (offset < 128 || offset + length > size) throw new Error('ICC 标签数据不完整')
  }
}

export async function validatePrintProfile(bytes: Uint8Array): Promise<void> {
  const converter = await createIccConverter({ id: 'import', name: '导入 ICC', bytes })
  converter.dispose()
}

// Canvas decoding uses sRGB; alpha is composited on paper white before conversion.
export function rgbaToRgb(rgba: Uint8Array | Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length / 4 * 3)
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    const alpha = rgba[i + 3] / 255
    for (let c = 0; c < 3; c++) out[j + c] = Math.round(rgba[i + c] * alpha + 255 * (1 - alpha))
  }
  return out
}

export async function createIccConverter(profile: PrintProfile, source?: {bytes:Uint8Array;channels:1|3|4}) {
  validateCmykProfile(profile.bytes)
  const cms = await getEngine()
  const open = (bytes:Uint8Array) => {
    const memory = cms._malloc(bytes.length)
    if (!memory) throw new Error('ICC 转换内存不足')
    try { cms.HEAPU8.set(bytes,memory); return cms._cmsOpenProfileFromMem(memory,bytes.length) }
    finally { cms._free(memory) }
  }
  const src = source ? open(source.bytes) : cms.cmsCreate_sRGBProfile()
  if (!src) throw new Error('无法读取 PDF 源 ICC 配置文件')
  const channels = source?.channels ?? 3
  const inputFormat = channels === 1 ? TYPE_GRAY_8 : channels === 4 ? TYPE_CMYK_8 : TYPE_RGB_8
  // The package's array wrapper copies profiles to stack memory; use heap for large ICCs.
  const ptr = cms._malloc(profile.bytes.length)
  if (!ptr) { cms.cmsCloseProfile(src); throw new Error('ICC 转换内存不足') }
  let dst = 0, forward = 0, reverse = 0
  try {
    cms.HEAPU8.set(profile.bytes, ptr)
    dst = cms._cmsOpenProfileFromMem(ptr, profile.bytes.length)
    if (!dst) throw new Error('无法读取 ICC 配置文件')
    forward = cms.cmsCreateTransform(src, inputFormat, dst, TYPE_CMYK_8,
      INTENT_RELATIVE_COLORIMETRIC, cmsFLAGS_BLACKPOINTCOMPENSATION)
    reverse = cms.cmsCreateTransform(dst, TYPE_CMYK_8, src, inputFormat,
      INTENT_RELATIVE_COLORIMETRIC, cmsFLAGS_BLACKPOINTCOMPENSATION)
    if (!forward || !reverse) throw new Error('ICC 缺少可用的 RGB／CMYK 转换表')
  } catch (e) {
    if (forward) cms.cmsDeleteTransform(forward)
    if (reverse) cms.cmsDeleteTransform(reverse)
    if (dst) cms.cmsCloseProfile(dst)
    cms.cmsCloseProfile(src)
    throw e
  } finally { cms._free(ptr) }

  let disposed = false
  const transform = (handle: number, input: Uint8Array, inputChannels: number, outputChannels: number) => {
    if (disposed) throw new Error('ICC 转换器已关闭')
    const pixels = input.length / inputChannels
    if (!Number.isInteger(pixels)) throw new Error('像素通道数量无效')
    const out = new Uint8Array(pixels * outputChannels)
    // Bound WASM working memory independently of page size.
    for (let p = 0; p < pixels; p += 65536) {
      const count = Math.min(65536, pixels - p)
      out.set(cms.cmsDoTransform(handle, input.subarray(p * inputChannels, (p + count) * inputChannels), count), p * outputChannels)
    }
    return out
  }
  return {
    toCmyk: (rgb: Uint8Array) => transform(forward, rgb, channels, 4),
    toRgb: (cmyk: Uint8Array) => transform(reverse, cmyk, 4, channels),
    dispose() {
      if (disposed) return
      disposed = true
      cms.cmsDeleteTransform(forward)
      cms.cmsDeleteTransform(reverse)
      cms.cmsCloseProfile(dst)
      cms.cmsCloseProfile(src)
    },
  }
}
