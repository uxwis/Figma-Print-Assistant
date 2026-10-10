import {readFileSync,writeFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
const {BUILTIN_PROFILES}=await import(pathToFileURL(resolve('tmp/icc-test/color/icc.mjs')))
const {buildCmykRasterPdf}=await import(pathToFileURL(resolve('tmp/icc-test/pdf/cmykPdf.mjs')))
const {width,height}=JSON.parse(readFileSync('tmp/pdfs/raster-reference.json','utf8'))
const data=new Uint8ClampedArray(readFileSync('tmp/pdfs/raster-reference.rgba'))
const raster=await buildCmykRasterPdf([{width,height,data,widthMm:100,heightMm:72,trimInsetMm:11,bleedMm:3}],BUILTIN_PROFILES[0])
writeFileSync('tmp/pdfs/vector-reference-raster-600.pdf',raster)
const vector=readFileSync('tmp/pdfs/vector-600.pdf')
console.log(`Same Chinese/vector/gradient/photo scene at 600 DPI: vector ${vector.length} bytes; whole-page raster ${raster.length} bytes; ${(100*(1-vector.length/raster.length)).toFixed(1)}% size reduction.`)
