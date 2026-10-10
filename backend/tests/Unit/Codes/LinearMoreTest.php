<?php

namespace Tests\Unit\Codes;

use App\Services\Codes\CodeException;
use App\Services\Codes\CodeFactory;
use App\Services\Codes\Linear\Code93;
use App\Services\Codes\Linear\Codabar;
use App\Services\Codes\Linear\Gs1128;
use App\Services\Codes\Linear\LinearCode;
use PHPUnit\Framework\TestCase;

/** Code 93, Codabar and GS1-128. Every symbol below was also read back by an independent decoder (zxing-cpp). */
class LinearMoreTest extends TestCase
{
    private function bits(LinearCode $c): string
    {
        return implode('', array_map(fn ($b) => $b ? '1' : '0', $c->bars->rows()[0]));
    }

    private function refuses(callable $f, string $why = ''): void
    {
        try {
            $f();
            $this->fail('Expected a refusal' . ($why ? " ({$why})" : ''));
        } catch (CodeException $e) {
            $this->assertNotSame('', $e->getMessage());
        }
    }

    public function test_code_93_has_start_stop_two_checks_and_a_final_bar(): void
    {
        $b = $this->bits(Code93::encode('A'));
        $start = '101011110';   // the 111141 start/stop pattern
        $this->assertStringStartsWith($start, $b);
        $this->assertStringEndsWith($start . '1', $b);
        $this->assertSame(9 * 5 + 1, strlen($b), 'start, one character, the two checks, stop and the final bar: 5 x 9 modules and 1');
    }

    public function test_symbols_that_an_independent_decoder_read_are_kept_as_they_were(): void
    {
        $ctl = '';
        for ($c = 1; $c <= 31; $c++) {
            $ctl .= chr($c);
        }
        $this->assertSame('93a9e2c869376243a382b357e36de86bb4fac876', sha1($this->bits(Code93::encode('ABC-123.4 $/+%')) . $this->bits(Code93::encode('a~b|c{d}@[`:;')) . $this->bits(Code93::encode($ctl))));
        $this->assertSame('5ca1f93d9301fd5d519d9dc38718ca304f148f39', sha1($this->bits(Codabar::encode('-$:/.+')) . $this->bits(Codabar::encode('C12345D')) . $this->bits(Codabar::encode('1234-5678'))));
        $this->assertSame('cc87942dbe93fefdaa88fc3a2d964681e3730cb6', sha1($this->bits(Gs1128::encode('(01)09501101530003(17)250331(10)LOT42')) . $this->bits(Gs1128::encode('(10)ABC123(21)SERIAL99(30)12')) . $this->bits(Gs1128::encode('(00)106141411234567897'))));
    }

    public function test_code_93_refuses_what_it_cannot_hold(): void
    {
        $this->refuses(fn () => Code93::encode(''));
        $this->refuses(fn () => Code93::encode("caf\u{e9}"));
    }

    public function test_codabar_wraps_in_a_and_b_unless_given_its_own_start_and_stop(): void
    {
        $this->assertSame('A12345B', Codabar::encode('12345')->text);
        $this->assertSame('C12345D', Codabar::encode('c12345d')->text);
        $this->assertSame('A12B', Codabar::encode('A12B')->text);
        $this->refuses(fn () => Codabar::encode('12a45'), 'a letter in the middle');
        $this->refuses(fn () => Codabar::encode(''));
        $this->refuses(fn () => Codabar::encode('A12'), 'a start without a stop is just digits and a letter');
    }

    public function test_gs1_128_puts_a_separator_after_values_of_variable_length_only(): void
    {
        $this->assertSame('(01)09501101530003(17)250331(10)LOT42', Gs1128::encode('(01)09501101530003(17)250331(10)LOT42')->text);
        $this->assertSame([['ai' => '10', 'value' => 'ABC'], ['ai' => '21', 'value' => 'S1']], Gs1128::parse('(10)ABC(21)S1'));
        // FNC1 first; the fixed-length 01 and 17 need no separator; the variable 10 is last so needs none
        $a = $this->bits(Gs1128::encode('(01)09501101530003(17)250331(10)LOT42'));
        $b = $this->bits(Gs1128::encode('(01)09501101530003(10)LOT42(17)250331'));
        $this->assertNotSame($a, $b);
    }

    public function test_gs1_128_checks_every_value(): void
    {
        foreach ([
            '(01)09501101530004' => 'check digit',
            '(01)0950110153000' => 'length',
            '(01)0950110153000X' => 'digits',
            '(17)251331' => 'month 13',
            '(17)25033' => 'date length',
            '(10)' => 'no value',
            '(10)A B' => 'a space',
            '(10)' . 'ABCDEFGHIJKLMNOPQRSTU' => 'too long',
            '(99999)X' => 'unknown AI',
            '(3103)12' => 'measure length',
            'no brackets' => 'format',
            '' => 'empty',
        ] as $text => $why) {
            $this->refuses(fn () => Gs1128::encode($text), $why);
        }
        $this->assertSame('(17)250300', Gs1128::encode('(17)250300')->text, 'day 00 means the whole month');
    }

    public function test_the_factory_knows_the_new_kinds(): void
    {
        foreach (['code93' => 'HELLO', 'codabar' => '12345', 'gs1128' => '(10)LOT1'] as $kind => $data) {
            $this->assertTrue(CodeFactory::make($kind, $data)->isLinear());
            $this->assertStringContainsString('<svg', CodeFactory::make($kind, $data)->svg());
        }
        $this->assertArrayHasKey('gs1128', CodeFactory::KINDS);
    }
}
