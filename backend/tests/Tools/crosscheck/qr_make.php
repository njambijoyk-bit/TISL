<?php
require __DIR__ . '/../../../vendor/autoload.php';
use App\Services\Codes\Qr\{QrEncoder,QrSpec}; use App\Services\Codes\Render\PngRenderer;
$out = $argv[1]; @mkdir($out, 0777, true); array_map('unlink', glob("$out/*"));
mt_srand(42); $n=0;
$alpha='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,-_/:?=&%+#@!';
foreach (QrSpec::LEVELS as $l) for ($v=1;$v<=40;$v++) {
  // byte capacity: data codewords*8 - 4 - countbits, /8
  $cap = intdiv(QrSpec::dataCodewords($l,$v)*8 - 4 - QrSpec::countBits('byte',$v), 8);
  $kinds = ['byte'=>fn($k)=>substr(str_shuffle(str_repeat($alpha, 60)),0,$k), 'numeric'=>function($k){$s='';for($i=0;$i<$k;$i++)$s.=mt_rand(0,9);return $s;}];
  $len = max(1,$cap - mt_rand(0,3));
  $text = $kinds['byte']($len);
  $q = QrEncoder::encode($text,$l,$v);  // force this exact version
  if ($q->version!==$v) { echo "VERSION MISMATCH $l $v got {$q->version}\n"; }
  file_put_contents("$out/b_{$l}_{$v}.png", PngRenderer::render($q->matrix,['scale'=>4])); file_put_contents("$out/b_{$l}_{$v}.txt",$text); $n++;
}
// every mask, plus numeric/alnum maximum
for ($m=0;$m<8;$m++) { $t="MASK TEST $m ".str_repeat('xyz',$m*5); $q=QrEncoder::encode($t,'Q',null,$m); file_put_contents("$out/m$m.png",PngRenderer::render($q->matrix,['scale'=>6])); file_put_contents("$out/m$m.txt",$t);}
foreach ([['numeric','L',40],['numeric','H',20],['alnum','M',30]] as [$k,$l,$v]) {
  if ($k==='numeric') { $cap = intdiv((QrSpec::dataCodewords($l,$v)*8-4-QrSpec::countBits('numeric',$v))*3,10); $t=''; for($i=0;$i<$cap;$i++)$t.=mt_rand(0,9); }
  else { $bits=QrSpec::dataCodewords($l,$v)*8-4-QrSpec::countBits('alnum',$v); $cap=intdiv($bits,11)*2+(($bits%11)>=6?1:0); $a=QrSpec::ALNUM; $t=''; for($i=0;$i<$cap;$i++)$t.=$a[mt_rand(0,44)]; }
  $q=QrEncoder::encode($t,$l); echo "$k $l target v$v got v{$q->version} len ".strlen($t)." mode {$q->mode}\n";
  file_put_contents("$out/x_{$k}_$l.png",PngRenderer::render($q->matrix,['scale'=>4])); file_put_contents("$out/x_{$k}_$l.txt",$t);
}
echo "made\n";
