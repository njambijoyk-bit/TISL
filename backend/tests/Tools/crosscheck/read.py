import sys, glob, zxingcpp
from PIL import Image
ok=0; bad=0
for p in sorted(glob.glob(sys.argv[1]+'/*.png')):
    exp=open(p[:-4]+'.txt',encoding='utf-8').read()
    r=zxingcpp.read_barcodes(Image.open(p))
    got=r[0].text if r else None
    fmt=r[0].format if r else None
    good = got==exp
    ok+=good; bad+=not good
    print(('OK  ' if good else 'FAIL'), p.split('/')[-1], fmt, (got or '')[:40] if not good else '')
print('ok',ok,'bad',bad)
