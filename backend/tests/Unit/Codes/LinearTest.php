<?php

namespace Tests\Unit\Codes;

use App\Services\Codes\CodeException;
use App\Services\Codes\Linear\Code128;
use App\Services\Codes\Linear\Code39;
use App\Services\Codes\Linear\Ean;
use App\Services\Codes\Linear\Gs1;
use App\Services\Codes\Linear\Itf;
use App\Services\Codes\Linear\LinearCode;
use App\Services\Codes\Render\PngRenderer;
use App\Services\Codes\Render\SvgRenderer;
use PHPUnit\Framework\TestCase;

/**
 * Our own barcode encoders. The expected bars below were produced by a different implementation (python-barcode) and every symbol was also read back by an independent
 * decoder (zxing-cpp): see tests/Tools/crosscheck.
 */
class LinearTest extends TestCase
{
    private function bits(LinearCode $c): string
    {
        return implode('', array_map(fn ($b) => $b ? '1' : '0', $c->bars->rows()[0]));
    }

    public function test_ean_and_upc_bars_are_the_standards(): void
    {
        $this->assertSame('10100010110100111011001100100110111101001110101010110011011011001000010101110010011101000100101', $this->bits(Ean::ean13('590123412345')));
        $this->assertSame('10100011010100111010111101111010001001011001101010100001010000101000010111010010000101100110101', $this->bits(Ean::ean13('400638133393')));
        $this->assertSame('1010110001011000100110010010011010101000010101110010011101000100101', $this->bits(Ean::ean8('5512345')));
        $this->assertSame('10100011010111101010111100011010001101000110101010110110011101001100110101110010011101101100101', $this->bits(Ean::upcA('03600029145')));
        $this->assertSame(95, Ean::ean13('590123412345')->bars->width);
        $this->assertSame('5901234123457', Ean::ean13('590123412345')->text);
    }

    public function test_the_check_digit_is_added_or_checked(): void
    {
        $this->assertSame(7, Gs1::checkDigit('590123412345'));
        $this->assertSame(1, Gs1::checkDigit('400638133393'));
        $this->assertSame(2, Gs1::checkDigit('03600029145'));
        $this->assertTrue(Gs1::valid('5901234123457'));
        $this->assertFalse(Gs1::valid('5901234123456'));
        $this->assertSame('5901234123457', Ean::ean13('5901234123457')->text);
        foreach ([fn () => Ean::ean13('5901234123456'), fn () => Ean::ean13('12345'), fn () => Ean::ean13('59012341234a'), fn () => Ean::ean8('123456'), fn () => Ean::upcA('1234')] as $bad) {
            try {
                $bad();
                $this->fail('Expected a refusal');
            } catch (CodeException) {
                $this->addToAssertionCount(1);
            }
        }
        try {
            Ean::ean13('5901234123456');
        } catch (CodeException $e) {
            $this->assertStringContainsString('should be 7', $e->getMessage());
        }
    }

