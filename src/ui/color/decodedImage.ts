export async function decodePng(bytes: Uint8Array): Promise<ImageData> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/png' }))
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('印刷版 PNG 解码失败'))
      image.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true })
    if (!ctx) throw new Error('无法创建图像解码上下文')
    ctx.drawImage(img, 0, 0)
    return ctx.getImageData(0, 0, img.width, img.height)
  } finally { URL.revokeObjectURL(url) }
}
