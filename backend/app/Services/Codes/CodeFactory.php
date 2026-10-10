<?php

namespace App\Services\Codes;

use App\Services\Codes\DataMatrix\DmEncoder;
use App\Services\Codes\Pdf417\Pdf417Encoder;
use App\Services\Codes\Linear\Code128;
use App\Services\Codes\Linear\Code39;
use App\Services\Codes\Linear\Code93;
use App\Services\Codes\Linear\Codabar;
use App\Services\Codes\Linear\Gs1128;
use App\Services\Codes\Linear\Ean;
use App\Services\Codes\Linear\Itf;
use App\Services\Codes\Linear\LinearCode;
use App\Services\Codes\Qr\QrEncoder;
use App\Services\Codes\Render\PngRenderer;
use App\Services\Codes\Render\SvgRenderer;

/**
 * One door to every code we can make: `CodeFactory::make('qr', 'https://…')`, `make('ean13', '590123412345')`. Returns something that can be drawn as SVG or PNG. Modules
 * (events, stock labels, menus…) use this and never an encoder directly, so a new kind of code shows up everywhere at once.
 */
final class CodeFactory
{
    /** kind => [label, 2-D?] */
    public const KINDS = [
        'qr' => ['QR code', true],
        'code128' => ['Code 128', false],
        'ean13' => ['EAN-13', false],
        'ean8' => ['EAN-8', false],
        'upca' => ['UPC-A', false],
        'upce' => ['UPC-E', false],
        'code39' => ['Code 39', false],
        'itf' => ['Interleaved 2 of 5', false],
        'itf14' => ['ITF-14', false],
        'code93' => ['Code 93', false],
        'codabar' => ['Codabar', false],
        'gs1128' => ['GS1-128', false],
        'datamatrix' => ['Data Matrix', true],
        'gs1datamatrix' => ['GS1 Data Matrix', true],
        'pdf417' => ['PDF417', true],
    ];

    /**
     * @param  array{level?: string, minVersion?: int, check?: bool, text?: bool, shape?: string, level417?: int, columns?: int}  $o  level: QR error correction (L M Q H); check: add a check character (Code 39, ITF); text: print the digits under a barcode
     */
    public static function make(string $kind, string $data, array $o = []): GeneratedCode
    {
        $text = $o['text'] ?? true;
        $code = match ($kind) {
            'qr' => QrEncoder::encode($data, $o['level'] ?? 'M', $o['minVersion'] ?? null)->matrix,
            'code128' => Code128::encode($data, $text),
            'ean13' => Ean::ean13($data),
            'ean8' => Ean::ean8($data),
            'upca' => Ean::upcA($data),
            'upce' => Ean::upcE($data),
            'code39' => Code39::encode($data, (bool) ($o['check'] ?? false), $text),
            'itf' => Itf::encode($data, (bool) ($o['check'] ?? false), $text),
            'itf14' => Itf::itf14($data, $text),
            'code93' => Code93::encode($data, $text),
            'codabar' => Codabar::encode($data, $text),
            'gs1128' => Gs1128::encode($data, $text),
            'datamatrix' => DmEncoder::encode($data, $o['shape'] ?? 'square'),
            'pdf417' => Pdf417Encoder::encode($data, $o['level417'] ?? null, $o['columns'] ?? null),
            'gs1datamatrix' => DmEncoder::encode(Gs1128::elements($data)['data'], $o['shape'] ?? 'square', true),
            default => throw new CodeException("There is no \"{$kind}\" kind of code."),
        };

        return new GeneratedCode($kind, $code);
    }

    /** The kind a plain number or text should get when nobody chose one: a real GTIN keeps its retail code, anything else is Code 128. */
    public static function suggest(string $data): string
    {
        if (ctype_digit($data) && Linear\Gs1::valid($data)) {
            return match (strlen($data)) {
                13 => 'ean13',
                12 => 'upca',
                8 => 'ean8',
                14 => 'itf14',
                default => 'code128',
            };
        }

        return 'code128';
    }
}
