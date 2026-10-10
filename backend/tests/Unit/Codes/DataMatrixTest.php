<?php

namespace Tests\Unit\Codes;

use App\Services\Codes\BitMatrix;
use App\Services\Codes\CodeException;
use App\Services\Codes\CodeFactory;
use App\Services\Codes\DataMatrix\DmDecoder;
use App\Services\Codes\DataMatrix\DmEncoder;
use App\Services\Codes\DataMatrix\DmPlacement;
use App\Services\Codes\DataMatrix\DmSpec;
use PHPUnit\Framework\TestCase;

/** Our own Data Matrix ECC 200 encoder. The same symbols were also read back by an independent decoder (zxing-cpp) at every size: see tests/Tools/crosscheck. */
class DataMatrixTest extends TestCase
{
    public function test_every_size_in_the_table_holds_exactly_what_its_data_area_can_carry(): void
    {
        foreach (DmSpec::SIZES as $s) {
            $d = DmSpec::describe($s);
            $modules = $d['nrow'] * $d['ncol'];
            $this->assertSame(intdiv($modules, 8), $d['data'] + $d['ecc'], "{$d['rows']}x{$d['cols']}: data + error correction fill the data area");
            $this->assertSame(0, $d['ecc'] % $d['blocks'], "{$d['rows']}x{$d['cols']}: the error-correction splits evenly over the blocks");
            $this->assertSame($d['rows'], $d['vr'] * ($d['regionH'] + 2));
            $this->assertSame($d['cols'], $d['hr'] * ($d['regionW'] + 2));
        }
        $this->assertCount(30, DmSpec::SIZES);
    }

    public function test_placement_gives_every_codeword_bit_one_module_exactly_once(): void
    {
        foreach (DmSpec::SIZES as $s) {
            $d = DmSpec::describe($s);
            $map = DmPlacement::map($d['nrow'], $d['ncol']);
            $seen = [];
            foreach ($map as $v) {
                if ($v > 1) {
                    $this->assertArrayNotHasKey($v, $seen, "{$d['rows']}x{$d['cols']}: a bit placed twice");
                    $seen[$v] = true;
                }
            }
            $this->assertCount(($d['data'] + $d['ecc']) * 8, $seen, "{$d['rows']}x{$d['cols']}: every bit of every codeword has a module");
        }
    }

    public function test_the_standards_worked_example_123456(): void
    {
        // ISO/IEC 16022: "123456" in a 10x10 is three digit-pair codewords, with these five error-correction codewords
        $this->assertSame([142, 164, 186], DmEncoder::ascii('123456'));
        $size = DmSpec::bySize(10, 10);
        $this->assertSame([114, 25, 5, 88, 102], DmEncoder::eccFor([142, 164, 186], $size));
    }

    public function test_ascii_mode_packs_digit_pairs_and_shifts_for_characters_from_128_up(): void
    {
        $this->assertSame([66], DmEncoder::ascii('A'));
        $this->assertSame([141, 50], DmEncoder::ascii('11' . '1'));   // "11" is one codeword, a lone "1" is its code + 1
        $this->assertSame([50, 66, 50], DmEncoder::ascii('1A1'), 'digits that are not next to each other stay single');
        $this->assertSame([235, 1], DmEncoder::ascii("\x80"));
        $this->assertSame([232, 141], DmEncoder::ascii("\xF111", true), 'FNC1 only in GS1 mode');
        $this->assertSame([235, 114], DmEncoder::ascii("\xF1"), '… otherwise it is just a byte');
    }

    public function test_the_smaller_of_ascii_and_base_256_is_used(): void
    {
        $bin = '';
        for ($i = 0; $i < 40; $i++) {
            $bin .= chr(128 + $i);   // every byte would cost two codewords in ASCII mode
        }
        $this->assertSame(231, DmEncoder::codewords($bin)[0]);
        $this->assertCount(42, DmEncoder::codewords($bin));
        $this->assertSame([67, 66], array_slice(DmEncoder::codewords('BA'), 0, 2), 'plain text stays in ASCII mode');
        $long = DmEncoder::base256(str_repeat('x', 300));
        $this->assertCount(1 + 2 + 300, $long, 'a length over 249 takes two bytes');
    }

