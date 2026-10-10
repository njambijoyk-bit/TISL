<?php

namespace Tests\Unit\Codes;

use App\Services\Codes\BitMatrix;
use App\Services\Codes\CodeException;
use App\Services\Codes\CodeFactory;
use App\Services\Codes\Pdf417\Pdf417Decoder;
use App\Services\Codes\Pdf417\Pdf417Encoder;
use App\Services\Codes\Pdf417\Pdf417Tables;
use PHPUnit\Framework\TestCase;

/**
 * Our own PDF417 encoder. Besides these tests, 80 symbols (every error-correction level, text, numeric and byte compaction, 1 to 30 columns) were read back by an independent
 * decoder (zxing-cpp), and several match another implementation (python pdf417gen) row for row: see tests/Tools/crosscheck.
 */
class Pdf417Test extends TestCase
{
    /** @return array<int, int[]> the symbol as the codeword patterns of each row */
    private function rows(BitMatrix $m): array
    {
        $out = [];
        $n = $m->width - 18;
        foreach ($m->rows() as $row) {
            $r = [];
            for ($i = 0; $i < $n; $i += 17) {
                $r[] = bindec(implode('', array_map(fn ($b) => $b ? '1' : '0', array_slice($row, $i, 17))));
            }
            $r[] = bindec(implode('', array_map(fn ($b) => $b ? '1' : '0', array_slice($row, $n, 18))));
            $out[] = $r;
        }

        return $out;
    }

    public function test_every_pattern_in_the_tables_is_a_real_one_of_its_cluster(): void
    {
        $this->assertCount(3, Pdf417Tables::CLUSTERS);
        foreach (Pdf417Tables::CLUSTERS as $cluster => $patterns) {
            $this->assertCount(929, $patterns);
            $this->assertCount(929, array_unique($patterns), 'no two codewords share a pattern');
            foreach ($patterns as $cw => $v) {
                preg_match_all('/(1+|0+)/', str_pad(decbin($v), 17, '0', STR_PAD_LEFT), $m);
                $w = array_map('strlen', $m[0]);
                $this->assertCount(8, $w, "cluster {$cluster} codeword {$cw}: four bars and four spaces");
                $this->assertSame(17, array_sum($w));
                $this->assertSame($cluster * 3, ($w[0] - $w[2] + $w[4] - $w[6] + 9) % 9, "cluster {$cluster} codeword {$cw}");
            }
        }
    }

    public function test_the_error_correction_polynomials_are_the_standards(): void
    {
        $this->assertSame([27, 917], Pdf417Encoder::generator(2));
        $this->assertSame([522, 568, 723, 809], Pdf417Encoder::generator(4));
        $this->assertSame([237, 308, 436, 284, 646, 653, 428, 379], Pdf417Encoder::generator(8));
        $this->assertSame([274, 562, 232, 755, 599, 524, 801, 132, 295, 116, 442, 428, 295, 42, 176, 65], Pdf417Encoder::generator(16));
        $this->assertCount(2 ** 9, Pdf417Encoder::ecc([5, 6, 7], 8), 'level 8 has 512 error-correction codewords');
    }

    public function test_rows_match_another_implementation_exactly(): void
    {
        $this->assertSame([[130728, 125680, 108640, 93792, 73860, 117936, 120032, 260649], [130728, 128280, 115396, 118212, 85980, 97968, 129720, 260649],
            [130728, 109040, 94284, 96328, 91248, 73056, 108792, 260649], [130728, 89720, 125244, 118432, 100038, 66626, 89980, 260649]], $this->rows(Pdf417Encoder::encode('HELLO WORLD', 2, 4)));
        $this->assertSame([[130728, 125680, 110016, 81384, 75360, 123580, 120032, 260649], [130728, 128304, 128614, 103328, 129868, 105972, 129720, 260649],
            [130728, 109040, 93304, 102290, 102290, 102290, 109040, 260649], [130728, 89720, 67022, 128978, 76824, 116126, 89980, 260649]], $this->rows(Pdf417Encoder::encode('12345678901234567890', 1, 4)));
    }

