<?php
require __DIR__ . '/../../../vendor/autoload.php';
use App\Services\Codes\DataMatrix\{DmEncoder,DmSpec}; use App\Services\Codes\Render\PngRenderer;
$out=$argv[1]; @mkdir($out,0777,true); array_map('unlink',glob("$out/*")); $n=0; mt_srand(9);
$save=function($name,$text,$shape='square') use($out,&$n){ $m=DmEncoder::encode($text,$shape); file_put_contents("$out/$name.png",PngRenderer::render($m,['scale'=>6,'quiet'=>3])); file_put_contents("$out/$name.txt",$text); $n++; return $m; };
// every symbol size filled to capacity with printable text (ascii mode) and with digits
foreach (DmSpec::SIZES as $s) {
  $d=DmSpec::describe($s); $shape = $d['rows']===$d['cols'] ? 'square' : 'rectangle';
  $t=''; for($i=0;$i<$d['data'];$i++) $t.=chr(mt_rand(97,122));
  $m=$save("t_{$d['rows']}x{$d['cols']}",$t,$shape);
  if ($m->height!==$d['rows']) echo "SIZE MISMATCH {$d['rows']}x{$d['cols']} got {$m->height}x{$m->width}\n";
  $dig=''; for($i=0;$i<$d['data']*2;$i++) $dig.=mt_rand(0,9);
  $save("d_{$d['rows']}x{$d['cols']}",$dig,$shape);
}
foreach(['A','Hello, World!','https://example.com/q/tk.1.ABC','0123456789','Nairobi – ñ ✓','GS1',"line\nbreak"] as $i=>$s) $save("s_$i",$s,'any');
$bin=''; for($i=0;$i<120;$i++) $bin.=chr(mt_rand(0,255)); // base256
$save('bin',$bin,'square');
echo "made $n\n";
