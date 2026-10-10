import { isPrintable, walk } from './utils'

export async function loadFrameFonts(frame: FrameNode): Promise<void> {
  const fonts = new Map<string,FontName>()
  walk(frame, node => {
    if (node.type !== 'TEXT' || !isPrintable(node) || !node.characters.length) return
    for (const font of node.getRangeAllFontNames(0,node.characters.length)) fonts.set(`${font.family}|${font.style}`,font)
  })
  for (const font of fonts.values()) {
    try { await figma.loadFontAsync(font) }
    catch { throw new Error(`字体“${font.family} ${font.style}”不可用，请安装字体后重新导出`) }
  }
}

// This only receives a temporary export clone, never the original frame or the visible print plate.
export async function outlineText(frame: FrameNode): Promise<void> {
  await loadFrameFonts(frame)
  function prepare(parent: BaseNode & ChildrenMixin) {
    // Capture absolute geometry before outlining; an auto-layout replacement must not reflow siblings.
    if ('layoutMode' in parent && parent.layoutMode !== 'NONE') {
      const container=parent as FrameNode
      const geometry=container.children.map(child=>({child,width:child.width,height:child.height,
        transform:child.relativeTransform.map(row=>[...row]) as Transform}))
      const width=container.width,height=container.height
      container.layoutMode='NONE'
      container.resizeWithoutConstraints(width,height)
      for(const saved of geometry) {
        if ('resizeWithoutConstraints' in saved.child) saved.child.resizeWithoutConstraints(saved.width,saved.height)
        saved.child.relativeTransform=saved.transform
      }
    }
    for (let node of [...parent.children]) {
      if (!isPrintable(node)) continue
      if (node.type === 'INSTANCE') node = node.detachInstance()
      if (node.type === 'TEXT') {
        if (!node.characters.length) { node.remove(); continue }
        const index = parent.children.indexOf(node)
        try { figma.flatten([node], parent, index) }
        catch { throw new Error(`文字“${node.name}”转曲失败，请检查字体和图层结构`) }
      } else if ('children' in node) prepare(node)
    }
  }
  prepare(frame)
}
