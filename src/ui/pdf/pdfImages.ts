import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import { number, numbers } from './pdfFunctions'

function undoPredictor(data:Uint8Array,dict:PDFDict,width:number,channels:number,bits:number):Uint8Array {
  const parms=dict.lookup(PDFName.of('DecodeParms'))
  const p=parms instanceof PDFDict ? parms : parms instanceof PDFArray ? parms.lookup(0) : undefined
  if(!(p instanceof PDFDict)) return data
  const predictor=number(p,'Predictor',1)
  if(predictor===1) return data
  const columns=number(p,'Columns',width), colors=number(p,'Colors',channels), bpc=number(p,'BitsPerComponent',bits)
  if(columns!==width || colors!==channels || bpc!==bits) throw new Error('PDF 图片预测器参数不匹配')
  const stride=Math.ceil(width*channels*bits/8), bpp=Math.max(1,Math.ceil(channels*bits/8))
  if(predictor===2 && bits===8) {
    const out=data.slice()
    for(let row=0;row<out.length;row+=stride) for(let x=bpp;x<stride;x++) out[row+x]=(out[row+x]+out[row+x-bpp])&255
    return out
  }
  if(predictor<10 || predictor>15 || data.length%(stride+1)) throw new Error('暂不支持此图片预测器')
  const rows=data.length/(stride+1), out=new Uint8Array(rows*stride)
  for(let y=0;y<rows;y++) {
    const filter=data[y*(stride+1)]
    if(filter>4) throw new Error('PDF 图片 PNG 预测器无效')
    for(let x=0;x<stride;x++) {
      const at=y*stride+x, left=x>=bpp ? out[at-bpp] : 0, up=y ? out[at-stride] : 0, ul=y&&x>=bpp ? out[at-stride-bpp] : 0
      let predict=0
      if(filter===1) predict=left
      if(filter===2) predict=up
      if(filter===3) predict=Math.floor((left+up)/2)
      if(filter===4) {const estimate=left+up-ul,dl=Math.abs(estimate-left),du=Math.abs(estimate-up),dul=Math.abs(estimate-ul);predict=dl<=du&&dl<=dul ? left : du<=dul ? up : ul}
      out[at]=(data[y*(stride+1)+x+1]+predict)&255
    }
  }
  return out
}

// Remove metadata which would cause a browser to rotate or colour-manage JPEG samples a second time.
function jpegSamplesOnly(bytes:Uint8Array):Uint8Array {
  const chunks:Uint8Array[]=[bytes.subarray(0,2)]
  let at=2
  while(at<bytes.length && bytes[at]===255) {
    const marker=bytes[at+1]
    if(marker===0xda || marker===0xd9) {chunks.push(bytes.subarray(at));at=bytes.length;break}
    const len=(bytes[at+2]<<8)|bytes[at+3]
    if(len<2 || at+2+len>bytes.length) throw new Error('JPEG 数据不完整')
    if(marker!==0xe1 && marker!==0xe2) chunks.push(bytes.subarray(at,at+2+len))
    at+=2+len
  }
  if(at<bytes.length) chunks.push(bytes.subarray(at))
  const out=new Uint8Array(chunks.reduce((n,b)=>n+b.length,0));let offset=0
  for(const chunk of chunks) {out.set(chunk,offset);offset+=chunk.length}
  return out
}

