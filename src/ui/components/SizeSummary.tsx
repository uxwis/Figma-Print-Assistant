import React from 'react'
import type { FrameInfo } from '../../shared/types'
import { displayMm } from '../../shared/printDimensions'
import { pxToMm } from '../../shared/constants'

const format = displayMm
export function SizeSummary({frames,unsaved,onEdit,disabled,reference=false}: {frames:FrameInfo[];unsaved:boolean;onEdit:()=>void;disabled:boolean;reference?:boolean}) {
  const valid = frames.filter(frame=>frame.printSizeStatus==='valid').length
  const frame = frames[0]
  const text = frames.length===0 ? '请先选中原稿画板' : frames.length>1 ? `${frames.length} 个画板 · ${valid} 个已设置`
    : frame.printSizeStatus==='valid' ? `成品：${format(frame.printSize!.widthMm)} × ${format(frame.printSize!.heightMm)} mm`
    : frame.printSizeStatus==='stale' ? '成品：需重新确认' : reference ? `参考：${format(pxToMm(frame.widthPx))} × ${format(pxToMm(frame.heightPx))} mm` : '成品：未设置'
  return <div className="card size-summary">
    <div className="size-summary-text"><span title={text}>{text}</span>{unsaved && <span className="size-status warning">未保存</span>}</div>
    {frames.length>0 && <button className="btn-ghost" disabled={disabled} onClick={onEdit}>{unsaved ? '去保存' : valid===frames.length ? '修改' : '去设置'}</button>}
  </div>
}
