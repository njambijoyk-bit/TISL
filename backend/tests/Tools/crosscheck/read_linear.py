import sys, glob, zxingcpp
from PIL import Image
ok=bad=0
for p in sorted(glob.glob(sys.argv[1]+'/*.png')):
    exp=open(p[:-4]+'.txt',encoding='latin-1').read(); fmt=open(p[:-4]+'.fmt').read()
    r=zxingcpp.read_barcodes(Image.open(p))
    got=r[0].text if r else None
    f=str(r[0].format).split('.')[-1] if r else None
    if fmt=='UPCE':   # zxing reports UPC-E as the 13-digit form of the UPC-A it stands for: expand ours the standard way, independently
        ns,d,chk=exp[0],exp[1:7],exp[7]
        l=d[5]
        a={'0':d[0:2]+l+'0000'+d[2:5],'1':d[0:2]+l+'0000'+d[2:5],'2':d[0:2]+l+'0000'+d[2:5],'3':d[0:3]+'00000'+d[3:5],'4':d[0:4]+'00000'+d[4]}.get(l, d[0:5]+'0000'+l)
        exp='00'+ns+a+chk if False else '0'+ns+a+chk
    good = got==exp
    ok+=good; bad+=not good
    if not good: print('FAIL', p.split('/')[-1], 'want', repr(exp), 'got', repr(got), f)
print('ok',ok,'bad',bad)
