import {build} from 'esbuild'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
import assert from 'node:assert/strict'
import {PDFDocument,PDFName,PDFArray,PDFDict,PDFNumber,PDFRawStream,decodePDFRawStream,rgb} from 'pdf-lib'
mkdirSync('tmp/pdfs',{recursive:true})
await build({entryPoints:['src/ui/pdf/vectorCmyk.ts','src/ui/color/icc.ts','src/ui/pdf/pdfFunctions.ts','src/ui/pdf/contentStream.ts','src/ui/pdf/pdfImages.ts'],outdir:'tmp/vector-test',outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',loader:{'.icc':'binary','.wasm':'binary'},external:['pdf-lib']})
const load=p=>import(pathToFileURL(resolve(`tmp/vector-test/${p}.mjs`)))
const {buildCmykVectorPdf}=await load('pdf/vectorCmyk'),{BUILTIN_PROFILES,createIccConverter}=await load('color/icc')
const {parseInstructions,emitInstruction}=await load('pdf/contentStream'),{pdfFunction}=await load('pdf/pdfFunctions')
const {decodeImageSamples}=await load('pdf/pdfImages')
const N=PDFName.of
const encode=s=>new TextEncoder().encode(s)
function allObjects(doc) {
 const seen=new Set(),out=[]
 function visit(value) {
  const obj=doc.context.lookup(value)
  if(!obj||seen.has(obj))return
  seen.add(obj);out.push(obj)
  if(obj instanceof PDFRawStream)visit(obj.dict)
  else if(obj instanceof PDFDict)for(const [,value]of obj.entries())visit(value)
  else if(obj instanceof PDFArray)for(let i=0;i<obj.size();i++)visit(obj.get(i))
 }
 for(const [,obj]of doc.context.enumerateIndirectObjects())visit(obj)
 return out
}
export async function fixture({blend='Normal',shadeType=2,text=false,maskTransfer=false}={}) {
 const doc=await PDFDocument.create(),page=doc.addPage([100*72/25.4,72*72/25.4]),ctx=doc.context
 const sourceICC=ctx.register(ctx.flateStream(readFileSync('test/fixtures/source-srgb.icc'),{N:3,Alternate:'DeviceRGB'}))
 const sourceCS=ctx.obj(['ICCBased',sourceICC])
 const width=600,height=400,pixels=new Uint8Array(width*height*3),alpha=new Uint8Array(width*height)
 for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
  const i=y*width+x;pixels.set([Math.round(70+100*x/width),Math.round(80+120*y/height),145],i*3)
  alpha[i]=Math.round(255*Math.min(1,x/50,(width-x-1)/50,y/50,(height-y-1)/50))
 }
 const mask=ctx.register(ctx.flateStream(alpha,{Type:'XObject',Subtype:'Image',Width:width,Height:height,ColorSpace:'DeviceGray',BitsPerComponent:8}))
 const image=ctx.register(ctx.flateStream(pixels,{Type:'XObject',Subtype:'Image',Width:width,Height:height,ColorSpace:sourceCS,BitsPerComponent:8,SMask:mask}))
 const linear=ctx.obj({ShadingType:shadeType,ColorSpace:sourceCS,Coords:[0,0,120,0],Extend:[true,true],Function:{FunctionType:3,Domain:[0,1],Functions:[{FunctionType:2,Domain:[0,1],C0:[0.1,0.2,0.8],C1:[0.5,0.8,0.4],N:1},{FunctionType:2,Domain:[0,1],C0:[0.5,0.8,0.4],C1:[0.9,0.15,0.3],N:1}],Bounds:[0.5],Encode:[0,1,0,1]}})
 const radial=ctx.obj({ShadingType:3,ColorSpace:'DeviceRGB',Coords:[40,30,0,40,30,40],Extend:[true,true],Function:{FunctionType:2,Domain:[0,1],C0:[1,1,1],C1:[0.2,0.4,0.8],N:1}})
 const form=ctx.register(ctx.flateStream(encode('/C1 cs 0.5 scn 0 0 30 20 re f\nq /DeviceRGB cs 1 0 0 scn 5 5 10 10 re f Q\n0.25 scn 35 0 20 20 re f'),{Type:'XObject',Subtype:'Form',BBox:[0,0,55,20],Resources:{ColorSpace:{C1:'DeviceGray'}},Group:{S:'Transparency',CS:'DeviceRGB',I:true}}))
 const shadowPixels=new Uint8Array(200*100)
 for(let y=0;y<100;y++)for(let x=0;x<200;x++)shadowPixels[y*200+x]=Math.round(255*Math.sin(Math.PI*x/199)*Math.sin(Math.PI*y/99))
 const shadowImage=ctx.register(ctx.flateStream(shadowPixels,{Type:'XObject',Subtype:'Image',Width:200,Height:100,ColorSpace:'DeviceGray',BitsPerComponent:8}))
 const shadowForm=ctx.register(ctx.flateStream(encode('/MaskGray cs 0.5 scn q 40 0 0 20 0 0 cm /Shadow Do Q'),{Type:'XObject',Subtype:'Form',BBox:[0,0,40,20],Matrix:[1,0,0,1,190,70],Resources:{ColorSpace:{DefaultGray:'DeviceGray',MaskGray:'DeviceGray'},XObject:{Shadow:shadowImage}},Group:{S:'Transparency',CS:'DeviceGray',I:true}}))
 const state=ctx.obj({Type:'ExtGState',BM:blend,ca:0.5,CA:0.5}),shadowState=ctx.obj({Type:'ExtGState',SMask:{S:'Luminosity',G:shadowForm}})
 if(maskTransfer)shadowState.lookup(N('SMask')).set(N('TR'),ctx.register(ctx.flateStream(encode('{1 exch sub}'),{FunctionType:4,Domain:[0,1],Range:[0,1]})))
 page.node.set(N('Resources'),ctx.obj({ColorSpace:{C1:sourceCS},XObject:{Photo:image,Gray:form},Shading:{Linear:linear},Pattern:{Radial:{Type:'Pattern',PatternType:2,Shading:radial,Matrix:[1,0,0,1,145,100]}},ExtGState:{Half:state,Shadow:shadowState}}))
 const draws=[
  '/C1 cs 1 1 1 scn 0 0 284 205 re f',
  '/C1 cs 0.1 0.3 0.6 scn 15 177 250 0.8 re f',
  'q 15 90 120 45 re W n 1 0 0 1 15 90 cm /Linear sh Q',
  '/Pattern cs /Radial scn 150 110 80 60 re f',
  'q 72 0 0 48 20 30 cm /Photo Do Q q 24 0 0 16 110 30 cm /Photo Do Q',
  'q 1 0 0 1 20 145 cm /Gray Do Q',
  '/C1 cs 0 1 0 scn 90 145 30 20 re f',
  'q /Half gs /DeviceRGB cs 0.8 0.2 0.1 scn 70 115 30 30 re f Q',
  'q /Shadow gs 0 0 0 rg 190 70 40 20 re f Q',
  'q /DeviceRGB cs 0.1 0.2 0.3 scn [3 2] 0 d 0.5 w 10 10 m 272 10 l S Q',
  '/Span << /ActualText (metadata) >> BDC 0 0 m EMC',
  ...(text?['BT /F1 12 Tf (unoutlined) Tj ET']:[])
 ]
 const stream=ctx.register(ctx.flateStream(encode(draws.join('\n'))));page.node.set(N('Contents'),stream)
 const glyphs=JSON.parse(readFileSync('test/fixtures/outlined-glyphs.json','utf8'))
 let x=15
 for(const glyph of glyphs.glyphs) {
  if(glyph.path)page.drawSvgPath(glyph.path,{x,y:184,scale:15/glyphs.units,color:rgb(0.1,0.2,0.3)})
  x+=glyph.advance*15/glyphs.units
 }
 return {bytes:await doc.save({useObjectStreams:false}),pixels,width,height}
}
const input=await fixture();writeFileSync('tmp/pdfs/vector-native.pdf',input.bytes)
const payload=bytes=>({kind:'vector',bytes,name:'中文矢量样稿',widthMm:100,heightMm:72,trimInsetMm:11,bleedMm:3})
let outputs=[]
for(const dpi of [150,300,600]) {
 const result=await buildCmykVectorPdf([payload(input.bytes)],BUILTIN_PROFILES[0],dpi)
 writeFileSync(`tmp/pdfs/vector-${dpi}.pdf`,result.bytes);outputs.push(result)
 const doc=await PDFDocument.load(result.bytes),page=doc.getPage(0),objects=allObjects(doc)
 const intents=doc.catalog.lookup(N('OutputIntents'),PDFArray),icc=intents.lookup(0).lookup(N('DestOutputProfile'),PDFRawStream)
 assert.deepEqual(decodePDFRawStream(icc).decode(),BUILTIN_PROFILES[0].bytes)
 assert.equal(icc.dict.lookup(N('N'),PDFNumber).asNumber(),4)
 assert(Math.abs(page.getTrimBox().width-78*72/25.4)<1e-6);assert(Math.abs(page.getBleedBox().width-84*72/25.4)<1e-6)
 assert(!Buffer.from(result.bytes).includes(Buffer.from('/DeviceRGB')))
 const images=objects.filter(o=>o instanceof PDFRawStream&&o.dict.lookup(N('Subtype'))===N('Image'))
 const photo=images.find(o=>o.dict.lookup(N('ColorSpace')) instanceof PDFArray)
 assert(photo);assert.equal(photo.dict.lookup(N('Width'),PDFNumber).asNumber(),dpi)
 assert.equal(photo.dict.lookup(N('Height'),PDFNumber).asNumber(),Math.ceil(dpi*2/3))
 assert.equal(images.filter(o=>o.dict.lookup(N('ColorSpace')) instanceof PDFArray).length,1,'shared image not duplicated or original retained')
 const mask=photo.dict.lookup(N('SMask'),PDFRawStream)
 assert.equal(mask.dict.lookup(N('Width'),PDFNumber).asNumber(),dpi);assert.equal(mask.dict.lookup(N('ColorSpace')),N('DeviceGray'))
 const streams=objects.filter(o=>o instanceof PDFRawStream&&o.dict.lookup(N('Subtype'))!==N('Image')&&o.dict.lookup(N('N'))===undefined&&o.dict.lookup(N('FunctionType'))===undefined)
 const content=streams.map(s=>Buffer.from(decodePDFRawStream(s).decode()).toString('latin1')).join('\n')
 assert(!/\bBT\b|\bTj\b/.test(content));assert(/\bre\b|\bm\b/.test(content));assert(/\[\s*3\s+2\s*\]\s+0 d/.test(content))
 assert(content.includes('/MaskGray cs\n0.5 scn'),'luminance mask retained its source color space')
 const shadings=objects.filter(o=>o instanceof PDFDict&&o.lookup(N('ShadingType')) instanceof PDFNumber)
 assert.equal(shadings.length,2);assert(shadings.every(s=>s.lookup(N('ColorSpace')) instanceof PDFArray))
 console.log(`${dpi} DPI vector PDF: ${result.bytes.length} bytes, paths and CMYK gradients retained, photo ${dpi}×${Math.ceil(dpi*2/3)}, matched mask, real ICC and page boxes.`)
}
assert(outputs[2].warnings.some(w=>w.includes('未强行放大')))
const custom=await buildCmykVectorPdf([payload(input.bytes)],BUILTIN_PROFILES[1],300)
assert(!Buffer.from(custom.bytes).equals(Buffer.from(outputs[1].bytes)))
const multi=await buildCmykVectorPdf([payload(input.bytes),{...payload(input.bytes),name:'第二页',widthMm:50,heightMm:36,trimInsetMm:3,bleedMm:1}],BUILTIN_PROFILES[0],300)
writeFileSync('tmp/pdfs/vector-multi.pdf',multi.bytes)
assert.equal((await PDFDocument.load(multi.bytes)).getPageCount(),2)
const inverted=await fixture({maskTransfer:true})
const inversionResult=await buildCmykVectorPdf([payload(inverted.bytes)],BUILTIN_PROFILES[0],300)
const inversionDoc=await PDFDocument.load(inversionResult.bytes)
const transfer=allObjects(inversionDoc).find(o=>o instanceof PDFRawStream&&o.dict.lookup(N('FunctionType')) instanceof PDFNumber&&o.dict.lookup(N('FunctionType')).asNumber()===4)
assert(transfer);assert.equal(Buffer.from(decodePDFRawStream(transfer).decode()).toString(),'{1 exch sub}')
writeFileSync('tmp/pdfs/mask-transfer-native.pdf',inverted.bytes);writeFileSync('tmp/pdfs/mask-transfer-cmyk.pdf',inversionResult.bytes)
for(const options of [{blend:'Multiply'},{shadeType:4},{text:true}])await assert.rejects(async()=>buildCmykVectorPdf([payload((await fixture(options)).bytes)],BUILTIN_PROFILES[0],300),/整页栅格/)
assert.equal(parseInstructions('[1 2 3] 0 d')[0].operands[0].raw,'[ 1 2 3]')
assert.throws(()=>parseInstructions('BI /W 1 ID x EI'),/内联图像/)
const fnDoc=await PDFDocument.create(),ctx=fnDoc.context
const fn=pdfFunction(ctx.obj({FunctionType:2,Domain:[0,1],C0:[0,0,0],C1:[1,0.5,0.25],N:2}))
assert.deepEqual(fn.evaluate(0.5),[0.25,0.125,0.0625])
const predictive=ctx.flateStream(new Uint8Array([1,10,20,30,30,30,30,2,60,60,60,60,60,60]),{Type:'XObject',Subtype:'Image',Width:2,Height:2,ColorSpace:'DeviceRGB',BitsPerComponent:8,DecodeParms:{Predictor:15,Columns:2,Colors:3,BitsPerComponent:8}})
assert.deepEqual([...await decodeImageSamples(predictive,3)],[10,20,30,40,50,60,70,80,90,100,110,120])
const stencil=ctx.flateStream(new Uint8Array([0b10101010,0b10000000,0b01010101,0]),{Type:'XObject',Subtype:'Image',Width:9,Height:2,ImageMask:true,BitsPerComponent:1,Decode:[1,0]})
assert.deepEqual([...await decodeImageSamples(stencil,1)],[0,255,0,255,0,255,0,255,0,255,0,255,0,255,0,255,0,255])
await assert.rejects(()=>decodeImageSamples(ctx.flateStream(new Uint8Array(8),{Width:1,Height:1,ColorSpace:'DeviceRGB',BitsPerComponent:16}),3),/16 位/)
const converter=await createIccConverter(BUILTIN_PROFILES[0],{bytes:new Uint8Array(readFileSync('test/fixtures/source-srgb.icc')),channels:3})
const doc=await PDFDocument.load(outputs[2].bytes)
const photo=doc.context.enumerateIndirectObjects().map(x=>x[1]).find(o=>o instanceof PDFRawStream&&o.dict.lookup(N('Subtype'))===N('Image')&&o.dict.lookup(N('ColorSpace')) instanceof PDFArray)
assert(Buffer.from(decodePDFRawStream(photo).decode()).equals(Buffer.from(converter.toCmyk(input.pixels))),'embedded source ICC image samples differ');converter.dispose()
console.log('Vector conversion passed: scoped RGB/gray resources, q/Q restoration, ICC pixels, transparency, linear/radial gradients, shared-image maximum placement, mode errors, multi-page and token preservation.')