    public function test_modes_are_chosen_and_the_numbers_come_out_right(): void
    {
        $this->assertSame(902, Pdf417Encoder::compact('1234')[0], 'digits: numeric');
        $this->assertSame(901, Pdf417Encoder::compact("\x00\x01\x02")[0], 'bytes (not a multiple of 6)');
        $this->assertSame(924, Pdf417Encoder::compact("\x00\x01\x02\x03\x04\x05")[0], 'bytes in whole groups of 6');
        $this->assertNotContains(Pdf417Encoder::compact('Hello')[0], [901, 902, 924], 'text');
        $this->assertSame(902, Pdf417Encoder::compact('12')[0]);
        $this->assertNotSame(902, Pdf417Encoder::compact('1')[0], 'a single digit is text');
        // 6 bytes make 5 codewords; 44 digits make 15
        $this->assertCount(1 + 5, Pdf417Encoder::bytes("\xff\xff\xff\xff\xff\xff"));
        $this->assertCount(15, Pdf417Encoder::numeric(str_repeat('9', 44)));
        $this->assertCount(15 + 1, Pdf417Encoder::numeric(str_repeat('9', 45)), '44 digits, then one more digit');
        $this->assertCount(15, Pdf417Encoder::numeric(str_repeat('0', 44)), 'forty-four zeros keep their length through the leading 1');
    }

    public function test_what_we_encode_we_decode(): void
    {
        mt_srand(21);
        $texts = ['A', 'Hello, World!', 'HELLO WORLD', 'hello world', 'Mixed: 5 & 6 = 11; (x)', "Line1\nLine2\r\nTab\there", 'a;b<c>d@e[f\\g]h_i`j~k!l"m|n*o(p)q?r{s}t\'u', '12', '1234567890123', '000000000000000000000012345', str_repeat('7', 200)];
        for ($i = 0; $i < 30; $i++) {
            $t = '';
            for ($j = mt_rand(1, 150); $j > 0; $j--) {
                $t .= chr(mt_rand(32, 126));
            }
            $texts[] = $t;
        }
        foreach ($texts as $t) {
            $r = Pdf417Decoder::decode(Pdf417Encoder::encode($t));
            $this->assertSame($t, $r['text'], $t);
        }
        foreach ([1, 5, 6, 7, 11, 12, 17, 29, 30, 35, 60, 61, 65] as $len) {
            $bin = '';
            for ($i = 0; $i < $len; $i++) {
                $bin .= chr(mt_rand(0, 255));
            }
            $this->assertSame($bin, Pdf417Decoder::decode(Pdf417Encoder::encode($bin))['text'], "{$len} bytes");
        }
        $this->assertSame('Nairobi – ñ ✓', Pdf417Decoder::decode(Pdf417Encoder::encode('Nairobi – ñ ✓'))['text']);
    }

    public function test_every_level_and_column_count_reads_back(): void
    {
        for ($l = 0; $l <= 8; $l++) {
            $r = Pdf417Decoder::decode(Pdf417Encoder::encode('Level ' . $l, $l, 12));
            $this->assertSame(['Level ' . $l, $l, 12], [$r['text'], $r['level'], $r['columns']]);
        }
        foreach ([1, 2, 7, 15, 30] as $c) {
            $r = Pdf417Decoder::decode(Pdf417Encoder::encode(str_repeat('column test ', $c === 1 ? 2 : 6), null, $c));
            $this->assertSame($c, $r['columns']);
        }
    }

    public function test_the_shape_follows_the_asked_aspect_and_the_data_size_picks_the_level(): void
    {
        $m = Pdf417Encoder::encode(str_repeat('x', 200));
        $this->assertEqualsWithDelta(3.0, $m->width / ($m->height * 3), 1.5, 'about three times as wide as tall');
        $wide = Pdf417Encoder::encode(str_repeat('x', 200), null, null, 6.0);
        $tall = Pdf417Encoder::encode(str_repeat('x', 200), null, null, 1.0);
        $this->assertGreaterThan($tall->width, $wide->width);
        $this->assertSame(2, Pdf417Decoder::decode(Pdf417Encoder::encode('short'))['level']);
        $this->assertSame(3, Pdf417Decoder::decode(Pdf417Encoder::encode(str_repeat('x', 100)))['level']);
        $this->assertSame(4, Pdf417Decoder::decode(Pdf417Encoder::encode(str_repeat('x', 400)))['level']);
        $this->assertSame(5, Pdf417Decoder::decode(Pdf417Encoder::encode(str_repeat('x', 800)))['level']);
    }

