import esbuild from 'esbuild'
import { mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'fs'

const isWatch = process.argv.includes('--watch')
mkdirSync('dist', { recursive: true })

const common = {
  bundle: true,
  loader: { '.icc': 'binary', '.wasm': 'binary' },
  external: ['module', 'fs', 'path', 'url'],
  target: ['chrome110'],
  logLevel: 'info',
}

async function buildCode() {
  await esbuild.build({
    ...common,
    entryPoints: ['src/code.ts'],
    outfile: 'dist/code.js',
    minify: !isWatch,
  })
}

// 构建 UI 到内存，然后内联进自包含的 ui.html
async function buildUI() {
  const result = await esbuild.build({
    ...common,
    entryPoints: ['src/ui/ui.tsx'],
    outfile: 'dist/ui.js',
    write: false,
    minify: !isWatch,
  })

  let js = ''
  let css = ''
  for (const f of result.outputFiles) {
    if (f.path.endsWith('ui.js')) js = f.text
    if (f.path.endsWith('ui.css')) css = f.text
  }

  // 防止脚本中的 </script> 破坏 HTML
  const safeJs = js.replace(/<\/script>/g, '<\\/script>')

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
${css}
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script>
${safeJs}
    </script>
  </body>
</html>
`
  writeFileSync('dist/ui.html', html)
}

async function buildAll() {
  await buildCode()
  await buildUI()
  copyFileSync('src/manifest.json', 'dist/manifest.json')
  writeFileSync('dist/THIRD_PARTY_NOTICES.txt', [
    'assets/licenses/lcms-wasm-MIT.txt',
    'assets/licenses/LittleCMS-MIT.txt',
    'assets/licenses/HEIDELBERG-ICC.txt',
  ].map(path => readFileSync(path, 'utf8')).join('\n\n'))
}

if (isWatch) {
  const codeCtx = await esbuild.context({
    ...common,
    entryPoints: ['src/code.ts'],
    outfile: 'dist/code.js',
  })

  const uiCtx = await esbuild.context({
    ...common,
    entryPoints: ['src/ui/ui.tsx'],
    outfile: 'dist/ui.js',
    write: false,
    plugins: [
      {
        name: 'inline-html',
        setup(build) {
          build.onEnd(async () => {
            await buildUI()
            copyFileSync('src/manifest.json', 'dist/manifest.json')
          })
        },
      },
    ],
  })

  await codeCtx.watch()
  await uiCtx.watch()
  await buildAll()
  console.log('[印前助手] 监听中，修改源码将自动重建...')
} else {
  await buildAll()
  console.log('[印前助手] 构建完成，产物在 dist/ 目录（ui.html 已自包含）')
}
