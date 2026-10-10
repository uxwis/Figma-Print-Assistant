import { PDFDocument, PDFName, PDFString, PDFOperator, PDFOperatorNames } from 'pdf-lib'
import type { CmykDataPayload } from '../../shared/types'
import { createIccConverter, rgbaToRgb, type PrintProfile } from '../color/icc'
import { decodePng } from '../color/decodedImage'

export interface RasterPage {
  data: Uint8ClampedArray
  width: number
  height: number
  widthMm: number
  heightMm: number
  trimInsetMm?: number
  bleedMm?: number
}

// The same ICC bytes drive LCMS and the image colour space and OutputIntent.
export async function buildCmykRasterPdf(pages: AsyncIterable<RasterPage> | Iterable<RasterPage>, profile: PrintProfile): Promise<Uint8Array> {
  const converter = await createIccConverter(profile)
  try {
    const pdf = await PDFDocument.create()
    pdf.setCreator('Print Assistant / LittleCMS ICC')
    pdf.setProducer('Print Assistant / pdf-lib / LittleCMS')
    const context = pdf.context
    const iccRef = context.register(context.flateStream(profile.bytes, { N: 4, Alternate: 'DeviceCMYK' }))
    const colorSpace = context.obj(['ICCBased', iccRef])
    const label = profile.name.replace(/[^\x20-\x7E]/g, ' ').trim() || 'Custom CMYK ICC'
    const intentRef = context.register(context.obj({
      Type: 'OutputIntent', S: 'GTS_PDFX', DestOutputProfile: iccRef,
      OutputConditionIdentifier: PDFString.of(label), Info: PDFString.of(label),
    }))
    pdf.catalog.set(PDFName.of('OutputIntents'), context.obj([intentRef]))
    let count = 0
    for await (const item of pages) {
      if (item.width <= 0 || item.height <= 0 || item.widthMm <= 0 || item.heightMm <= 0 || item.data.length !== item.width * item.height * 4) {
        throw new Error('印刷版图像或页面尺寸无效')
      }
      const cmyk = converter.toCmyk(rgbaToRgb(item.data))
      const imageRef = context.register(context.flateStream(cmyk, {
        Type: 'XObject', Subtype: 'Image', Width: item.width, Height: item.height,
        ColorSpace: colorSpace, BitsPerComponent: 8, Interpolate: false,
      }))
      const w = item.widthMm * 72 / 25.4, h = item.heightMm * 72 / 25.4
      const page = pdf.addPage([w, h])
      if (item.trimInsetMm !== undefined) {
        const pad = item.trimInsetMm * 72 / 25.4
        page.setTrimBox(pad, pad, w - 2 * pad, h - 2 * pad)
        const bleedPad = Math.max(0, pad - (item.bleedMm ?? 0) * 72 / 25.4)
        page.setBleedBox(bleedPad, bleedPad, w - 2 * bleedPad, h - 2 * bleedPad)
      }
      const name = page.node.newXObject('Print', imageRef)
      const operators = [
        PDFOperator.of(PDFOperatorNames.PushGraphicsState),
        PDFOperator.of(PDFOperatorNames.ConcatTransformationMatrix, [w, 0, 0, h, 0, 0].map(n => context.obj(n))),
        PDFOperator.of(PDFOperatorNames.DrawObject, [name]),
        PDFOperator.of(PDFOperatorNames.PopGraphicsState),
      ]
      page.node.addContentStream(context.register(context.contentStream(operators)))
      count++
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    if (!count) throw new Error('没有可导出的印刷版')
    return await pdf.save({ useObjectStreams: false })
  } finally { converter.dispose() }
}

export async function buildCmykPdf(images: CmykDataPayload[], profile: PrintProfile): Promise<Uint8Array> {
  async function* decodePages() {
    for (const item of images) {
      const decoded = await decodePng(item.bytes)
      yield { ...item, data: decoded.data, width: decoded.width, height: decoded.height }
    }
  }
  return buildCmykRasterPdf(decodePages(), profile)
}

export async function mergeVectorPdfs(pages: Uint8Array[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create()
  for (const p of pages) {
    const doc = await PDFDocument.load(p)
    const copied = await merged.copyPages(doc, doc.getPageIndices())
    copied.forEach(pg => merged.addPage(pg))
  }
  return merged.save()
}