    public function test_the_row_indicators_carry_the_shape(): void
    {
        // row 0 left indicator = rows/3 band, cluster 0: 30 * 0 + (R-1) div 3; right = columns - 1
        $m = Pdf417Encoder::encode('indicator test', 2, 4);
        $rows = $this->rows($m);
        $R = count($rows);
        $left = array_flip(Pdf417Tables::CLUSTERS[0]);
        $right = array_flip(Pdf417Tables::CLUSTERS[0]);
        $this->assertSame(intdiv($R - 1, 3), $left[$rows[0][1]]);
        $this->assertSame(3, $right[$rows[0][1 + 4 + 1]]);
        $c1 = array_flip(Pdf417Tables::CLUSTERS[1]);
        $this->assertSame(2 * 3 + ($R - 1) % 3, $c1[$rows[1][1]], 'row 1: the error-correction level and the row count');
    }

    public function test_refusals(): void
    {
        foreach ([fn () => Pdf417Encoder::encode(''), fn () => Pdf417Encoder::encode('x', 9), fn () => Pdf417Encoder::encode('x', null, 31), fn () => Pdf417Encoder::encode('x', null, 0),
            fn () => Pdf417Encoder::encode(str_repeat("\xe9", 2000))] as $f) {
            try {
                $f();
                $this->fail('Expected a refusal');
            } catch (CodeException) {
                $this->addToAssertionCount(1);
            }
        }
        $this->expectException(CodeException::class);
        Pdf417Encoder::encode(str_repeat('x', 3000), 0, 1);
    }

    public function test_a_damaged_symbol_is_refused(): void
    {
        $m = Pdf417Encoder::encode('HELLO WORLD', 2, 4);
        $rows = $m->rows();
        $rows[1][40] = ! $rows[1][40];
        try {
            Pdf417Decoder::decode(new BitMatrix($m->width, $m->height, $rows));
            $this->fail('Expected a refusal');
        } catch (CodeException) {
            $this->addToAssertionCount(1);
        }
        $rows = $m->rows();
        $rows[0][0] = false;
        $this->expectException(CodeException::class);
        Pdf417Decoder::decode(new BitMatrix($m->width, $m->height, $rows));
    }

    public function test_symbols_that_an_independent_decoder_read_are_kept_as_they_were(): void
    {
        // each was read by zxing-cpp when the hash was taken: every text sub-mode change, shifts, punctuation, bytes, and numbers with leading zeros
        $cases = ['Hello, World!', 'Hello World 123 – ünï', 'a;b<c>d@e[f\\g]h_i`j~k!l', 'Mixed: 5 & 6 = 11; +%$/-.,#^*', "Line1\nLine2\r\nTab\there", 'https://example.com/q/tk.1.ABCDEFGH?x=1&y=2', '000000000000000000000012345'];
        $all = '';
        foreach ($cases as $t) {
            $all .= sha1(Pdf417Encoder::encode($t)->toText()) . ' ';
        }
        $this->assertSame('a42f804a86267839f986c899283f0678f18ced29', sha1($all));
    }

    public function test_the_picture_has_rows_three_modules_tall(): void
    {
        $g = CodeFactory::make('pdf417', 'ORDER-7');
        $svg = $g->svg();
        $this->assertStringContainsString('viewBox="0 0 ' . ($g->code->width + 4) . ' ' . ($g->code->height * 3 + 4) . '"', $svg);
        $png = $g->png(['scale' => 2]);
        [$w, $h] = getimagesizefromstring($png);
        $this->assertSame([($g->code->width + 4) * 2, $g->code->height * 6 + 8], [$w, $h]);
    }
}
