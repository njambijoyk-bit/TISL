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
```
php tests/Tools/crosscheck/linear2_make.php /tmp/lin2out        # Code 93 (full ASCII), Codabar, GS1-128
/tmp/v/bin/python tests/Tools/crosscheck/read_linear2.py /tmp/lin2out
php tests/Tools/crosscheck/datamatrix_make.php /tmp/dmout       # Data Matrix at all 30 sizes, full of letters and of digits, plus binary
/tmp/v/bin/python tests/Tools/crosscheck/read_bytes.py /tmp/dmout
```
```
php tests/Tools/crosscheck/pdf417_make.php /tmp/p417out        # PDF417: every error-correction level, columns, text/numeric/byte compaction (all byte lengths 1-48)
/tmp/v/bin/python tests/Tools/crosscheck/read_bytes.py /tmp/p417out
```
Each `x.png` has an `x.txt` with what it should read as. Run it after any change to an encoder. Last run: 171 of 171 QR codes, 255 of 255 barcodes, 98 of 100 more (the two others are test-data quirks, see below) 68 of 68 Data Matrix symbols and 148 of 148 PDF417 symbols read correctly.

Known test-data quirks: the decoder prints control characters by name (so the control-character Code 93 reads as `<SOH>…`: it is correct), and refuses a one-digit Codabar (`A0B`).
