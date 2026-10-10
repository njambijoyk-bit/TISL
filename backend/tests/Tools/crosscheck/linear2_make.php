<?php
require __DIR__ . '/../../../vendor/autoload.php';
use App\Services\Codes\Linear\{Code93,Codabar,Gs1128}; use App\Services\Codes\Render\PngRenderer;
$out=$argv[1]; @mkdir($out,0777,true); array_map('unlink',glob("$out/*")); $n=0;
$save=function($name,$code,$expect,$fmt) use($out,&$n){ file_put_contents("$out/$name.png",PngRenderer::linear($code,['scale'=>3,'height'=>80])); file_put_contents("$out/$name.txt",$expect); file_put_contents("$out/$name.fmt",$fmt); $n++; };
mt_srand(3);
foreach(['A','HELLO','0123456789','ABC-123.4 $/+%','Hello, World!','a~b|c{d}'] as $i=>$s) $save("c93_$i",Code93::encode($s),$s,'Code93');
for($i=0;$i<80;$i++){ $s=''; $len=mt_rand(1,16); for($j=0;$j<$len;$j++) $s.=chr(mt_rand(32,126)); $save("c93r_$i",Code93::encode($s),$s,'Code93'); }
// control characters through the shifts
$ctl=''; for($c=1;$c<=31;$c++) $ctl.=chr($c); $save('c93_ctl',Code93::encode($ctl),$ctl,'Code93'); $save('c93_del',Code93::encode("a\x7fz"),"a\x7fz",'Code93');
foreach(['12345','-$:/.+','1234-5678','0','999999'] as $i=>$s){ $c=Codabar::encode($s); $save("cb_$i",$c,$c->text,'Codabar'); }
foreach(['C12345D','A987B'] as $i=>$s){ $c=Codabar::encode($s); $save("cbx_$i",$c,$c->text,'Codabar'); }
foreach(['(01)09501101530003','(01)09501101530003(17)250331(10)LOT42','(10)ABC123(21)SERIAL99(30)12','(00)106141411234567897','(01)09501101530003(3103)000500(15)260630(10)B7'] as $i=>$s){ $c=Gs1128::encode($s); $save("gs1_$i",$c,$s,'GS1'); }
echo "made $n\n";