    public function test_the_smallest_symbol_that_fits_is_chosen(): void
    {
        $this->assertSame([10, 10], $this->dims(DmEncoder::encode('A')));
        $this->assertSame([12, 12], $this->dims(DmEncoder::encode('ABCD')));   // 4 codewords > 3
        $this->assertSame([10, 10], $this->dims(DmEncoder::encode('123456')));
        $this->assertSame([144, 144], $this->dims(DmEncoder::encode(str_repeat('a', 1558))));
        $this->assertSame([8, 18], $this->dims(DmEncoder::encode('ABC', 'rectangle')));
        $this->assertSame([12, 12], $this->dims(DmEncoder::encode('ABCDE', 'any')), 'on a tie a square wins over the 8x18 rectangle');
        $this->assertSame([8, 32], $this->dims(DmEncoder::encode('ABCDEFGHI', 'any')), 'any shape takes a rectangle when it is the smallest that fits');
    }

    /** @return array{0: int, 1: int} */
    private function dims(BitMatrix $m): array
    {
        return [$m->height, $m->width];
    }

    public function test_too_much_or_nothing_or_a_bad_shape_is_refused(): void
    {
        foreach ([fn () => DmEncoder::encode(str_repeat('a', 1559)), fn () => DmEncoder::encode(''), fn () => DmEncoder::encode('x', 'round')] as $f) {
            try {
                $f();
                $this->fail('Expected a refusal');
            } catch (CodeException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function test_what_we_encode_we_decode_at_every_size_and_in_both_modes(): void
    {
        mt_srand(4);
        foreach (DmSpec::SIZES as $s) {
            $d = DmSpec::describe($s);
            $shape = $d['rows'] === $d['cols'] ? 'square' : 'rectangle';
            $text = '';
            for ($i = 0; $i < $d['data']; $i++) {
                $text .= chr(mt_rand(97, 122));
            }
            $r = DmDecoder::decode(DmEncoder::encode($text, $shape));
            $this->assertSame([$text, $d['rows'], $d['cols'], false], [$r['text'], $r['rows'], $r['cols'], $r['gs1']], "{$d['rows']}x{$d['cols']}");
            $digits = '';
            for ($i = 0; $i < $d['data'] * 2; $i++) {
                $digits .= mt_rand(0, 9);
            }
            $this->assertSame($digits, DmDecoder::decode(DmEncoder::encode($digits, $shape))['text'], "{$d['rows']}x{$d['cols']} digits");
        }
        $bin = '';
        for ($i = 0; $i < 300; $i++) {
            $bin .= chr(mt_rand(0, 255));
        }
        $this->assertSame($bin, DmDecoder::decode(DmEncoder::encode($bin))['text'], 'binary, 300 bytes (length over 249)');
        foreach (['A', 'Nairobi – ñ ✓', "tab\tnew\nline\0nul", '0', '00', '000'] as $t) {
            $this->assertSame($t, DmDecoder::decode(DmEncoder::encode($t, 'any'))['text']);
        }
    }

    public function test_gs1_data_matrix_starts_with_fnc1_and_separates_variable_fields(): void
    {
        $m = CodeFactory::make('gs1datamatrix', '(01)09501101530003(10)LOT42(21)S9')->code;
        $r = DmDecoder::decode($m);
        $this->assertTrue($r['gs1']);
        $this->assertSame("\xF1" . '0109501101530003' . '10LOT42' . "\xF1" . '21S9', $r['text']);
        $this->assertFalse(DmDecoder::decode(DmEncoder::encode('x'))['gs1']);
    }

    public function test_the_finder_pattern_is_where_the_standard_puts_it(): void
    {
        $m = DmEncoder::encode('A');   // 10 x 10
        for ($i = 0; $i < 10; $i++) {
            $this->assertTrue($m->get(0, $i), 'solid left side');
            $this->assertTrue($m->get($i, 9), 'solid bottom');
            $this->assertSame($i % 2 === 0, $m->get($i, 0), 'alternating top');
            $this->assertSame((9 - $i) % 2 === 0, $m->get(9, $i), 'alternating right');
        }
        $big = DmEncoder::encode(str_repeat('a', 62));   // 32 x 32: four regions
        $this->assertSame(32, $big->width);
        for ($i = 0; $i < 32; $i++) {
            $this->assertTrue($big->get(16, $i), 'the second region has its own solid left side');
            $this->assertTrue($big->get($i, 15), 'and the second row of regions its own bottom edge above');
        }
    }

    public function test_a_damaged_or_foreign_symbol_is_refused(): void
    {
        $m = DmEncoder::encode('HELLO WORLD');
        $rows = $m->rows();
        $rows[4][4] = ! $rows[4][4];
        try {
            DmDecoder::decode(new BitMatrix($m->width, $m->height, $rows));
            $this->fail('Expected a refusal');
        } catch (CodeException $e) {
            $this->assertStringContainsString('error-correction', $e->getMessage());
        }
        $rows = $m->rows();
        $rows[0][0] = false;
        try {
            DmDecoder::decode(new BitMatrix($m->width, $m->height, $rows));
            $this->fail('Expected a refusal');
        } catch (CodeException $e) {
            $this->assertStringContainsString('finder', $e->getMessage());
        }
        $this->expectException(CodeException::class);
        DmDecoder::decode(BitMatrix::blank(15, 15));
    }

    public function test_symbols_that_an_independent_decoder_read_are_kept_as_they_were(): void
    {
        // each was read by zxing-cpp when the hashes were taken
        foreach ([['Hello, World!', 'square', 'e6bba02be328c3d8bbc650117e86f878ff87ad99'], ['https://example.com/q/tk.1.ABC', 'square', 'fc4b65a3ac545dfc2c66512523e4fa21cf91b6a1'],
            [str_repeat('a', 62), 'square', '3918e348aaff22221bf7760730d7693e228ed7d5'], ['0123456789', 'square', 'f6d4a357c0b54973c7abb09cf339e692fb6e6968'],
            ['Nairobi – ñ ✓', 'any', '80cf1d721604f69623ec0d198eb5ade9b69071ff']] as [$text, $shape, $hash]) {
            $this->assertSame($hash, sha1(DmEncoder::encode($text, $shape)->toText()), $text);
        }
    }

    public function test_the_multi_block_sizes_are_kept_as_an_independent_decoder_read_them(): void
    {
        // these are where error-correction is split over 2 to 10 interleaved blocks; zxing-cpp read every one of them
        $all = '';
        foreach ([52, 64, 72, 80, 88, 96, 104, 120, 132, 144] as $n) {
            $d = DmSpec::bySize($n, $n);
            $text = substr(str_repeat('abcdefghijklmnopqrstuvwxyz', 70), 0, $d['data']);
            $m = DmEncoder::encode($text);
            $this->assertSame($n, $m->height);
            $all .= sha1($m->toText()) . ' ';
        }
        $this->assertSame('8f41db4d8760be0e6714e9b619243f7acda67786', sha1($all));
    }

    public function test_svg_uses_a_two_module_border(): void
    {
        $g = CodeFactory::make('datamatrix', 'ORDER-7');
        $svg = $g->svg();
        $this->assertStringContainsString('viewBox="0 0 ' . ($g->code->width + 4) . ' ' . ($g->code->height + 4) . '"', $svg);
        $this->assertStringStartsWith("\x89PNG", $g->png(['scale' => 4]));
    }
}
