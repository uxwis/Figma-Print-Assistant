const {
  PDFDocument, PDFName, PDFRawStream, PDFArray,
  decodePDFRawStream,
} = require('pdf-lib')
const fs = require('fs')

function decodeStream(obj) {
  return Buffer.from(decodePDFRawStream(obj).decode()).toString('latin1')
}

async function main() {
  const bytes = fs.readFileSync('test/converted-cmyk.pdf')
  const doc = await PDFDocument.load(bytes)

  // 只检查页面 Contents 实际引用的内容流
  for (const page of doc.getPages()) {
    const contents = page.node.Contents()
    const streams = []
    const collect = (o) => {
      if (o instanceof PDFArray) {
        for (let i = 0; i < o.size(); i++) collect(o.lookup(i))
      } else if (o instanceof PDFRawStream) streams.push(o)
    }
    collect(contents)

    let allText = ''
    for (const s of streams) allText += decodeStream(s) + '\n'

    const rg = allText.match(/\brg\b|\bRG\b/g)
    const k = allText.match(/\bk\b|\bK\b/g)
    console.log('页面 Contents 引用的 stream 数:', streams.length)
    console.log('其中 rg/RG:', rg ? rg.length : 0)
    console.log('其中 k/K:', k ? k.length : 0)
    console.log('--- 内容流预览 ---')
    console.log(allText.slice(0, 600))
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
