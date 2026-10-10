# Cross-check our code encoders against an independent decoder

Not part of the normal test run (needs Python). It makes a folder of PNGs with our encoders, then reads them back with **zxing-cpp**, a decoder we did not write.

```
python3 -m venv /tmp/v && /tmp/v/bin/pip install zxing-cpp pillow
php tests/Tools/crosscheck/qr_make.php /tmp/qrout        # every QR version x level at capacity, every mask, the largest numeric/alphanumeric
/tmp/v/bin/python tests/Tools/crosscheck/read.py /tmp/qrout   # prints OK/FAIL per image and a total
```
```
php tests/Tools/crosscheck/linear_make.php /tmp/linout        # Code 128 (250 random strings), EAN-13/8, UPC-A/E (every check digit), Code 39, ITF
/tmp/v/bin/python tests/Tools/crosscheck/read_linear.py /tmp/linout
```
Each `x.png` has an `x.txt` with what it should read as. Run it after any change to an encoder. Last run: 171 of 171 QR codes and 255 of 255 barcodes read correctly.