    public function test_upc_e_squeezes_a_upc_a_that_has_enough_zeros(): void
    {
        $a = Ean::upcE('01234500006');   // 0 12345 00006 -> 123456 (zeros before the last digit)
        $this->assertSame('01234565', $a->text);
        $this->assertSame(51, $a->bars->width);
        $this->assertSame('01234565', Ean::upcE('01234565')->text, 'given the short form with its check digit');
        $this->assertSame('01234565', Ean::upcE('0123456')->text, 'or without');
        $this->assertSame('01234505', Ean::upcE('01200000345')->text);
        $this->assertSame('01234565', Ean::upcE('012345000065')->text, 'or as the full 12-digit UPC-A');
        foreach ([fn () => Ean::upcE('01234565000'), fn () => Ean::upcE('01234560'), fn () => Ean::upcE('2123456')] as $bad) {
            try {
                $bad();
                $this->fail('Expected a refusal');
            } catch (CodeException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function test_code_128_bars_are_the_standards_and_the_cheapest_sets_are_used(): void
    {
        $this->assertSame('110100100001100010100010110010000110010100001100101000010001111010101100111001101100110011101000110100011110101001001111011001010000100001001101100110110011001010000110001' . '1101011', $this->bits(Code128::encode('Hello, World!')));
        $this->assertSame('110100111001011001110010001011000111000101101100001010011011110110100111100101100011101011', $this->bits(Code128::encode('1234567890')), 'ten digits take five symbols in set C');
        $this->assertSame('11010010000101000110001000101100010001000110100111001101100111001011001011100100101100001001000011010000101100100010011001100011101011', $this->bits(Code128::encode('ABC123abc')));
        $this->assertSame([105, 12, 34, 56, 78], Code128::symbols('12345678'));
        $this->assertSame([103, 33, 99, 12, 34], Code128::symbols('A1234'), '"A" then the run of digits in set C ("A" is the same in sets A and B)');
        $this->assertSame([103, 65, 33], Code128::symbols("\x01A"), 'a control character starts in set A');
        $this->assertSame([105, 102, 12, 34], Code128::symbols(Code128::FNC1 . '1234'), 'FNC1 is a symbol of its own');
    }

    public function test_code_128_refuses_what_it_cannot_hold(): void
    {
        foreach (['', "caf\u{e9}", "\u{20ac}5"] as $bad) {
            try {
                Code128::encode($bad);
                $this->fail('Expected a refusal');
            } catch (CodeException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function test_code_39_and_its_check_character(): void
    {
        $c = Code39::encode('code39');
        $this->assertSame('CODE39', $c->text, 'lower case is made capitals');
        $star = '100010111011101';
        $this->assertStringStartsWith($star . '0', $this->bits($c));
        $this->assertStringEndsWith('0' . $star, $this->bits($c));
        $this->assertSame('CODE39W', Code39::encode('CODE39', true)->text);   // mod 43
        $this->assertSame('AB12O', Code39::encode('AB12', true)->text);
        $this->expectException(CodeException::class);
        Code39::encode('lower case & more');
    }

    public function test_interleaved_2_of_5(): void
    {
        $c = Itf::encode('1234');
        $this->assertSame('1234', $c->text);
        $this->assertStringStartsWith('1010', $this->bits($c));
        $this->assertStringEndsWith('11101', $this->bits($c));
        $this->assertSame('0123', Itf::encode('123')->text, 'an odd count gets a leading 0');
        $this->assertSame('12345670', Itf::encode('1234567', true)->text);
        $this->assertSame('12345678901231', Itf::itf14('1234567890123')->text);
        try {
            Itf::itf14('12345678901234');
            $this->fail('Expected a refusal');
        } catch (CodeException $e) {
            $this->assertStringContainsString('should be 1', $e->getMessage());
        }
    }

    public function test_symbols_that_an_independent_decoder_read_are_kept_as_they_were(): void
    {
        // each was read by zxing-cpp when the hashes were taken: every UPC-E check digit in both number systems, every ITF digit, the whole Code 39 set, control characters
        $all = '';
        $hit = [];
        for ($ns = 0; $ns <= 1; $ns++) {
            for ($n = 0; $n < 100000 && count($hit) < ($ns + 1) * 10; $n++) {
                $c = Ean::upcE($ns . str_pad((string) $n, 6, '0', STR_PAD_LEFT));
                $chk = (int) substr($c->text, -1);
                if (! isset($hit["{$ns}{$chk}"])) {
                    $hit["{$ns}{$chk}"] = 1;
                    $all .= $c->text . ':' . $this->bits($c) . ';';
                }
            }
        }
        $this->assertCount(20, $hit);
        $this->assertSame('40000146b8a90d9145939c0b2ffc520e1b681f99', sha1($all));
        $this->assertSame('08da5a2d35daa2a830db13c367ba125827e245a4', sha1($this->bits(Itf::encode('0123456789'))));
        $this->assertSame('8706dfa2734e35fa70bcf2edaafcedfb6a1fd94b', sha1($this->bits(Code39::encode('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%'))));
        $this->assertSame('fea8a9411cd936ba5c5e7a32d1a53ead7495d5e9', sha1($this->bits(Code128::encode("\tAB\r\x1fz"))));
    }

    public function test_svg_for_a_barcode_has_bars_and_the_digits_under_them(): void
    {
        $svg = SvgRenderer::linear(Ean::ean13('590123412345'), ['unit' => 2, 'height' => 50]);
        $this->assertNotNull(simplexml_load_string($svg), 'well-formed');
        $this->assertStringContainsString('<text', $svg);
        $this->assertStringContainsString('>5<', $svg);
        $this->assertStringContainsString('>901234<', $svg);
        $this->assertStringContainsString('>123457<', $svg);
        $this->assertStringContainsString('viewBox="0 0 ' . ((11 + 95 + 7) * 2) . ' ', $svg);
        $this->assertStringNotContainsString('<text', SvgRenderer::linear(Ean::ean13('590123412345'), ['text' => false]));
        $this->assertStringNotContainsString('<text', SvgRenderer::linear(Code128::encode('X', false)));
        $png = PngRenderer::linear(Code128::encode('SKU-1'), ['scale' => 2, 'height' => 40]);
        $this->assertStringStartsWith("\x89PNG", $png);
    }
}
