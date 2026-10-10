import { build } from 'esbuild'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { PDFDocument, PDFName, PDFArray, PDFRawStream, PDFNumber, decodePDFRawStream } from 'pdf-lib'

mkdirSync('tmp/pdfs', { recursive: true })
await build({entryPoints:['src/ui/color/icc.ts','src/ui/pdf/cmykPdf.ts'],outdir:'tmp/icc-test',outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',loader:{'.icc':'binary','.wasm':'binary'},external:['pdf-lib']})
const { BUILTIN_PROFILES, createIccConverter, rgbaToRgb, validatePrintProfile } = await import(pathToFileURL(resolve('tmp/icc-test/color/icc.mjs')))
const { buildCmykRasterPdf } = await import(pathToFileURL(resolve('tmp/icc-test/pdf/cmykPdf.mjs')))
const profile = BUILTIN_PROFILES[0]
await assert.rejects(()=>validatePrintProfile(new Uint8Array(200)),/ICC/)
const bogus = profile.bytes.slice(); bogus[16]=82; bogus[17]=71; bogus[18]=66; bogus[19]=32
await assert.rejects(()=>validatePrintProfile(bogus),/CMYK/)
const converter = await createIccConverter(profile)
const colors = new Uint8Array([255,255,255,0,0,0,255,0,0,0,255,0,0,0,255,128,128,128,160,120,90,60,100,140])
const cmyk = converter.toCmyk(colors)
assert.equal(cmyk.length,colors.length/3*4)
assert(cmyk[4]>0 && cmyk[5]>0, 'ICC black differs from the old formula')
assert.deepEqual([...cmyk.slice(0,4)],[0,0,0,0])
assert.deepEqual([...rgbaToRgb(new Uint8Array([0,0,0,0,0,0,0,128]))],[255,255,255,127,127,127])
writeFileSync('tmp/pdfs/icc-swatches.json',JSON.stringify({rgb:[...colors],cmyk:[...cmyk],proof:[...converter.toRgb(cmyk)]}))
const scene=(dpi)=>{
 const width=Math.round(100/25.4*dpi),height=Math.round(72/25.4*dpi),data=new Uint8ClampedArray(width*height*4)
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,u=x/width,v=y/height;let color=[255,255,255],a=255
  if(u>.11&&u<.89&&v>.153&&v<.847){color=[Math.round(50+160*u),Math.round(65+135*v),Math.round(90+65*u)];if(v>.6){color=[160,80,120];a=128}}
  if(v>.25&&v<.5&&u>.2&&u<.8){const n=Math.min(7,Math.floor((u-.2)/.6*8));color=[...colors.slice(n*3,n*3+3)]}
  if((Math.abs(v-.153)<.001||Math.abs(v-.847)<.001)&&(u<.08||u>.92))color=[0,0,0]
  data.set([...color,a],i)
 }
 return {width,height,data,widthMm:100,heightMm:72,trimInsetMm:11,bleedMm:3}
}
for(const dpi of [150,300,600]){
 const input=scene(dpi),bytes=await buildCmykRasterPdf([input],profile),path=`tmp/pdfs/icc-${dpi}.pdf`;writeFileSync(path,bytes)
 const doc=await PDFDocument.load(bytes);assert.equal(doc.getPageCount(),1)
 const intents=doc.catalog.lookup(PDFName.of('OutputIntents'),PDFArray),intent=intents.lookup(0),icc=intent.lookup(PDFName.of('DestOutputProfile'),PDFRawStream)
 assert.equal(icc.dict.lookup(PDFName.of('N'),PDFNumber).asNumber(),4)
 assert.deepEqual(decodePDFRawStream(icc).decode(),profile.bytes)
 const page=doc.getPage(0);assert(Math.abs(page.getTrimBox().width-78*72/25.4)<.0001);assert(Math.abs(page.getBleedBox().width-84*72/25.4)<.0001)
 const images=doc.context.enumerateIndirectObjects().map(x=>x[1]).filter(x=>x instanceof PDFRawStream&&x.dict.get(PDFName.of('Subtype'))===PDFName.of('Image'))
 assert.equal(images.length,1);const image=images[0];assert.equal(image.dict.lookup(PDFName.of('Width'),PDFNumber).asNumber(),input.width)
 const cs=image.dict.lookup(PDFName.of('ColorSpace'),PDFArray);assert.equal(cs.lookup(0),PDFName.of('ICCBased'));assert.equal(cs.lookup(1),icc)
 const samples=decodePDFRawStream(image).decode();assert.equal(samples.length,input.width*input.height*4);assert(!Buffer.from(bytes).includes(Buffer.from('/DeviceRGB')))
 console.log(`${dpi} DPI: ${input.width}x${input.height}, ${bytes.length} bytes, 4-channel ICCBased, embedded profile verified`)
}
const other=await buildCmykRasterPdf([scene(150)],BUILTIN_PROFILES[1]);writeFileSync('tmp/pdfs/icc-other.pdf',other)
const multi=await buildCmykRasterPdf([scene(150),scene(150)],profile);assert.equal((await PDFDocument.load(multi)).getPageCount(),2)
converter.dispose()
console.log('ICC, alpha, DPI, TrimBox, BleedBox, profile selection and multi-page regression tests passed.')

