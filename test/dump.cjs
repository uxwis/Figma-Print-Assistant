const {
  PDFDocument, PDFName, PDFRawStream, PDFArray,
  decodePDFRawStream,
} = require('pdf-lib')
const fs = require('fs')

async function main() {
  const file = 'C:\\Users\\wis\\Desktop\\CMYK印刷文件_矢量.pdf'
  const doc = await PDFDocument.load(fs.readFileSync(file))
  const ctx = doc.context

  const targets = new Set([5, 7, 9, 12, 13])
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!targets.has(ref.objectNumber)) continue
    console.log(`\n========== ref ${ref.objectNumber} ==========`)
    if (!(obj instanceof PDFRawStream)) {
      console.log('  not stream:', obj.constructor.name)
      continue
    }
    for (const [k, v] of obj.dict.entries()) {
      let desc
      if (v instanceof PDFArray) {
        const parts = []
        for (let i = 0; i < v.size(); i++) {
          const e = v.lookup(i)
          parts.push(e.asString ? e.asString() : e.constructor.name + (e.contents ? `(${e.contents.length}b)` : ''))
        }
        desc = '[' + parts.join(', ') + ']'
      } else if (v.asString) desc = v.asString()
      else desc = v.constructor.name
      console.log(`  ${k.asString()} = ${desc}`)
    }
    const sub = obj.dict.get(PDFName.of('Subtype'))
    if (sub === PDFName.of('Form')) {
      console.log('  --- Form 内容 ---')
      console.log(Buffer.from(decodePDFRawStream(obj).decode()).toString('latin1').slice(0, 1000))
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
