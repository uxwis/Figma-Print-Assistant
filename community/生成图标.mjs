import {createRequire} from 'node:module'
import {writeFileSync} from 'node:fs'
import {resolve} from 'node:path'

const require=createRequire(import.meta.url)
const {chromium}=require('C:/Users/wis/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><title>印刷助手应用图标</title><rect width="64" height="64" rx="16" fill="#08675e"/><path d="M18 29V18h11m6 0h11v11m0 6v11H35m-6 0H18V35" stroke="#bff0d2" stroke-width="3"/><rect x="25" y="25" width="14" height="14" rx="2" fill="#bff0d2"/></svg>'
writeFileSync(resolve('community/应用图标.svg'),svg)
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
try {
 for(const size of [128,512]) {
  const page=await browser.newPage({viewport:{width:size,height:size},deviceScaleFactor:1})
  await page.setContent(`<html><style>html,body{margin:0;padding:0;background:transparent;width:100%;height:100%;overflow:hidden}svg{display:block;width:100%;height:100%}</style><body>${svg}</body></html>`)
  await page.screenshot({path:resolve(`community/应用图标_${size}x${size}.png`),omitBackground:true})
  await page.close()
 }
 console.log('已生成 128×128、512×512 透明背景 PNG 和 SVG 矢量图标。')
} finally {await browser.close()}
