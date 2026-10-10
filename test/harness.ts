// 模拟真实 Figma PDF 结构：ICCBased RGB + 带透明度组的 Form XObject
import { PDFDocument, PDFName, PDFRawStream, PDFArray, decodePDFRawStream } from 'pdf-lib'
import { writeFileSync, readFileSync, mkdirSync } from 'fs'
import { convertVectorPdfToCmyk } from '../src/ui/pdf/vectorCmyk'
import { BUILTIN_PROFILES } from '../src/ui/color/icc'

async function main() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 300])
  const ctx = doc.context

  // 1. 一个假的 ICCBased RGB 颜色空间（N=3，数据任意，转换器只看 N）
  const fakeIcc = new Uint8Array(readFileSync('test/fixtures/source-srgb.icc'))
  const iccStream = ctx.flateStream(fakeIcc, { Alternate: 'DeviceRGB', N: 3 })
  const iccRef = ctx.register(iccStream)
  const c1 = ctx.obj(['ICCBased', iccRef])

  // 2. Form XObject（含透明度组 + Resources + BBox），内部用 /C1
  const formContent =
    '/C1 cs\n' +
    '0 0 1 scn\n' +      // 蓝色矩形
    '0 0 120 120 re f\n' +
    '0 0 0 scn\n' +      // 黑色矩形
    '30 30 60 60 re f\n'
  const formBytes = new TextEncoder().encode(formContent)
  const formStream = ctx.flateStream(formBytes, {
    Type: 'XObject',
    Subtype: 'Form',
    BBox: [0, 0, 120, 120],
    Resources: { ColorSpace: { C1: c1 } },
    Group: { S: 'Transparency', I: false, K: true },
  })
  const formRef = ctx.register(formStream)

  // 3. 页面 Resources：ColorSpace + XObject
  const res = page.node.Resources()
  const csDict = ctx.obj({ C1: c1 })
  res.set(PDFName.of('ColorSpace'), csDict)
  const xobjDict = ctx.obj({ X1: formRef })
  res.set(PDFName.of('XObject'), xobjDict)

  // 4. 页面内容流：/C1 cs + scn（模拟 Figma），再 Do 一个 Form
  const pageContent =
    '/C1 CS\n/C1 cs\n' +
    '1 1 1 scn\n' +          // 白色背景
    '0 0 400 300 re f\n' +
    '1 0 0 scn\n' +          // 红色矩形（背景）
    '20 20 360 260 re f\n' +
    'q /X1 Do Q\n'           // 绘制 Form（含蓝/黑内容）
  const pageContentStream = ctx.flateStream(new TextEncoder().encode(pageContent), {})
  const pageContentRef = ctx.register(pageContentStream)
  page.node.set(PDFName.of('Contents'), pageContentRef)

  const original = await doc.save({ useObjectStreams: false })
  mkdirSync('tmp/pdfs', { recursive: true })
  writeFileSync('tmp/pdfs/harness-native.pdf', original)

  // 转换
  const converted = await convertVectorPdfToCmyk(original, BUILTIN_PROFILES[0])
  writeFileSync('tmp/pdfs/harness-cmyk.pdf', converted)

  // 检查 Form XObject dict 键是否正确
  const cdoc = await PDFDocument.load(converted)
  let badKeys = 0
  let goodType = 0
  for (const [ref, obj] of cdoc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream &&
        obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Form')) {
      goodType++
      for (const [k] of obj.dict.entries()) {
        if (k.decodeText().includes('/')) badKeys++
      }
    }
  }
  console.log('TEST_DONE', original.length, converted.length,
    'Form正确识别:', goodType, '错误键:', badKeys)
}

main().catch((e) => { console.error(e); process.exit(1) })
