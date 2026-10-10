import {createRequire} from 'node:module'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const require=createRequire(import.meta.url)
const {chromium}=require('C:/Users/wis/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const dir=resolve('community'),sources=resolve(dir,'源文件')
mkdirSync(sources,{recursive:true})
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
const errors=[]
try{
 const ui=await browser.newPage({viewport:{width:480,height:560},deviceScaleFactor:2})
 ui.on('pageerror',e=>errors.push(e.message))
 await ui.addInitScript(()=>{
  const frame={id:'sample',name:'宣传单',widthPx:595,heightPx:842,widthMm:210,heightMm:297,printSizeStatus:'valid',printSize:{widthMm:210,heightMm:297}}
  const post=(type,payload)=>window.postMessage({pluginMessage:{type,payload}},'*')
  window.addEventListener('message',event=>{
   const m=event.data?.pluginMessage
   if(m?.type==='get-frame-info')post('frame-info',{target:'selection',frames:[frame]})
   if(m?.type==='run-preflight')post('preflight-result',{requestId:m.payload.requestId,stale:false,result:{target:'selection',frameCount:1,nodeCount:24,targetDpi:300,complete:true,skippedFrames:[],errorCount:0,warningCount:1,durationMs:42,issues:[{id:'black',type:'four-color-black',severity:'warning',title:'小字使用四色黑',message:'实际字号约 8.00pt，估算色值 C63 M52 Y51 K100',nodeId:'text',nodeName:'正文',frameName:frame.name,fixable:true}]}})
  })
 })
 await ui.goto(pathToFileURL(resolve('dist/ui.html')).href)
 await ui.getByText('成品：210 × 297 mm',{exact:true}).waitFor()
 await ui.getByRole('button',{name:'画板',exact:true}).click()
 await ui.locator('#size-preset').selectOption('A4 210×297')
 await ui.screenshot({path:resolve(sources,'画板界面.png')})
 await ui.reload()
 await ui.getByRole('button',{name:'开始预检',exact:true}).click()
 await ui.getByText('小字使用四色黑',{exact:true}).waitFor()
 await ui.screenshot({path:resolve(sources,'预检界面.png')})
 await ui.getByRole('button',{name:'导出',exact:true}).click()
 await ui.getByRole('button',{name:'导出 CMYK PDF',exact:true}).waitFor()
 await ui.screenshot({path:resolve(sources,'导出界面.png')})
 await ui.locator('.marks-disclosure > summary').click()
 await ui.locator('.marks-disclosure').evaluate(el=>el.scrollIntoView({block:'nearest'}))
 await ui.screenshot({path:resolve(sources,'导出展开界面.png')})
 if(errors.length)throw new Error(errors.join('\n'))
 const img=tab=>'data:image/png;base64,'+readFileSync(resolve(sources,tab+'界面.png')).toString('base64')
 const icon='data:image/svg+xml;base64,'+readFileSync(resolve(dir,'应用图标.svg')).toString('base64')
 const brand=`<div class="brand"><img src="${icon}"><span>印刷助手</span></div>`
 const window=tab=>`<div class="plugin-window"><div class="window-bar"><span>印刷助手</span><span class="window-close">×</span></div><img src="${img(tab)}"><div class="window-foot">界面使用示例</div></div>`
 const base=`*{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;overflow:hidden}body{font-family:'Microsoft YaHei',sans-serif;color:#1d1d1f;background:#f5f5f7}.canvas{position:relative;width:1920px;height:1080px;background:radial-gradient(ellipse at 75% 50%,#fff 0%,#f5f5f7 74%)}.brand{position:absolute;left:120px;top:88px;display:flex;align-items:center;gap:16px;font-weight:500;font-size:27px;letter-spacing:-1px}.brand img{width:42px;height:42px}.footer{position:absolute;left:120px;bottom:82px;color:#8a8a90;font-size:22px}.copy{position:absolute;left:120px;top:390px;width:850px}.copy h1{font-size:84px;line-height:1.3;font-weight:600;letter-spacing:-4px;margin:0 0 28px}.copy p{font-size:29px;line-height:1.7;color:#86868b;margin:0}.page-number{position:absolute;right:120px;top:100px;font-size:22px;letter-spacing:2px;color:#a3a3a8}.plugin-window{width:576px;border:1px solid #e1e1e6;border-radius:15px;overflow:hidden;background:#fff;box-shadow:0 30px 85px #00000014,0 2px 8px #00000005}.window-bar{height:44px;display:flex;align-items:center;padding:0 21px;font-size:15px;background:#fafafa;border-bottom:1px solid #ededf0;color:#55555a}.window-close{margin-left:auto;font-size:22px;font-weight:300;color:#a0a0a6}.plugin-window>img{display:block;width:576px;height:672px}.window-foot{padding:9px 21px;font-size:13px;color:#b0b0b6;border-top:1px solid #f5f5f7}.feature-window{position:absolute;left:1150px;top:188px}.cover .copy{top:348px;width:780px}.cover .copy h1{font-size:122px;letter-spacing:-7px;margin-bottom:34px}.cover .copy p{font-size:44px;letter-spacing:-1px;color:#6e6e73}.cover .quiet{margin-top:46px;font-size:24px;letter-spacing:1px;color:#a2a2a8}.scene{position:absolute;left:1030px;top:160px;width:800px;height:820px}.scene .plugin-window{position:absolute;left:190px;top:110px;transform:scale(.95);transform-origin:top left}.paper{position:absolute;left:-70px;top:45px;width:370px;height:515px;padding:24px;background:#fff;box-shadow:0 28px 55px #00000012;transform:rotate(-9deg)}.poster{position:relative;width:100%;height:100%;background:#ddebf8;overflow:hidden}.poster small{position:absolute;left:23px;top:25px;z-index:2;font-size:11px;letter-spacing:1px;color:#45658b}.poster strong{position:absolute;left:23px;top:67px;font-size:47px;line-height:1.4;font-weight:600;letter-spacing:-3px;z-index:2;color:#163850}.fold{position:absolute;left:72px;top:195px;width:245px;height:275px;background:linear-gradient(140deg,#cfe4f8 0%,#a3c7ec 48%,#5b8cbd 49%,#dbe8f6 85%);clip-path:polygon(0 14%,100% 0,82% 100%,11% 90%);transform:rotate(13deg)}.poster p{position:absolute;left:23px;bottom:22px;font-size:10px;color:#45658b;letter-spacing:1px;margin:0}.trim{position:absolute;inset:17px;border:1px solid #afc3d5}.crop{position:absolute;width:12px;height:12px;border:solid #7a8c9e}.tl{top:7px;left:7px;border-width:0 1px 1px 0}.tr{top:7px;right:7px;border-width:0 0 1px 1px}.bl{bottom:7px;left:7px;border-width:1px 1px 0 0}.br{bottom:7px;right:7px;border-width:1px 0 0 1px}`
 const features=[
 {file:'展示图01_成品尺寸_1920x1080',tab:'画板',title:'尺寸，恰如其分。',sub:'以毫米设置真实成品尺寸。'},
 {file:'展示图02_印刷预检_1920x1080',tab:'预检',title:'交付前，心中有数。',sub:'检查印刷问题，直接定位图层。'},
 {file:'展示图03_印刷导出_1920x1080',tab:'导出',title:'印刷，就绪。',sub:'色彩、出血与裁切，一次准备。'}
 ]
 const render=async(file,body)=>{
  const html=`<!DOCTYPE html><html lang="zh-CN"><meta charset="UTF-8"><title>${file}</title><style>${base}</style><body>${body}</body></html>`
  writeFileSync(resolve(sources,file+'.html'),html)
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1})
  await page.goto(pathToFileURL(resolve(sources,file+'.html')).href)
  await page.evaluate(()=>document.fonts.ready)
  await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())))
  await page.screenshot({path:resolve(dir,file+'.png')})
  await page.close()
 }
 await render('封面_1920x1080',`<div class="canvas cover">${brand}<div class="copy"><h1>印刷助手</h1><p>从画板，到印刷。</p><div class="quiet">尺寸 · 预检 · 导出</div></div><div class="scene"><div class="paper"><div class="poster"><small>纸张与设计</small><strong>纸上，<br>见真章。</strong><div class="fold"></div><p>印刷设计 · 作品示意</p></div><div class="trim"></div><i class="crop tl"></i><i class="crop tr"></i><i class="crop bl"></i><i class="crop br"></i></div>${window('导出')}</div><div class="footer">Figma 中文印前工具</div></div>`)
 for(let i=0;i<features.length;i++){const f=features[i];await render(f.file,`<div class="canvas">${brand}<div class="page-number">0${i+1} / 03</div><div class="copy"><h1>${f.title}</h1><p>${f.sub}</p></div><div class="feature-window">${window(f.tab)}</div><div class="footer">Figma 中文印前工具</div></div>`)}
 const contact=await browser.newPage({viewport:{width:1920,height:1080}})
 await contact.setContent(`<html><body style="margin:0;display:grid;grid-template-columns:1fr 1fr">${['封面_1920x1080',...features.map(f=>f.file)].map(f=>`<img style="width:960px;height:540px" src="data:image/png;base64,${readFileSync(resolve(dir,f+'.png')).toString('base64')}">`).join('')}</body></html>`)
 await contact.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())))
 await contact.screenshot({path:resolve(dir,'素材总览.png')})
 console.log('已生成新版界面截图、简洁封面及三张 1920×1080 展示图。')
}finally{await browser.close()}
