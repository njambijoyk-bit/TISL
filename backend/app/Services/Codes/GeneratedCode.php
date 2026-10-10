<?php

namespace App\Services\Codes;

use App\Services\Codes\Linear\LinearCode;
use App\Services\Codes\Render\PngRenderer;
use App\Services\Codes\Render\SvgRenderer;

/** A code that has been made: draw it as SVG or PNG. */
final class GeneratedCode
{
    public function __construct(public readonly string $kind, public readonly BitMatrix|LinearCode $code)
    {
    }

    public function isLinear(): bool
    {
        return $this->code instanceof LinearCode;
    }

    /** @param array<string, mixed> $o see SvgRenderer::render / linear */
    public function svg(array $o = []): string
    {
        return $this->code instanceof LinearCode ? SvgRenderer::linear($this->code, $o) : SvgRenderer::render($this->code, $o + ['quiet' => $this->quiet()]);
    }

    /** @param array<string, mixed> $o see PngRenderer::render / linear */
    public function png(array $o = []): string
    {
        return $this->code instanceof LinearCode ? PngRenderer::linear($this->code, $o) : PngRenderer::render($this->code, $o + ['quiet' => $this->quiet()]);
    }

    /** the blank border in squares: QR needs 4, a Data Matrix 2 */
    private function quiet(): int
    {
        return in_array($this->kind, ['datamatrix', 'gs1datamatrix'], true) ? 2 : 4;
    }

    /** What the code holds, as it was encoded (check digit included). */
    public function text(): ?string
    {
        return $this->code instanceof LinearCode ? $this->code->text : null;
    }
}
