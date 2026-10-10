<?php
require __DIR__ . '/../../../vendor/autoload.php';
use App\Services\Codes\Linear\{Code128,Ean,Code39,Itf}; use App\Services\Codes\Render\PngRenderer;
$out=$argv[1]; @mkdir($out,0777,true); array_map('unlink',glob("$out/*"));
mt_srand(5); $n=0;
$save=function($name,$code,$expect,$fmt) use($out,&$n){ file_put_contents("$out/$name.png",PngRenderer::linear($code,['scale'=>3,'height'=>80])); file_put_contents("$out/$name.txt",$expect); file_put_contents("$out/$name.fmt",$fmt); $n++; };
// Code 128
$samples=['A','Hello, World!','1234567890','12345','ABC123abc','SKU-000123','a1b2c3d4e5','0000000000000000','Line1',"tab\there",'~}|{zyx','#@!%^&*()_+','12ab34','123456abcdef7890','Z9'];
for($i=0;$i<60;$i++){ $len=mt_rand(1,24); $s=''; for($j=0;$j<$len;$j++){ $r=mt_rand(0,9); $s.= $r<5 ? chr(48+mt_rand(0,9)) : ($r<8 ? chr(mt_rand(65,90)) : chr(mt_rand(97,122))); } $samples[]=$s; }
foreach($samples as $i=>$s){ $save("c128_$i",Code128::encode($s),$s,'Code128'); }
// EAN/UPC
foreach(['590123412345','400638133393','978020137962','000000000001','123456789012'] as $i=>$d){ $c=Ean::ean13($d); $save("ean13_$i",$c,$c->text,'EAN13'); }
foreach(['1234567','9638507','5512345'] as $i=>$d){ $c=Ean::ean8($d); $save("ean8_$i",$c,$c->text,'EAN8'); }
foreach(['03600029145','01234567890','78742345987'] as $i=>$d){ $c=Ean::upcA($d); $save("upca_$i",$c,'0'.$c->text,'EAN13'); }
foreach(['01234500006','01200000345','04252300007','02345000006','04210000526','01234565000'] as $i=>$d){ try{ $c=Ean::upcE($d); $save("upce_$i",$c,$c->text,'UPCE'); }catch(Throwable $e){ echo "upce $d: ".$e->getMessage()."\n"; } }
// Code 39, ITF
foreach(['CODE39','ABC-123','HELLO WORLD','$/+%','12345','A.B-C'] as $i=>$s){ $save("c39_$i",Code39::encode($s),$s,'Code39'); }
foreach(['CODE39','AB12'] as $i=>$s){ $c=Code39::encode($s,true); $save("c39c_$i",$c,$c->text,'Code39'); }
foreach(['1234','12345678','00123456','9876543210'] as $i=>$s){ $save("itf_$i",Itf::encode($s),$s,'ITF'); }
foreach(['1234567890123','1234567890128'] as $i=>$s){ $c=Itf::itf14($s); $save("itf14_$i",$c,$c->text,'ITF'); }
echo "made $n\n";
// UPC-E: every check digit, both number systems (6 digits chosen by search so each check digit is hit)
$hit=[];
for($ns=0;$ns<=1;$ns++){ for($n=0;$n<100000 && count($hit)<20;$n++){ $six=str_pad((string)$n,6,'0',STR_PAD_LEFT); $c=Ean::upcE($ns.$six); $chk=(int)substr($c->text,-1); if(!isset($hit["$ns$chk"])){ $hit["$ns$chk"]=1; $save("upce_all_$ns$chk",$c,$c->text,'UPCE'); } } }
foreach(['0123456789','9999','00000000','1357924680'] as $i=>$s){ $save("itfd_$i",Itf::encode($s),$s,'ITF'); }
$save('c39_all',Code39::encode('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%'),'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%','Code39');
mt_srand(11); $alpha=array_merge(range(0,31),range(32,126)); // control chars, digits, letters, punctuation mixed
for($i=0;$i<250;$i++){ $len=mt_rand(1,30); $s=''; for($j=0;$j<$len;$j++){ $r=mt_rand(0,9); $s.= $r<4 ? chr(48+mt_rand(0,9)) : ($r<6 ? chr(mt_rand(97,122)) : ($r<8 ? chr(mt_rand(65,90)) : chr($alpha[mt_rand(0,count($alpha)-1)]))); }
  if (preg_match('/[\x00-\x1f]/',$s)) continue; $save("c128r_$i",Code128::encode($s),$s,'Code128'); }
// control characters (set A) are exercised separately because some decoders trim them
echo "total $n\n";
