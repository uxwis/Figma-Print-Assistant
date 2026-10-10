from math import floor
from pathlib import Path
from PIL import Image, ImageCms
from pypdf import PdfReader

reader = PdfReader('tmp/pdfs/vector-600.pdf')
images = reader.pages[0]['/Resources']['/XObject'].get_object()
photo = next(obj.get_object() for obj in images.values() if obj.get_object().get('/Subtype') == '/Image' and obj.get_object().get('/Width') == 600)
actual = photo.get_data()
points = [(0, 0), (50, 70), (200, 250), (599, 399), (300, 200)]
rgb = bytes(v for x, y in points for v in (floor(70 + 100*x/600 + .5), floor(80 + 120*y/400 + .5), 145))
src = ImageCms.getOpenProfile('test/fixtures/source-srgb.icc')
dst = ImageCms.getOpenProfile('assets/icc/ISOcoated_v2_300_eci.icc')
expected = ImageCms.profileToProfile(Image.frombytes('RGB', (len(points), 1), rgb), src, dst, renderingIntent=1, outputMode='CMYK', flags=ImageCms.Flags.BLACKPOINTCOMPENSATION).tobytes()
samples = bytes(v for x, y in points for v in actual[(y*600+x)*4:(y*600+x)*4+4])
delta = max(abs(a-b) for a, b in zip(samples, expected))
assert delta <= 2, (delta, list(samples), list(expected))
print('Independent vector-image source ICC / CMYK comparison: max channel difference', delta, '/ 255')
