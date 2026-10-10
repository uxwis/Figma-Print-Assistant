declare module '*.icc' { const bytes: Uint8Array; export default bytes }
declare module '*.wasm' { const bytes: Uint8Array; export default bytes }
declare module 'lcms-wasm' {
  export function instantiate(options?: { wasmBinary: Uint8Array; locateFile?: (name: string) => string }): Promise<any>
  export const TYPE_RGB_8: number
  export const TYPE_GRAY_8: number
  export const TYPE_CMYK_8: number
  export const INTENT_RELATIVE_COLORIMETRIC: number
  export const cmsFLAGS_BLACKPOINTCOMPENSATION: number
}
