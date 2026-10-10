<?php
require __DIR__ . '/../../../vendor/autoload.php';
use App\Services\Codes\Pdf417\Pdf417Encoder; use App\Services\Codes\Render\PngRenderer;
$out=$argv[1]; @mkdir($out,0777,true); array_map('unlink',glob("$out/*")); $n=0; mt_srand(17);
$save=function($name,$text,$level=null,$cols=null) use($out,&$n){ $m=Pdf417Encoder::encode($text,$level,$cols); file_put_contents("$out/$name.png",PngRenderer::render($m,['scale'=>3,'scaleY'=>9,'quiet'=>3])); file_put_contents("$out/$name.txt",$text); $n++; };
foreach(['A','Hello, World!','HELLO WORLD','hello world','Hello World 123 – ünï','12345678901234567890','1234567890123','12','abc123DEF456','a;b<c>d@e[f\\g]h_i`j~k!l','Mixed: 5 & 6 = 11; +%$/-.,#^*','ALL UPPER CASE TEXT',"Line1\nLine2\r\nTab\there",'https://example.com/q/tk.1.ABCDEFGH?x=1&y=2'] as $i=>$t) $save("t$i",$t);
foreach([0,1,2,3,4,5,6,7,8] as $l) $save("lv$l",'Level test '.$l.' the quick brown fox',$l);
foreach([1,2,3,5,8,12,20,30] as $c) $save("col$c",str_repeat('Column test ',8),null,$c);
$bin=''; for($i=0;$i<200;$i++) $bin.=chr(mt_rand(0,255)); $save('bin200',$bin); $bin6=substr($bin,0,60); $save('bin60',$bin6); $save('bin61',substr($bin,0,61));
$d=''; for($i=0;$i<300;$i++) $d.=mt_rand(0,9); $save('num300',$d); $d2=''; for($i=0;$i<44;$i++) $d2.=mt_rand(0,9); $save('num44',$d2); $save('num45',$d2.'7'); $save('num0lead','000000000000000000000012345');
for($i=0;$i<40;$i++){ $len=mt_rand(1,120); $t=''; for($j=0;$j<$len;$j++){ $r=mt_rand(0,9); $t.= $r<3?chr(mt_rand(97,122)):($r<5?chr(mt_rand(65,90)):($r<7?chr(mt_rand(48,57)):chr(mt_rand(32,126)))); } $save("r$i",$t); }
$big=''; for($i=0;$i<900;$i++) $big.=chr(mt_rand(32,126)); try{ $save('big',$big,2); }catch(Throwable $e){ echo 'big: '.$e->getMessage()."\n"; }
$save('big600',substr($big,0,600),2);
for($len=1;$len<=48;$len++){ $b=''; for($i=0;$i<$len;$i++) $b.=chr(mt_rand(0,255)); $save('byt'.$len,$b); }
for($len=2;$len<=60;$len+=3){ $d=''; for($i=0;$i<$len;$i++) $d.=mt_rand(0,9); $save('dig'.$len,$d); }
echo "made $n\n";
