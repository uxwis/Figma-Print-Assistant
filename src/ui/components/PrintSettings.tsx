import React from 'react'
import { Segmented } from './controls'
import { DPI_PRESETS } from '../../shared/constants'
import { BUILTIN_PROFILES, validatePrintProfile, type PrintProfile } from '../color/icc'

export function PrintSettings({ dpi, onDpi, profileId, onProfileId, profile, onImportProfile, disabled }: {
  dpi: number
  onDpi: (dpi: number) => void
  profileId: string
  onProfileId: (id: string) => void
  profile?: PrintProfile
  onImportProfile: (profile: PrintProfile) => void
  disabled: boolean
}) {
  const [error, setError] = React.useState('')
  const [importing, setImporting] = React.useState(false)
  const custom = !BUILTIN_PROFILES.some(p => p.id === profileId)
  async function importFile(file: File) {
    setError('')
    setImporting(true)
    try {
      if (file.size > 32 * 1024 * 1024) throw new Error('ICC 文件不能超过 32 MB')
      const bytes = new Uint8Array(await file.arrayBuffer())
      await validatePrintProfile(bytes)
      onImportProfile({ id: profileId, name: file.name, bytes })
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setImporting(false) }
  }
  return (
    <div>
      <fieldset className="print-settings" disabled={disabled || importing}>
        <div className="field">
          <label className="field-label" htmlFor="print-icc">色彩配置</label>
          <select id="print-icc" className="select" value={profileId} onChange={e => { setError(''); onProfileId(e.target.value) }}>
            {BUILTIN_PROFILES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value="custom">导入印厂／设备 CMYK ICC</option>
          </select>
        </div>
        {custom && <div className="field">
          <label className="field-label" htmlFor="icc-file">{profile ? `已载入：${profile.name}` : '请导入对应设备和纸张的 .icc / .icm 文件'}</label>
          <input id="icc-file" type="file" accept=".icc,.icm" onChange={e => {
            const file = e.target.files?.[0]
            if (file) void importFile(file)
            e.target.value = ''
          }} />
        </div>}
        <div className="field">
          <div className="dpi-label"><span className="field-label">分辨率 · DPI</span>
            <span className="dpi-hint" role="status">（{dpi === 150 ? '大幅远看' : dpi === 300 ? '常规印刷' : '精细位图'}）</span></div>
          <Segmented value={String(dpi)} onChange={v => onDpi(Number(v))} options={DPI_PRESETS.map(d => ({ value: String(d), label: String(d) }))} />
        </div>
      </fieldset>
      {importing && <div className="hint" role="status">正在验证 ICC…</div>}
      {error && <div className="hint" role="alert">{error}</div>}
    </div>
  )
}
