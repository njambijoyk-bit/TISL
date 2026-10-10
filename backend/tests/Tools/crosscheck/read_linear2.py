import sys, glob, zxingcpp
from PIL import Image
ok=bad=0
for p in sorted(glob.glob(sys.argv[1]+'/*.png')):
    exp=open(p[:-4]+'.txt',encoding='latin-1').read(); fmt=open(p[:-4]+'.fmt').read()
    r=zxingcpp.read_barcodes(Image.open(p))
    if not r: print('FAIL none',p); bad+=1; continue
    x=r[0]; got=x.text
    if fmt=='GS1':
        got=x.text   # zxing returns the readable (AI) form for GS1
    good = got==exp
    ok+=good; bad+=not good
    if not good: print('FAIL', p.split('/')[-1], 'want', repr(exp), 'got', repr(got), str(x.format).split('.')[-1], x.symbology_identifier)
print('ok',ok,'bad',bad)
