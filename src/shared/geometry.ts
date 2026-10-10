export type Linear = [number, number, number, number] // [a,b,c,d], x'=ax+cy, y'=bx+dy
export const IDENTITY: Linear = [1, 0, 0, 1]
export function multiply(a: Linear, b: Linear): Linear {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3]]
}
export function inverse(a: Linear): Linear | undefined {
  const det = a[0]*a[3]-a[1]*a[2]
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return undefined
  return [a[3]/det, -a[1]/det, -a[2]/det, a[0]/det]
}
export function maxScale(a: Linear): number {
  const u = a[0]*a[0]+a[1]*a[1], v = a[2]*a[2]+a[3]*a[3], cross = a[0]*a[2]+a[1]*a[3]
  return Math.sqrt((u+v+Math.sqrt((u-v)*(u-v)+4*cross*cross))/2)
}
export function minScale(a: Linear): number {
  const max = maxScale(a)
  return max > 0 ? Math.abs(a[0]*a[3]-a[1]*a[2])/max : 0
}

// Maps source image pixels into node coordinates. CROP maps node-normalized -> image-normalized.
export function imagePixelMatrix(paint: { scaleMode: string; imageTransform?: readonly (readonly number[])[]; scalingFactor?: number; rotation?: number },
  nodeW: number, nodeH: number, imageW: number, imageH: number): Linear | undefined {
  if (Math.min(nodeW, nodeH, imageW, imageH) <= 0) return undefined
  if (paint.scaleMode === 'CROP') {
    const t = paint.imageTransform ?? [[1,0,0],[0,1,0]]
    const inv = inverse([t[0][0],t[1][0],t[0][1],t[1][1]])
    return inv && multiply([nodeW,0,0,nodeH], multiply(inv,[1/imageW,0,0,1/imageH]))
  }
  const angle = (paint.rotation ?? 0)*Math.PI/180
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const rotatedW = Math.abs(cos)*imageW+Math.abs(sin)*imageH
  const rotatedH = Math.abs(sin)*imageW+Math.abs(cos)*imageH
  const scale = paint.scaleMode === 'TILE' ? (paint.scalingFactor ?? 1) :
    (paint.scaleMode === 'FIT' ? Math.min(nodeW/rotatedW,nodeH/rotatedH) : Math.max(nodeW/rotatedW,nodeH/rotatedH))
  return Number.isFinite(scale) && scale > 0 ? [scale*cos,scale*sin,-scale*sin,scale*cos] : undefined
}
