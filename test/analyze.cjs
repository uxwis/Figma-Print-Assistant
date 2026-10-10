const {
  PDFDocument, PDFName, PDFRawStream, PDFArray, PDFDict,
  decodePDFRawStream,
} = require('pdf-lib')
const fs = require('fs')

function decode(obj) {
  return Buffer.from(decodePDFRawStream(obj).decode()).toString('latin1')
}

async function main() {
  const file = process.argv[2] || 'C:\\Users\\wis\\Desktop\\CMYK印刷文件_矢量.pdf'
  const bytes = fs.readFileSync(file)
  const doc = await PDFDocument.load(bytes)
  const ctx = doc.context

  console.log('===== 对象清单 =====')
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      const sub = obj.dict.get(PDFName.of('Subtype'))
      const subS = sub ? sub.constructor.name : '-'
      let subVal = ''
      try { subVal = sub && sub.asString ? sub.asString() : '' } catch (e) {}
      console.log(`ref ${ref.objectNumber}: STREAM Subtype=${subVal} bytes=${obj.contents.length}`)
    } else if (obj instanceof PDFDict) {
      const t = obj.get(PDFName.of('Type'))
      console.log(`ref ${ref.objectNumber}: DICT keys=${obj.entries().map(e=>e[0].asString()).join(',')}`)
    } else {
      console.log(`ref ${ref.objectNumber}: ${obj.constructor.name}`)
    }
  }

  console.log('\n===== 页面内容流 =====')
  for (const page of doc.getPages()) {
    const contents = page.node.Contents()
    const streams = []
    const collect = (o) => {
      if (o instanceof PDFArray) { for (let i=0;i<o.size();i++) collect(o.lookup(i)) }
      else if (o instanceof PDFRawStream) streams.push(o)
    }
    collect(contents)
    for (const s of streams) {
      console.log('--- stream ---')
      console.log(decode(s).slice(0, 2000))
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
