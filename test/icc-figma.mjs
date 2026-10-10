import {build} from 'esbuild'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
import assert from 'node:assert/strict'
import {writeFileSync,mkdirSync} from 'node:fs'
await build({entryPoints:['src/plugin/export.ts','src/plugin/printSize.ts'],outdir:'tmp/figma-test',outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm'})
let id=0,settings=[],flattened=[],fontLoads=[],failExport=false,failFlatten=false,missingFont=false,editDuringFontLoad
const page={type:'PAGE',children:[],selection:[]}
const walk=(root,fn)=>{fn(root);for(const child of root.children??[])walk(child,fn)}
const position=n=>{let x=0,y=0;while(n&&n.type!=='PAGE'){x+=n.x;y+=n.y;n=n.parent}return {x,y}}
function make(type,name='') {
 const data={},n={id:String(++id),type,name,parent:page,x:0,y:0,width:1000,height:1000,rotation:0,visible:true,opacity:1,relativeTransform:[[1,0,0],[0,1,0]],
  layoutMode:'NONE',fills:[],strokes:[],effects:[],children:[],getPluginData:k=>data[k]||'',setPluginData:(k,v)=>data[k]=v,
  resize(w,h){this.width=w;this.height=h},resizeWithoutConstraints(w,h){this.resize(w,h)},
  rescale(k){walk(this,c=>{c.width*=k;c.height*=k;c.x*=k;c.y*=k;if(c.fontSize)c.fontSize*=k;if(c.strokeWeight)c.strokeWeight*=k})},
  appendChild(c){const before=position(c),after=position(this);if(c.parent){const i=c.parent.children.indexOf(c);if(i>=0)c.parent.children.splice(i,1)}c.parent=this;this.children.push(c);c.x=before.x-after.x;c.y=before.y-after.y},
  remove(){const i=this.parent.children.indexOf(this);if(i>=0)this.parent.children.splice(i,1)},
  clone(){const c=make(this.type,this.name);for(const key of ['x','y','width','height','rotation','visible','opacity','layoutMode','fills','strokes','effects','fontName','fontSize','characters','getRangeAllFontNames'])c[key]=this[key];for(const [key,value]of Object.entries(data))c.setPluginData(key,value);for(const child of this.children){const cc=child.clone();c.appendChild(cc);cc.x=child.x;cc.y=child.y}return c},
  detachInstance(){this.type='FRAME';return this},
  async exportAsync(config){
   const own=position(this),record={config,width:this.width,height:this.height,types:[],marks:[]};settings.push(record)
   walk(this,n=>{record.types.push(n.type);if(n.getPluginData('isPrintMark')==='true'&&n.type!=='FRAME'){const p=position(n);record.marks.push({type:n.type,name:n.name,x:p.x-own.x,y:p.y-own.y,width:n.width,height:n.height,paths:n.vectorPaths,strokes:n.strokes})}})
   if(failExport)throw new Error('export failed');return new Uint8Array([1,2,3])
  }
 };page.children.push(n);return n
}
globalThis.figma={currentPage:page,mixed:Symbol('mixed'),createFrame:()=>make('FRAME'),createRectangle:()=>make('RECTANGLE'),createVector:()=>make('VECTOR'),
 loadFontAsync:async f=>{if(missingFont)throw new Error('missing');if(editDuringFontLoad){editDuringFontLoad();editDuringFontLoad=undefined}fontLoads.push(f)},
 flatten(nodes,parent,index){if(failFlatten)throw new Error('flatten failed');const old=nodes[0];flattened.push(old);const v=make('VECTOR',old.name);v.resize(old.width,old.height);v.x=old.x;v.y=old.y;old.remove();v.remove();v.parent=parent;parent.children.splice(index,0,v);return v}}
const {exportCmykImages,exportCmykVectorPages}=await import(pathToFileURL(resolve('tmp/figma-test/export.mjs')))
const {savePrintSize}=await import(pathToFileURL(resolve('tmp/figma-test/printSize.mjs')))
const a=make('FRAME','A'),b=make('FRAME','B')
const existing=make('FRAME','旧印刷版');existing.setPluginData('isPrintPlate','true')
savePrintSize(a,{widthMm:100,heightMm:100});savePrintSize(b,{widthMm:50,heightMm:50})
const text=make('TEXT','中文混合字体');text.characters='印刷助手';text.fontSize=12;text.fontName=figma.mixed;text.getRangeAllFontNames=()=>[{family:'Chinese',style:'Regular'},{family:'Latin',style:'Bold'}]
const instance=make('INSTANCE','组件实例');instance.layoutMode='HORIZONTAL';instance.appendChild(text);a.appendChild(instance)
const config={bleed:3,markOffset:3,markLength:5,safetyMargin:3,showCropMarks:true,showRegistration:false,showSafeArea:false,showBleedBox:true}
page.selection=[a]
for(const dpi of [150,300,600]) {
 const images=await exportCmykImages('selection',dpi,config)
 assert.equal(images.length,1);assert.equal(images[0].dpi,dpi);assert.equal(images[0].trimInsetMm,11);assert.equal(images[0].bleedMm,3)
 assert(Math.abs(images[0].widthMm-122)<1e-6)
 assert.equal(settings.at(-1).config.colorProfile,'SRGB');assert.equal(settings.at(-1).config.constraint.value,dpi/72)
 const plates=page.children.filter(f=>f.getPluginData('isPrintPlate')==='true');assert.equal(plates.length,1);assert.equal(plates[0],existing)
 const marks=settings.at(-1).marks
 assert.equal(marks.filter(m=>m.type==='VECTOR').length,8);assert(marks.every(m=>m.x>=0&&m.y>=0&&m.x<settings.at(-1).width&&m.y<settings.at(-1).height),'marks stay within the exported page after reparenting')
 const border=marks.find(m=>m.name==='出血框');assert(border);assert.equal(border.strokes[0].color.r,1)
 assert(Math.abs(border.width-106*72/25.4)<1e-8)
 assert.equal(a.width,1000);assert.equal(text.type,'TEXT');assert.equal(text.fontSize,12)
}
const vector=await exportCmykVectorPages('selection',300,config)
mkdirSync('tmp/pdfs',{recursive:true});writeFileSync('tmp/pdfs/marks-geometry.json',JSON.stringify(settings.at(-1)))
assert.equal(vector[0].kind,'vector');assert.equal(settings.at(-1).config.format,'PDF');assert(!settings.at(-1).types.includes('TEXT'))
assert.equal(settings.at(-1).config.useAbsoluteBounds,true);assert.equal(settings.at(-1).config.colorProfile,'SRGB')
assert(flattened.length>0 && !flattened.includes(text));assert(fontLoads.some(f=>f.family==='Chinese'));assert(fontLoads.some(f=>f.family==='Latin'))
assert.equal(instance.type,'INSTANCE');assert.equal(instance.layoutMode,'HORIZONTAL');assert.equal(text.type,'TEXT')
assert.equal(page.children.filter(n=>n.getPluginData('isPrintPlate')==='true').length,1)
failExport=true;await assert.rejects(()=>exportCmykVectorPages('selection',300,config),/export failed/);failExport=false
assert.equal(page.children.filter(n=>n.getPluginData('isPrintPlate')==='true').length,1)
failFlatten=true;await assert.rejects(()=>exportCmykVectorPages('selection',300,config),/转曲失败/);failFlatten=false
assert.equal(page.children.filter(n=>n.getPluginData('isPrintPlate')==='true').length,1)
missingFont=true;await assert.rejects(()=>exportCmykVectorPages('selection',300,config),/不可用/);missingFont=false
page.selection=[b];const small=await exportCmykImages('selection',300,config);assert(Math.abs(small[0].widthMm-72)<1e-6)
assert.equal(page.children.find(n=>n.getPluginData('isPrintPlate')==='true'),existing)
page.selection=[a,b];assert.equal((await exportCmykVectorPages('selection',300,config)).length,2)
editDuringFontLoad=()=>{b.width=1100}
await assert.rejects(()=>exportCmykVectorPages('selection',300,config),/重新确认/);b.width=1000
assert.equal(page.children.filter(n=>n.getPluginData('isPrintPlate')==='true').length,1)
await assert.rejects(()=>exportCmykImages('selection',72,config),/DPI/)
b.width=1100;await assert.rejects(()=>exportCmykImages('selection',300,config),/重新确认/)
page.selection=[];await assert.rejects(()=>exportCmykImages('selection',300,config),/选中/)
const unknown=make('FRAME','未知成品尺寸');unknown.resize(595,842);page.selection=[unknown]
for(const dpi of [150,300,600]) {
 const pages=await exportCmykVectorPages('selection',dpi,config)
 assert(Math.abs(pages[0].widthMm-(595*25.4/72+22))<1e-8)
 assert.equal(unknown.getPluginData('printAssistant.size.v1'),'')
 assert.equal(page.children.filter(n=>n.getPluginData('isPrintPlate')==='true').length,1)
}
await exportCmykImages('selection',300,{...config,showCropMarks:false,showBleedBox:false})
assert.equal(settings.at(-1).marks.length,0)
assert.deepEqual(page.children,[a,b,existing,unknown],'all temporary nodes cleaned up; existing originals and plate remain')
console.log('Figma contracts passed: physical plate dimensions, DPI-independent trim, RGB raster settings, mixed-font outlining, instance/auto-layout isolation, original preservation, multi-page and cleanup on failure.')
