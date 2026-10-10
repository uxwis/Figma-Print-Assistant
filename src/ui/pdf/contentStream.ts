// PDF 内容流 tokenizer；颜色与资源转换由 vectorCmyk.ts 处理。
// 内容流是“操作数 + 操作符”的后缀语法，数组、字典和字符串作为完整 token 保留。
// 内联图像不猜测二进制边界，直接拒绝并提示切换栅格模式。



type TokenType = 'num' | 'str' | 'hex' | 'name' | 'op' | 'array' | 'dict' | 'inline-image'

export interface Token {
  type: TokenType
  raw: string
  value?: number
}

export interface Instruction {
  operands: Token[]
  op: string
}



// ============ Tokenizer ============
class Tokenizer {
  s: string
  i: number

  constructor(s: string) {
    this.s = s
    this.i = 0
  }

  private peek(o = 0): string {
    return this.s[this.i + o]
  }

  private isWs(c: string): boolean {
    return c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f' || c === '\0'
  }

  private isDigit(c: string): boolean {
    return c >= '0' && c <= '9'
  }

  private skipWsAndComments(): void {
    while (this.i < this.s.length) {
      const c = this.peek()
      if (this.isWs(c)) {
        this.i++
        continue
      }
      if (c === '%') {
        while (this.i < this.s.length && this.peek() !== '\n' && this.peek() !== '\r') this.i++
        continue
      }
      break
    }
  }

  nextToken(): Token | null {
    this.skipWsAndComments()
    if (this.i >= this.s.length) return null
    const c = this.peek()

    if (c === '(') return this.readString()
    if (c === '<') {
      if (this.peek(1) === '<') return this.readDict()
      return this.readHex()
    }
    if (c === '[') return this.readArray()
    if (c === ']') {
      this.i++
      return { type: 'op', raw: ']' }
    }
    if (c === '/') return this.readName()
    if (this.isDigit(c) || c === '-' || c === '+' || c === '.') return this.readNumber()
    return this.readOperator()
  }

  private readString(): Token {
    this.i++ // skip (
    let out = '('
    let depth = 1
    while (this.i < this.s.length && depth > 0) {
      const c = this.peek()
      if (c === '\\') {
        out += c + (this.peek(1) || '')
        this.i += 2
        continue
      }
      if (c === '(') depth++
      if (c === ')') depth--
      out += c
      this.i++
    }
    return { type: 'str', raw: out }
  }

  private readHex(): Token {
    this.i++ // skip <
    let out = '<'
    while (this.i < this.s.length && this.peek() !== '>') {
      out += this.peek()
      this.i++
    }
    if (this.peek() === '>') {
      out += '>'
      this.i++
    }
    return { type: 'hex', raw: out }
  }

  private readName(): Token {
    this.i++ // skip /
    let out = '/'
    const stops = '()<>[]{}/%'
    while (this.i < this.s.length) {
      const c = this.peek()
      if (this.isWs(c) || stops.includes(c)) break
      out += c
      this.i++
    }
    return { type: 'name', raw: out }
  }

  private readNumber(): Token {
    const start = this.i
    let out = ''
    let c = this.peek()
    if (c === '+' || c === '-') {
      out += c
      this.i++
    }
    let isNum = false
    while (this.i < this.s.length) {
      c = this.peek()
      if (this.isDigit(c)) {
        isNum = true
        out += c
        this.i++
      } else if (c === '.') {
        out += c
        this.i++
      } else if ((c === 'e' || c === 'E') && isNum) {
        out += c
        this.i++
        if (this.peek() === '+' || this.peek() === '-') {
          out += this.peek()
          this.i++
        }
      } else break
    }
    if (isNum) return { type: 'num', raw: out, value: parseFloat(out) }
    this.i = start
    return this.readOperator()
  }

  private readOperator(): Token {
    let out = ''
    const stops = '()<>[]{}/%'
    while (this.i < this.s.length) {
      const c = this.peek()
      if (this.isWs(c) || stops.includes(c)) break
      out += c
      this.i++
    }
    if (!out) throw new Error('PDF 内容流格式无效')
    if (out === 'BI') throw new Error('暂不支持 PDF 内联图像，请切换整页栅格模式')
    return { type: 'op', raw: out }
  }

  private readArray(): Token {
    this.i++ // skip [
    let out = '['
    while (this.i < this.s.length) {
      this.skipWsAndComments()
      if (this.peek() === ']') {
        out += ']'
        this.i++
        break
      }
      const t = this.nextToken()
      if (!t) break
      out += ' ' + t.raw
    }
    return { type: 'array', raw: out }
  }

  private readDict(): Token {
    this.i += 2 // skip <<
    let out = '<<'
    while (this.i < this.s.length) {
      this.skipWsAndComments()
      if (this.peek() === '>' && this.peek(1) === '>') {
        out += '>>'
        this.i += 2
        break
      }
      const t = this.nextToken()
      if (!t) break
      out += ' ' + t.raw
    }
    return { type: 'dict', raw: out }
  }

  // 内联图像 BI ... ID <raw> EI
  private readInlineImage(prefix: string): Token {
    let raw = prefix
    while (this.i < this.s.length) {
      this.skipWsAndComments()
      const save = this.i
      const probe = this.readOperator()
      if (probe.raw === 'ID') {
        raw += ' ID'
        if (this.isWs(this.peek())) this.i++
        const end = this.findImageEnd()
        raw += this.s.substring(this.i, end)
        this.i = end
        this.skipWsAndComments()
        const ei = this.readOperator()
        raw += ` ${ei.raw}`
        break
      }
      this.i = save
      const t = this.nextToken()
      if (!t) break
      raw += ` ${t.raw}`
    }
    return { type: 'inline-image', raw }
  }

  // 启发式定位内联图像结束：空白 + EI + 空白/边界
  private findImageEnd(): number {
    const s = this.s
    let j = this.i
    while (j < s.length) {
      const idx = s.indexOf('EI', j)
      if (idx < 0) return s.length
      const before = s[idx - 1]
      const after = s[idx + 2]
      if ((before === undefined || this.isWs(before)) && (after === undefined || this.isWs(after))) {
        return idx
      }
      j = idx + 2
    }
    return s.length
  }
}

function tokenize(content: string): Token[] {
  const tk = new Tokenizer(content)
  const tokens: Token[] = []
  let t: Token | null
  while ((t = tk.nextToken())) tokens.push(t)
  return tokens
}

function toInstructions(tokens: Token[]): Instruction[] {
  const instrs: Instruction[] = []
  let operands: Token[] = []
  for (const t of tokens) {
    if (t.type === 'inline-image') {
      if (operands.length) {
        instrs.push({ operands, op: '' })
        operands = []
      }
      instrs.push({ operands: [t], op: 'INLINE_IMAGE' })
    } else if (t.type === 'op') {
      instrs.push({ operands, op: t.raw })
      operands = []
    } else {
      operands.push(t)
    }
  }
  if (operands.length) instrs.push({ operands, op: '' })
  return instrs
}

export function parseInstructions(content:string): Instruction[] { return toInstructions(tokenize(content)) }
export function emitInstruction(ins:Instruction): string { return [...ins.operands.map(t=>t.raw),ins.op].filter(Boolean).join(' ') }
export function instructionNumbers(ins:Instruction): number[] {
  const values=ins.operands.map(t=>t.type==='num' ? t.value! : NaN)
  if (values.some(n=>!Number.isFinite(n))) throw new Error(`PDF ${ins.op} 操作数无效`)
  return values
}

