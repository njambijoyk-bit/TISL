import sys, glob, zxingcpp
from PIL import Image
ok=bad=0
for p in sorted(glob.glob(sys.argv[1]+'/*.png')):
    exp=open(p[:-4]+'.txt','rb').read()
    r=zxingcpp.read_barcodes(Image.open(p))
    if not r: print('FAIL none',p.split('/')[-1]); bad+=1; continue
    got=r[0].bytes
    good = got==exp
    ok+=good; bad+=not good
    if not good: print('FAIL', p.split('/')[-1], str(r[0].format).split('.')[-1], repr(got[:30]), 'want', repr(exp[:30]))
print('ok',ok,'bad',bad)
