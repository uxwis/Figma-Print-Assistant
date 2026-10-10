import type { UIMessage } from '../shared/types'

// 向主线程发送消息
export function send(type: string, payload?: any): void {
  parent.postMessage({ pluginMessage: { type, payload } }, '*')
}

// 监听主线程消息
export function onMessage(handler: (msg: UIMessage) => void): () => void {
  const listener = (event: MessageEvent) => {
    const msg = event.data?.pluginMessage
    if (msg) handler(msg)
  }
  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}

// 触发浏览器下载
export function downloadBytes(bytes: Uint8Array, filename: string, mime: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
