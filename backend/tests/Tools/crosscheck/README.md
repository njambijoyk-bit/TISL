# Cross-check our code encoders against an independent decoder

Not part of the normal test run (needs Python). It makes a folder of PNGs with our encoders, then reads them back with **zxing-cpp**, a decoder we did not write.

```
python3 -m venv /tmp/v && /tmp/v/bin/pip install zxing-cpp pillow
php tests/Tools/crosscheck/qr_make.php /tmp/qrout        # every QR version x level at capacity, every mask, the largest numeric/alphanumeric
/tmp/v/bin/python tests/Tools/crosscheck/read.py /tmp/qrout   # prints OK/FAIL per image and a total
```
Each `x.png` has an `x.txt` with what it should read as. Run it after any change to an encoder. Last run: 171 of 171 QR codes read correctly.
