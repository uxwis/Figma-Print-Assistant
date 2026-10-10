from PIL import Image, ImageCms
import json
with open('tmp/pdfs/icc-swatches.json') as f: data=json.load(f)
rgb=Image.frombytes('RGB',(len(data['rgb'])//3,1),bytes(data['rgb']))
src=ImageCms.createProfile('sRGB')
dst=ImageCms.getOpenProfile('assets/icc/ISOcoated_v2_300_eci.icc')
converted=ImageCms.profileToProfile(rgb,src,dst,renderingIntent=1,outputMode='CMYK',flags=ImageCms.Flags.BLACKPOINTCOMPENSATION)
actual=bytes(converted.tobytes())
max_delta=max(abs(a-b) for a,b in zip(actual,data['cmyk']))
assert max_delta <= 2, (max_delta,list(actual),data['cmyk'])
print('Independent Pillow / LittleCMS 2.19 comparison: max channel difference',max_delta,'/ 255')
print('RGB swatches -> actual CMYK bytes:',list(actual))
