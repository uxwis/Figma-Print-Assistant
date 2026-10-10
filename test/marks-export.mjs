import {build} from 'esbuild'
import {readFileSync,writeFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
import assert from 'node:assert/strict'
import {PDFDocument,rgb} from 'pdf-lib'

// The Figma mock records coordinates after native-style reparenting. Render those
// exact marks through the real PDF/ICC converter so missing or off-page marks fail.
const geometry=JSON.parse(readFileSync('tmp/pdfs/marks-geometry.json','utf8'))
await build({entryPoints:['src/ui/pdf/vectorCmyk.ts','src/ui/color/icc.ts'],outdir:'tmp/marks-test',outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',loader:{'.icc':'binary','.wasm':'binary'},external:['pdf-lib']})
const {buildCmykVectorPdf}=await import(pathToFileURL(resolve('tmp/marks-test/pdf/vectorCmyk.mjs')))
const {BUILTIN_PROFILES}=await import(pathToFileURL(resolve('tmp/marks-test/color/icc.mjs')))
const doc=await PDFDocument.create(),page=doc.addPage([geometry.width,geometry.height]),mm=72/25.4
page.drawRectangle({x:11*mm,y:11*mm,width:100*mm,height:100*mm,color:rgb(0.86,0.93,0.96)})
page.drawCircle({x:61*mm,y:61*mm,size:25*mm,color:rgb(0.12,0.42,0.55)})
let lines=0,borders=0
for(const mark of geometry.marks) {
 if(mark.type==='VECTOR') {
  const coords=mark.paths[0].data.match(/[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?/gi).map(Number)
  assert.equal(coords.length,4)
  const start={x:mark.x+coords[0],y:geometry.height-mark.y-coords[1]},end={x:mark.x+coords[2],y:geometry.height-mark.y-coords[3]}
  for(const point of [start,end])assert(point.x>=0&&point.x<=geometry.width&&point.y>=0&&point.y<=geometry.height)
  page.drawLine({start,end,thickness:0.5,color:rgb(0,0,0)});lines++
 } else if(mark.name==='出血框') {
  page.drawRectangle({x:mark.x,y:geometry.height-mark.y-mark.height,width:mark.width,height:mark.height,borderWidth:0.5,borderColor:rgb(1,0,0)});borders++
 }
}
assert.equal(lines,8);assert.equal(borders,1)
const bytes=await doc.save({useObjectStreams:false});writeFileSync('tmp/pdfs/marks-native.pdf',bytes)
const output=await buildCmykVectorPdf([{kind:'vector',bytes,name:'裁切与出血样稿',widthMm:geometry.width/mm,heightMm:geometry.height/mm,trimInsetMm:11,bleedMm:3}],BUILTIN_PROFILES[0],300)
writeFileSync('tmp/pdfs/marks-cmyk.pdf',output.bytes)
const converted=await PDFDocument.load(output.bytes),trim=converted.getPage(0).getTrimBox(),bleed=converted.getPage(0).getBleedBox()
assert(Math.abs(trim.width-100*mm)<1e-6);assert(Math.abs(bleed.width-106*mm)<1e-6)
console.log('Print marks passed: eight on-page crop lines, separate red bleed border, CMYK vector conversion, matching trim/bleed boxes and renderable PDF fixtures.')
