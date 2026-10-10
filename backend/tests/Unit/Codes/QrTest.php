<?php

namespace Tests\Unit\Codes;

use App\Services\Codes\BitMatrix;
use App\Services\Codes\CodeException;
use App\Services\Codes\Qr\QrEncoder;
use App\Services\Codes\Qr\QrLayout;
use App\Services\Codes\Qr\QrMatrixDecoder;
use App\Services\Codes\Qr\QrSpec;
use App\Services\Codes\Render\PngRenderer;
use App\Services\Codes\Render\SvgRenderer;
use PHPUnit\Framework\TestCase;

/**
 * Our own QR encoder. Besides the tests here, every symbol size and level was also read back by an independent decoder (zxing-cpp): see docs/CODES_PLAN.md.
 */
class QrTest extends TestCase
{
    public function test_the_capacity_table_matches_the_standard_for_every_version_and_level(): void
    {
        // data codewords per version 1..40, from the standard's capacity tables
        $std = [
            'L' => [19, 34, 55, 80, 108, 136, 156, 194, 232, 274, 324, 370, 428, 461, 523, 589, 647, 721, 795, 861, 932, 1006, 1094, 1174, 1276, 1370, 1468, 1531, 1631, 1735, 1843, 1955, 2071, 2191, 2306, 2434, 2566, 2702, 2812, 2956],
            'M' => [16, 28, 44, 64, 86, 108, 124, 154, 182, 216, 254, 290, 334, 365, 415, 453, 507, 563, 627, 669, 714, 782, 860, 914, 1000, 1062, 1128, 1193, 1267, 1373, 1455, 1541, 1631, 1725, 1812, 1914, 1992, 2102, 2216, 2334],
            'Q' => [13, 22, 34, 48, 62, 76, 88, 110, 132, 154, 180, 206, 244, 261, 295, 325, 367, 397, 445, 485, 512, 568, 614, 664, 718, 754, 808, 871, 911, 985, 1033, 1115, 1171, 1231, 1286, 1354, 1426, 1502, 1582, 1666],
            'H' => [9, 16, 26, 36, 46, 60, 66, 86, 100, 122, 140, 158, 180, 197, 223, 253, 283, 313, 341, 385, 406, 442, 464, 514, 538, 596, 628, 661, 701, 745, 793, 845, 901, 961, 986, 1054, 1096, 1142, 1222, 1276],
        ];
        foreach ($std as $level => $caps) {
            foreach ($caps as $i => $cap) {
                $this->assertSame($cap, QrSpec::dataCodewords($level, $i + 1), "version " . ($i + 1) . " level {$level}");
            }
        }
    }

    public function test_alignment_pattern_positions_match_known_versions(): void
    {
        $this->assertSame([], QrSpec::alignmentPositions(1));
        $this->assertSame([6, 18], QrSpec::alignmentPositions(2));
        $this->assertSame([6, 22, 38], QrSpec::alignmentPositions(7));
        $this->assertSame([6, 34, 60, 86, 112, 138], QrSpec::alignmentPositions(32));
        $this->assertSame([6, 30, 58, 86, 114, 142, 170], QrSpec::alignmentPositions(40));
    }

    public function test_the_standards_own_example_01234567_at_level_m(): void
    {
        // data and error-correction codewords of the worked example in ISO/IEC 18004
        $bits = '0001' . '0000001000' . '0000001100' . '0101011001' . '1000011' . '0000' . '000';   // mode, count 8, 012 345 67 as 10+10+7 bits, terminator, padded to a byte
        $data = array_map('bindec', str_split($bits, 8));
        $this->assertSame([0x10, 0x20, 0x0C, 0x56, 0x61, 0x80], $data);
        $data = array_merge($data, [0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11]);
        $words = QrEncoder::addErrorCorrection($data, 'M', 1);
        $this->assertSame([0xA5, 0x24, 0xD4, 0xC1, 0xED, 0x36, 0xC7, 0x87, 0x2C, 0x55], array_slice($words, 16));
    }

    public function test_the_mode_is_the_most_compact_that_fits(): void
    {
        $this->assertSame('numeric', QrEncoder::modeFor('0123456789'));
        $this->assertSame('alnum', QrEncoder::modeFor('ORDER-7 $5.00'));
        $this->assertSame('byte', QrEncoder::modeFor('order-7'));
        $this->assertSame('byte', QrEncoder::modeFor('Nairobi – ñ'));
        $this->assertSame('byte', QrEncoder::modeFor(''));
    }

