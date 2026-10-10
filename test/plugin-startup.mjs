import {build} from 'esbuild'
import {Script,createContext} from 'node:vm'
import assert from 'node:assert/strict'

const built=await build({entryPoints:['src/code.ts'],bundle:true,platform:'browser',write:false,define:{__html__:JSON.stringify('<html>test UI</html>')}})
const code=built.outputFiles[0].text
const events=new Map(),messages=[],pages=[]
let allPageLoads=0,documentListeners=0,shown=0
function makePage(id) {
 let resolve,reject,loaded=false
 const pending=new Promise((yes,no)=>{resolve=()=>{loaded=true;yes()};reject=no})
 const listeners=new Set()
 const page={id,type:'PAGE',selection:[],children:[],removed:false,loads:0,listeners,
  loadAsync(){this.loads++;return pending},
  on(type,callback){assert.equal(type,'nodechange');if(!loaded)throw new Error('nodechange registered before page load');listeners.add(callback)},
  off(type,callback){assert.equal(type,'nodechange');listeners.delete(callback)},
  resolve,reject}
 pages.push(page);return page
}
const a=makePage('A'),b=makePage('B'),c=makePage('C'),d=makePage('D'),e=makePage('E')
const figma={currentPage:a,ui:{postMessage:m=>messages.push(m)},showUI(){shown++},
 on(type,callback){
  if(type==='documentchange'){documentListeners++;throw new Error('Cannot register documentchange handler in incremental mode without calling figma.loadAllPagesAsync first.')}
  const list=events.get(type)??new Set();list.add(callback);events.set(type,list)
 },
 off(type,callback){events.get(type)?.delete(callback)},
 loadAllPagesAsync(){allPageLoads++;throw new Error('Startup must only load the current page')}
}
const fire=type=>{for(const callback of [...(events.get(type)??[])])callback()}
const flush=()=>new Promise(resolve=>setImmediate(resolve))
const context=createContext({figma,console,setTimeout,clearTimeout,Uint8Array,Symbol})
new Script(code).runInContext(context)
assert.equal(shown,1);assert.equal(documentListeners,0);assert.equal(allPageLoads,0)
assert.equal(a.loads,1);assert.equal(a.listeners.size,0)
assert.equal(typeof figma.ui.onmessage,'function','UI message handler is ready while page loading')
await figma.ui.onmessage({type:'init'});assert(messages.some(m=>m.type==='init-result'))
await figma.ui.onmessage({type:'get-frame-info',payload:{target:'page'}})
a.resolve();await flush();assert.equal(a.listeners.size,1)
const before=messages.filter(m=>m.type==='preflight-invalidated').length
for(const callback of a.listeners)callback({nodeChanges:[]})
assert.equal(messages.filter(m=>m.type==='preflight-invalidated').length,before+1)
assert.equal(messages.at(-1).payload.revision,1)
fire('stylechange');assert.equal(messages.at(-1).payload.revision,2)

// Locating a result is a selection change, not a new inspection scope.
const located={id:'text-1',type:'TEXT',visible:true},manual={id:'text-2',type:'TEXT',visible:true}
let selection=[]
Object.defineProperty(a,'selection',{get:()=>selection,set:value=>{selection=value;fire('selectionchange')}})
figma.getNodeByIdAsync=async id=>id===located.id?located:manual
let zooms=0;figma.viewport={scrollAndZoomIntoView(){zooms++}}
const beforeLocate=messages.length
await figma.ui.onmessage({type:'select-node',payload:{nodeId:located.id}})
assert.equal(a.selection[0],located);assert.equal(zooms,1)
assert.equal(messages.length,beforeLocate+1,'locating refreshes the current selection without clearing results')
assert.equal(messages.at(-1).type,'frame-info')
await figma.ui.onmessage({type:'select-node',payload:{nodeId:located.id}})
assert.equal(messages.length,beforeLocate+1,'repeated locating also preserves results')
a.selection=[manual]
assert.equal(messages.at(-2).type,'preflight-invalidated','manual selection still invalidates')
assert.equal(messages.at(-1).payload.revision,3)
await figma.ui.onmessage({type:'select-node',payload:{nodeId:located.id}})
const beforeEdit=messages.length
for(const callback of a.listeners)callback({nodeChanges:[]})
assert.equal(messages.length,beforeEdit+2,'document edits after locating still invalidate')

figma.currentPage=b;fire('currentpagechange')
assert.equal(a.listeners.size,0);assert.equal(b.loads,1);assert.equal(b.listeners.size,0)
// Switching again before B resolves must not attach a stale listener later.
figma.currentPage=c;fire('currentpagechange');b.resolve();await flush()
assert.equal(b.listeners.size,0);assert.equal(c.listeners.size,0)
c.resolve();await flush();assert.equal(c.listeners.size,1)

figma.currentPage=d;fire('currentpagechange');assert.equal(c.listeners.size,0)
d.reject(new Error('page loading failed'));await flush()
assert.equal(d.listeners.size,0)
assert(messages.some(m=>m.type==='error'&&m.payload.message.includes('page loading failed')))

figma.currentPage=e;fire('currentpagechange');fire('close');e.resolve();await flush()
assert.equal(e.listeners.size,0)
for(const type of ['currentpagechange','stylechange','close'])assert.equal(events.get(type).size,0)
assert.equal(allPageLoads,0);assert.equal(documentListeners,0)
console.log('Plugin startup passed: strict incremental-mode API, deferred page load, ready UI, node/style invalidation, page-switch races, load errors and close cleanup; no global document listener or full-file load.')
