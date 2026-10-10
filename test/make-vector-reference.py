from pathlib import Path
import json
from PIL import ImageCms, Image
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

out = Path('test/fixtures')
out.mkdir(parents=True, exist_ok=True)
out.joinpath('source-srgb.icc').write_bytes(ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes())
Image.new('RGB', (16, 16), (180, 90, 40)).save(out/'photo-reference.jpg', quality=95)
font = TTFont('C:/Windows/Fonts/msyh.ttc', fontNumber=0)
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
result = []
for char in '印刷助手 Vector PDF':
    key = cmap[ord(char)]
    pen = SVGPathPen(glyphs)
    glyphs[key].draw(TransformPen(pen, (1, 0, 0, -1, 0, 0)))
    result.append({'path': pen.getCommands(), 'advance': font['hmtx'].metrics[key][0]})
out.joinpath('outlined-glyphs.json').write_text(json.dumps({'units': font['head'].unitsPerEm, 'glyphs': result}), encoding='utf-8')
print('Prepared independent sRGB profile and Chinese/Latin glyph outlines for PDF rendering verification.')