    public function test_the_smallest_version_that_fits_is_chosen_and_a_minimum_can_be_asked(): void
    {
        $this->assertSame(1, QrEncoder::encode('HELLO WORLD', 'Q')->version);
        $this->assertSame(1, QrEncoder::encode('01234567', 'M')->version);
        $this->assertSame(5, QrEncoder::encode('HELLO WORLD', 'Q', 5)->version);
        $this->assertSame(21, QrEncoder::encode('A', 'L')->matrix->width);
        $this->assertSame(177, QrEncoder::encode('A', 'L', 40)->matrix->width);
        $this->assertSame(2, QrEncoder::encode(str_repeat('a', 18), 'L')->version, 'v1-L holds 17 bytes');
    }

    public function test_the_limits_are_refused_politely(): void
    {
        foreach ([
            fn () => QrEncoder::encode(str_repeat('9', 7090), 'L'),
            fn () => QrEncoder::encode(str_repeat('a', 2954), 'L'),
            fn () => QrEncoder::encode('x', 'Z'),
            fn () => QrEncoder::encode('x', 'M', 41),
            fn () => QrEncoder::encode('x', 'M', null, 8),
        ] as $f) {
            try {
                $f();
                $this->fail('Expected a refusal');
            } catch (CodeException $e) {
                $this->assertNotSame('', $e->getMessage());
            }
        }
        $this->assertSame(40, QrEncoder::encode(str_repeat('9', 7089), 'L')->version, 'the largest numeric code fits');
        $this->assertSame(40, QrEncoder::encode(str_repeat('a', 2953), 'L')->version, 'and the largest byte code');
    }

    public function test_what_we_encode_we_decode_for_every_version_level_and_mode(): void
    {
        mt_srand(7);
        $alpha = 'abcdefghijklmnopqrstuvwxyz0123456789 .-/:?=&';
        foreach (QrSpec::LEVELS as $level) {
            for ($v = 1; $v <= 40; $v++) {
                $cap = intdiv(QrSpec::dataCodewords($level, $v) * 8 - 4 - QrSpec::countBits('byte', $v), 8);
                $text = '';
                for ($i = 0; $i < $cap; $i++) {
                    $text .= $alpha[mt_rand(0, strlen($alpha) - 1)];
                }
                $q = QrEncoder::encode($text, $level, $v);
                $r = QrMatrixDecoder::decode($q->matrix);
                $this->assertSame([$text, $v, $level, $q->mask], [$r['text'], $r['version'], $r['level'], $r['mask']], "v{$v} {$level}");
            }
        }
        foreach (['0', '12', '123', '1234567890123', 'A', 'AB', 'ABC-123/X', "Nairobi – ñ ✓", "line1\nline2\x00end"] as $text) {
            $this->assertSame($text, QrMatrixDecoder::decode(QrEncoder::encode($text, 'M')->matrix)['text']);
        }
    }

    public function test_symbols_that_an_independent_decoder_read_are_kept_as_they_were(): void
    {
        // each of these was read by zxing-cpp (not our code) when the hashes were taken; a change to the encoder shows up here
        foreach ([['HELLO WORLD', 'M', 'd2a196b2aab8111e24b8f03fb098aa3249f18108'], ['01234567', 'Q', '28a7c22c9ef1b1b20f3e21dc3ad9ba1a81837637'],
            ['https://example.com/q/ABC123', 'L', 'fa9e5ad3a63dd88d1ca707a9c850f1e20e0c4da1']] as [$text, $level, $hash]) {
            $this->assertSame($hash, sha1(QrEncoder::encode($text, $level)->matrix->toText()), "{$text} {$level}");
        }
    }

    public function test_the_eight_masks_follow_the_standards_formulas(): void
    {
        for ($y = 0; $y < 12; $y++) {
            for ($x = 0; $x < 12; $x++) {
                $expect = [
                    ($y + $x) % 2 == 0, $y % 2 == 0, $x % 3 == 0, ($y + $x) % 3 == 0,
                    ((int) floor($y / 2) + (int) floor($x / 3)) % 2 == 0, (($y * $x) % 2) + (($y * $x) % 3) == 0,
                    ((($y * $x) % 2) + (($y * $x) % 3)) % 2 == 0, ((($y * $x) % 3) + (($y + $x) % 2)) % 2 == 0,
                ];
                foreach ($expect as $mask => $want) {
                    $this->assertSame($want, QrLayout::maskApplies($mask, $x, $y), "mask {$mask} at {$x},{$y}");
                }
            }
        }
    }

