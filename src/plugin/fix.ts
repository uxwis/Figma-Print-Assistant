// 一键修复：将指定文字图层的填充改为单黑 C0 M0 Y0 K100（Figma 中即 #000000）
export async function fixRichBlack(nodeId: string): Promise<void> {
  const node = await figma.getNodeByIdAsync(nodeId)
  if (!node || node.type !== 'TEXT') {
    throw new Error('未找到文字图层，可能已被删除')
  }
  const text = node as TextNode

  // 修改 fills 前必须加载字体
  if (text.fontName !== figma.mixed) {
    await figma.loadFontAsync(text.fontName)
  } else {
    for (let i = 0; i < text.characters.length; i++) {
      const f = text.getRangeFontName(i, i + 1)
      if (f !== figma.mixed) {
        try {
          await figma.loadFontAsync(f)
        } catch {
          // 忽略单个字体加载失败
        }
      }
    }
  }

  text.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }]
}
