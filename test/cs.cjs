const {
  PDFDocument, PDFName, PDFRawStream, PDFArray,
  decodePDFRawStream,
} = require('pdf-lib')
const fs = require('fs')

async function main() {
  const file = process.argv[2] || 'C:\\Users\\wis\\Desktop\\CMYK印刷文件_矢量.pdf'
  const doc = await PDFDocument.load(fs.readFileSync(file))
  const ctx = doc.context

  for (const page of doc.getPages()) {
    const res = page.node.Resources()
    const cs = res.lookup(PDFName.of('ColorSpace'))
    console.log('===== ColorSpace 资源 =====')
    if (cs) {
      for (const [key, val] of cs.entries()) {
        const resolved = ctx.lookup(val)
        console.log(`\n${key.asString()} ->`)
        if (resolved instanceof PDFArray) {
          for (let i = 0; i < resolved.size(); i++) {
            const e = resolved.lookup(i)
            if (e instanceof PDFRawStream) {
              console.log(`  [${i}] STREAM dict:`, e.dict.entries().map(en => en[0].asString() + '=' + (en[1].asString ? en[1].asString() : en[1].constructor.name)).join(', '))
              console.log(`  ICC bytes length: ${e.contents.length}`)
            } else {
              console.log(`  [${i}]`, e.asString ? e.asString() : e.constructor.name)
            }
          }
        } else {
          console.log('  ', resolved.asString ? resolved.asString() : resolved.constructor.name)
        }
      }
    }

    // XObject
    const xobj = res.lookup(PDFName.of('XObject'))
    console.log('\n===== XObject 资源 =====')
    if (xobj) {
      for (const [key, val] of xobj.entries()) {
        const r = ctx.lookup(val)
        if (r instanceof PDFRawStream) {
          const sub = r.dict.get(PDFName.of('Subtype'))
          const csName = r.dict.lookup(PDFName.of('ColorSpace'))
          console.log(`${key.asString()}: Subtype=${sub ? sub.asString() : '?'} ColorSpace=${csName ? (csName.asString ? csName.asString() : 'array/other') : '?'} bytes=${r.contents.length}`)
        }
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
