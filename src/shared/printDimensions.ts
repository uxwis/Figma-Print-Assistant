import { SIZE_PRESETS, mmToPx } from './constants'
import type { PrintSize } from './types'

export const displayMm=(value:number)=>String(Math.round(value))

// Keep calculation precision separate from the integer labels shown in the UI.
export const preciseMm=(value:number)=>String(Number(value.toFixed(2)))
export const integerMmInput=(value:string)=>value==='' ? '' : displayMm(Number(value))

// Recognize the integer-pixel rounding of an explicitly chosen standard size.
export function roundedPreset(widthPx:number,heightPx:number,size?:PrintSize): PrintSize | undefined {
  for(const p of SIZE_PRESETS) for(const [widthMm,heightMm] of [[p.w,p.h],[p.h,p.w]]) {
    if(Math.round(mmToPx(widthMm))===widthPx && Math.round(mmToPx(heightMm))===heightPx &&
      (!size || (size.widthMm===widthMm && size.heightMm===heightMm))) return {widthMm,heightMm}
  }
}

export function sizeFitsRatio(widthPx:number,heightPx:number,size:PrintSize):boolean {
  const heightError=Math.abs(size.widthMm*heightPx/widthPx-size.heightMm)
  const widthError=Math.abs(size.heightMm*widthPx/heightPx-size.widthMm)
  const canonical=roundedPreset(widthPx,heightPx)
  const presetFits=canonical && (Math.abs(size.widthMm*canonical.heightMm/canonical.widthMm-size.heightMm)<=0.00501 || Math.abs(size.heightMm*canonical.widthMm/canonical.heightMm-size.widthMm)<=0.00501)
  const pixelFits=Number.isInteger(widthPx) && Number.isInteger(heightPx) &&
    (Math.round(size.widthMm*heightPx/size.heightMm)===widthPx || Math.round(size.heightMm*widthPx/size.widthMm)===heightPx)
  return heightError<=0.00501 || widthError<=0.00501 || !!presetFits || pixelFits
}

// Existing artwork defines the design scale. Only change its aspect ratio;
// physical millimetres are applied separately to the disposable export copy.
export function originalSizeForPrint(widthPx:number,heightPx:number,size:PrintSize): {widthPx:number;heightPx:number} {
  if(sizeFitsRatio(widthPx,heightPx,size))return {widthPx,heightPx}
  const width=Math.max(1,Math.round(widthPx))
  return {widthPx:width,heightPx:Math.max(1,Math.round(width*size.heightMm/size.widthMm))}
}
