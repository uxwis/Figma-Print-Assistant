import React, { useEffect, useRef, useState } from 'react'
import { send, onMessage } from '../api'
import { createIccConverter, rgbaToRgb, type PrintProfile } from '../color/icc'
import { decodePng } from '../color/decodedImage'

export function SoftProofCard({ profile }: { profile?: PrintProfile }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(false)
  const [hasData, setHasData] = useState(false)
  const dataRef = useRef<ImageData | null>(null)
  const [error, setError] = useState('')
  const [name, setName] = useState('')

  useEffect(() => {
    let active = true
    setHasData(false)
    setError('')
    setLoading(false)
    dataRef.current = null
    const off = onMessage(async m => {
      if (m.type !== 'softproof-result') return
      let converter: Awaited<ReturnType<typeof createIccConverter>> | undefined
      try {
        if (m.payload.error) throw new Error(m.payload.error)
        if (!profile) throw new Error('请先在导出页选择或导入印刷 ICC')
        const first = m.payload.images?.[0]
        if (!first) throw new Error('没有可预览的画板')
        const decoded = await decodePng(first.bytes)
        converter = await createIccConverter(profile)
        const rgb = converter.toRgb(converter.toCmyk(rgbaToRgb(decoded.data)))
        const rgba = new Uint8ClampedArray(decoded.width * decoded.height * 4)
        for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
          rgba[j] = rgb[i]; rgba[j + 1] = rgb[i + 1]; rgba[j + 2] = rgb[i + 2]; rgba[j + 3] = 255
        }
        if (!active) return
        dataRef.current = new ImageData(rgba, decoded.width, decoded.height)
        setName(first.name)
        setHasData(true)
        render()
      } catch (e) {
        if (active) { setError(e instanceof Error ? e.message : String(e)); setHasData(false) }
      } finally {
        converter?.dispose()
        if (active) setLoading(false)
      }
    })
    return () => { active = false; off() }
  }, [profile])

  function render() {
    const data = dataRef.current, canvas = canvasRef.current
    if (!data || !canvas) return
    canvas.width = data.width
    canvas.height = data.height
    canvas.getContext('2d')!.putImageData(data, 0, 0)
  }
  useEffect(() => { render() }, [hasData])

  return (
    <div className="card">
      <div className="card-title softproof-heading"><span>软打样（CMYK 预览）</span>
      <button className="btn-ghost softproof-action" onClick={() => {
        setError(''); setLoading(true); send('softproof', { target: 'selection' })
      }} disabled={loading || !profile}>
        {loading ? <span className="spin" /> : '生成软打样'}
      </button>
      </div>
      {error && <div className="hint" role="alert">{error}</div>}
      {hasData && <>
        <div className="softproof-canvas-wrap"><canvas ref={canvasRef} className="softproof-canvas" /></div>
        <div className="hint">CMYK 模拟（{name}）</div>
      </>}
      <details className="hint proof-help"><summary>预览说明</summary>
        {profile ? `ICC：${profile.name.replace('（ECI / FOGRA39）','')}。` : '请先选择印刷 ICC。'}
        预览首个选中画板，ICC 与导出一致。透明效果可能略有差异，以实际打样为准。
      </details>
    </div>
  )
}