    public function test_every_mask_reads_back(): void
    {
        for ($m = 0; $m < 8; $m++) {
            $q = QrEncoder::encode('MASK ' . $m, 'Q', null, $m);
            $this->assertSame($m, $q->mask);
            $this->assertSame(['MASK ' . $m, $m], [QrMatrixDecoder::decode($q->matrix)['text'], QrMatrixDecoder::decode($q->matrix)['mask']]);
        }
    }

    public function test_the_fixed_patterns_are_where_the_standard_puts_them(): void
    {
        $m = QrEncoder::encode('A', 'L')->matrix;   // version 1, 21 x 21
        foreach ([[0, 0], [20, 0], [0, 20]] as [$ox, $oy]) {
            $ox = $ox === 20 ? 14 : $ox;
            $oy = $oy === 20 ? 14 : $oy;
            for ($d = 0; $d < 7; $d++) {
                foreach ([[$d, 0], [$d, 6], [0, $d], [6, $d]] as [$dx, $dy]) {
                    $this->assertTrue($m->get($ox + $dx, $oy + $dy), 'finder outline');
                }
            }
            $this->assertFalse($m->get($ox + 1, $oy + 1), 'finder light ring');
            $this->assertTrue($m->get($ox + 3, $oy + 3), 'finder centre');
        }
        $this->assertTrue($m->get(8, 13), 'the always-dark square');
        for ($i = 8; $i < 13; $i++) {
            $this->assertSame($i % 2 === 0, $m->get($i, 6), 'timing row');
            $this->assertSame($i % 2 === 0, $m->get(6, $i), 'timing column');
        }
    }

    public function test_format_information_is_the_standards(): void
    {
        // the standard's format-information table, mask 0 of each level
        $this->assertSame(0b111011111000100, QrLayout::formatWord('L', 0));
        $this->assertSame(0b101010000010010, QrLayout::formatWord('M', 0));
        $this->assertSame(0b011010101011111, QrLayout::formatWord('Q', 0));
        $this->assertSame(0b001011010001001, QrLayout::formatWord('H', 0));
    }

    public function test_a_damaged_symbol_is_refused_not_guessed_at(): void
    {
        $q = QrEncoder::encode('ORDER-7', 'M');
        $rows = $q->matrix->rows();
        foreach ([[10, 10], [11, 10], [12, 10], [10, 11], [11, 11]] as [$x, $y]) {
            $rows[$y][$x] = ! $rows[$y][$x];
        }
        $this->expectException(CodeException::class);
        QrMatrixDecoder::decode(new BitMatrix(21, 21, $rows));
    }

    public function test_a_wrong_size_is_refused(): void
    {
        $this->expectException(CodeException::class);
        QrMatrixDecoder::decode(BitMatrix::blank(20, 20));
    }

    public function test_the_svg_path_draws_each_run_of_dark_squares_once(): void
    {
        $m = new BitMatrix(4, 2, [[true, true, false, true], [false, true, true, false]]);
        $svg = SvgRenderer::render($m, ['quiet' => 1, 'unit' => 2]);
        $this->assertStringContainsString('d="M2 2h4v2h-4zM8 2h2v2h-2zM4 4h4v2h-4z"', $svg);
        $this->assertStringContainsString('viewBox="0 0 12 8"', $svg);
    }

    public function test_svg_and_png_output(): void
    {
        $m = QrEncoder::encode('https://example.com/q/ABC', 'M')->matrix;
        $svg = SvgRenderer::render($m, ['fg' => '#112233', 'bg' => null, 'title' => 'A <b> & c']);
        $this->assertStringStartsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' . ($m->width + 8) . ' ' . ($m->height + 8) . '"', $svg);
        $this->assertStringContainsString('fill="#112233"', $svg);
        $this->assertStringNotContainsString('<rect', $svg, 'a transparent background has no rectangle');
        $this->assertStringContainsString('<title>A &lt;b&gt; &amp; c</title>', $svg);
        $this->assertNotNull(simplexml_load_string($svg), 'well-formed');
        $this->assertStringContainsString('<rect width="100%" height="100%" fill="#ffffff"/>', SvgRenderer::render($m));
        $png = PngRenderer::render($m, ['scale' => 3]);
        $this->assertStringStartsWith("\x89PNG", $png);
        [$w, $h] = getimagesizefromstring($png);
        $this->assertSame([($m->width + 8) * 3, ($m->height + 8) * 3], [$w, $h]);
        $this->expectException(CodeException::class);
        SvgRenderer::render($m, ['fg' => 'red; evil']);
    }
}
