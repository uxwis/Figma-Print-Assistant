import { MARK_LAYER_NAME } from '../shared/constants'

// 判断节点是否处于插件生成的标记图层内（避免扫描/重复处理自己的产物）
export function isInsideMarkLayer(node: BaseNode): boolean {
  let n: BaseNode | null = node
  while (n) {
    if (n.name === MARK_LAYER_NAME) return true
    if ('getPluginData' in n && (n as BaseNode & { getPluginData: (k: string) => string }).getPluginData('isPrintMark') === 'true') {
      return true
    }
    n = n.parent
  }
  return false
}

// 获取预检目标画板（始终返回最外层、即页面直接子级的画板）
export function getTargetFrames(target: 'selection' | 'page'): FrameNode[] {
  if (target === 'selection') {
    const sel = figma.currentPage.selection
    if (sel.length === 0) return []

    const frames = new Set<FrameNode>()
    for (const n of sel) {
      let f: FrameNode | null = null
      if (n.type === 'FRAME') f = n
      else {
        let p: BaseNode | null = n.parent
        while (p && p.type !== 'FRAME') p = p.parent
        f = p as FrameNode | null
      }
      if (f) frames.add(toTopFrame(f))
    }
    return [...frames].filter(f => f.getPluginData('isPrintPlate') !== 'true' && f.visible !== false)
  }
  return getTopLevelFrames()
}

// 页面顶层的所有画板
export function getTopLevelFrames(): FrameNode[] {
  return figma.currentPage.children.filter((n): n is FrameNode => n.type === 'FRAME' && n.getPluginData('isPrintPlate') !== 'true' && n.visible !== false)
}

// 向上找到最顶层画板（页面直接子级）
function toTopFrame(f: FrameNode): FrameNode {
  let top: FrameNode = f
  let p = top.parent
  while (p && p.type !== 'PAGE' && p.type !== 'DOCUMENT') {
    if (p.type === 'FRAME') top = p
    p = p.parent
  }
  return top
}

export function isPrintable(node: BaseNode): boolean {
  let current: BaseNode | null = node
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    if ('visible' in current && current.visible === false) return false
    if ('opacity' in current && current.opacity === 0) return false
    current = current.parent
  }
  return !isInsideMarkLayer(node)
}

// 深度优先遍历所有后代
export function walk(node: BaseNode, cb: (n: BaseNode) => void): void {
  if ('children' in node) {
    const children = (node as ChildrenMixin).children
    for (const child of children) {
      cb(child)
      walk(child, cb)
    }
  }
}

// ===== 2D 仿射变换（Figma Transform 为 [[a,b,c],[d,e,f]]）=====
type Mat3 = number[][]

function toMat3(t: number[][]): Mat3 {
  return [
    [t[0][0], t[0][1], t[0][2]],
    [t[1][0], t[1][1], t[1][2]],
    [0, 0, 1],
  ]
}

function mul3(a: Mat3, b: Mat3): Mat3 {
  const r: Mat3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) r[i][j] += a[i][k] * b[k][j]
    }
  }
  return r
}

// 节点相对 ancestor 的变换矩阵（3x3）
export function relativeMatrix(node: BaseNode, ancestor: BaseNode): Mat3 {
  const a = toMat3((ancestor as DefaultShapeMixin).absoluteTransform)
  const b = toMat3((node as DefaultShapeMixin).absoluteTransform)
  // 3x3 求逆
  const inv = invert3(a)
  return mul3(inv, b)
}

function invert3(m: Mat3): Mat3 {
  const [a, b, c] = m[0]
  const [d, e, f] = m[1]
  const [g, h, i] = m[2]
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  return [
    [A, (c * h - b * i), (b * f - c * e)],
    [B, (a * i - c * g), -(a * f - c * d)],
    [C, (b * g - a * h), (a * e - b * d)],
  ].map((row) => row.map((v) => v / det))
}

// 节点相对 ancestor 的世界缩放（x 轴，假设均匀缩放）
export function relativeScale(node: BaseNode, ancestor: BaseNode): number {
  const r = relativeMatrix(node, ancestor)
  return Math.hypot(r[0][0], r[0][1])
}

// 节点在 ancestor 坐标系中的边界矩形 {x,y,width,height}
export function relativeBounds(node: BaseNode, ancestor: BaseNode) {
  const r = relativeMatrix(node, ancestor)
  const w = (node as LayoutMixin).width
  const h = (node as LayoutMixin).height
  // 四个角
  const corners = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ].map(([x, y]) => [r[0][0] * x + r[0][1] * y + r[0][2], r[1][0] * x + r[1][1] * y + r[1][2]])
  const xs = corners.map((p) => p[0])
  const ys = corners.map((p) => p[1])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

// Convert rendered page bounds into the finished frame's coordinate system.
export function relativeRenderBounds(node: TextNode, ancestor: FrameNode) {
  const box = node.absoluteRenderBounds
  if (box === null) return undefined
  if (!box) return relativeBounds(node, ancestor)
  const r = invert3(toMat3(ancestor.absoluteTransform))
  const corners = [[box.x,box.y],[box.x+box.width,box.y],[box.x+box.width,box.y+box.height],[box.x,box.y+box.height]]
    .map(([x,y]) => [r[0][0]*x+r[0][1]*y+r[0][2],r[1][0]*x+r[1][1]*y+r[1][2]])
  const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1])
  return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)}
}

// 取节点的 SOLID 填充（若有）
export function getSolidFills(node: BaseNode): SolidPaint[] {
  if (!('fills' in node)) return []
  let fills = (node as MinimalFillsMixin).fills
  if (fills === figma.mixed || !Array.isArray(fills)) return []
  return fills.filter((p): p is SolidPaint => p.type === 'SOLID' && p.visible !== false)
}

// 生成唯一问题 id
let issueSeq = 0
export function nextIssueId(): string {
  issueSeq += 1
  return `issue-${Date.now()}-${issueSeq}`
}
