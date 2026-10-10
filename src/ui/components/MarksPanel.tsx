import React from 'react'
import type { MarksConfig } from '../../shared/types'
import { Switch } from './controls'

export function MarksPanel({
  config,
  onConfig,
}: {
  config: MarksConfig
  onConfig: (c: MarksConfig) => void
}) {
  const set = (patch: Partial<MarksConfig>) => onConfig({ ...config, ...patch })

  return (
      <div>
        <div className="row">
          <div className="field">
            <label htmlFor="export-bleed" className="field-label">出血 (mm)</label>
            <input
              className="input"
              id="export-bleed"
              type="number"
              min={0}
              step={0.5}
              value={config.bleed}
              onChange={(e) => set({ bleed: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label htmlFor="export-safety" className="field-label">安全边距 (mm)</label>
            <input
              className="input"
              id="export-safety"
              type="number"
              min={0}
              step={0.5}
              value={config.safetyMargin}
              onChange={(e) => set({ safetyMargin: Number(e.target.value) })}
            />
          </div>
        </div>

        <Switch label="裁切线" checked={config.showCropMarks} onChange={(v) => set({ showCropMarks: v })} />
        <Switch label="出血框（红色）" checked={!!config.showBleedBox} onChange={(v) => set({ showBleedBox: v })} />

      </div>


  )
}