export async function decodeImageSamples(stream:PDFRawStream,channels:number):Promise<Uint8Array> {
  const dict=stream.dict,width=number(dict,'Width'),height=number(dict,'Height'),bits=number(dict,'BitsPerComponent',1)
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||width>16384||height>16384||width*height>40000000) throw new Error('图片过大或尺寸无效，请降低图片尺寸或使用整页栅格模式')
  const filter=dict.lookup(PDFName.of('Filter'))
  const filters=filter instanceof PDFArray ? Array.from({length:filter.size()},(_,i)=>filter.lookup(i)) : filter ? [filter] : []
  const jpegIndex=filters.findIndex(f=>f===PDFName.of('DCTDecode') || f===PDFName.of('DCT'))
  let data:Uint8Array
  if(jpegIndex>=0) {
    if(jpegIndex!==filters.length-1 || ![1,3].includes(channels) || bits!==8 || typeof createImageBitmap==='undefined') throw new Error('暂不支持此 JPEG 图片编码')
    let encoded=stream.contents
    if(jpegIndex>0) {
      const prefix=dict.clone(),parms=dict.lookup(PDFName.of('DecodeParms'))
      prefix.set(PDFName.of('Filter'),dict.context.obj(filters.slice(0,jpegIndex)))
      if(parms instanceof PDFArray) prefix.set(PDFName.of('DecodeParms'),dict.context.obj(Array.from({length:jpegIndex},(_,i)=>parms.get(i))))
      else prefix.delete(PDFName.of('DecodeParms'))
      encoded=decodePDFRawStream(PDFRawStream.of(prefix,encoded)).decode()
    }
    const bitmap=await createImageBitmap(new Blob([jpegSamplesOnly(encoded) as BlobPart],{type:'image/jpeg'}),{colorSpaceConversion:'none',imageOrientation:'none'})
    try {
      if(bitmap.width!==width || bitmap.height!==height) throw new Error('PDF JPEG 像素尺寸不匹配')
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
      const ctx=canvas.getContext('2d',{colorSpace:'srgb'})!
      ctx.drawImage(bitmap,0,0)
      const rgba=ctx.getImageData(0,0,width,height).data
      data=new Uint8Array(width*height*channels)
      for(let i=0,j=0;i<rgba.length;i+=4,j+=channels) {
        data[j]=rgba[i]
        if(channels===3){data[j+1]=rgba[i+1];data[j+2]=rgba[i+2]}
      }
    } finally {bitmap.close()}
  } else {
    if(bits!==8 && !(bits===1&&channels===1)) throw new Error(`暂不支持 ${bits} 位图片`)
    data=undoPredictor(decodePDFRawStream(stream).decode(),dict,width,channels,bits)
    const stride=Math.ceil(width*channels*bits/8)
    if(data.length!==stride*height) throw new Error('PDF 图片像素数据长度不匹配')
    if(bits===1) {
      const unpacked=new Uint8Array(width*height)
      for(let y=0;y<height;y++) for(let x=0;x<width;x++) unpacked[y*width+x]=(data[y*stride+(x>>3)]>>(7-(x&7))&1)*255
      data=unpacked
    }
  }
  const decodeObj=dict.lookup(PDFName.of('Decode'))
  if(decodeObj) {
    const decode=numbers(decodeObj)
    if(decode.length!==channels*2) throw new Error('PDF 图片 Decode 通道不匹配')
    for(let i=0;i<data.length;i++) {const c=i%channels;data[i]=Math.round(Math.max(0,Math.min(1,decode[2*c]+data[i]/255*(decode[2*c+1]-decode[2*c])))*255)}
  }
  return data
}

// Area averaging rather than nearest-neighbour; no upsampling, same grid for image and alpha.
export function downsample(data:Uint8Array,width:number,height:number,newW:number,newH:number,channels:number):Uint8Array {
  if(width===newW&&height===newH) return data
  const out=new Uint8Array(newW*newH*channels),sx=width/newW,sy=height/newH
  const sums=new Float64Array(channels)
  for(let y=0;y<newH;y++) for(let x=0;x<newW;x++) {
    const x0=x*sx,x1=(x+1)*sx,y0=y*sy,y1=(y+1)*sy
    sums.fill(0)
    for(let iy=Math.floor(y0);iy<Math.ceil(y1);iy++) for(let ix=Math.floor(x0);ix<Math.ceil(x1);ix++) {
      const weight=(Math.min(ix+1,x1)-Math.max(ix,x0))*(Math.min(iy+1,y1)-Math.max(iy,y0))
      for(let c=0;c<channels;c++) sums[c]+=data[(iy*width+ix)*channels+c]*weight
    }
    for(let c=0;c<channels;c++) out[(y*newW+x)*channels+c]=Math.round(sums[c]/(sx*sy))
  }
  return out
}
