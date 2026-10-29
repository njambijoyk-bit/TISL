<?php

namespace Tests\Feature\Concerns;

/**
 * Figures the retired reports gave on the test books, kept as files so the engine can still be held to them (docs/BOOKS_REPORTS_PLAN.md, step 12). They were
 * recorded once from the old code (RECORD_GOLDEN=1) after the owner signed the parity off; the old code is gone, the numbers stay.
 */
trait RecordsGolden
{
    protected function golden(string $file, string $key, ?callable $old = null): array
    {
        $path = dirname(__DIR__, 2) . "/Fixtures/{$file}.json";
        $all = is_file($path) ? json_decode((string) file_get_contents($path), true) : [];
        if ($old !== null && getenv('RECORD_GOLDEN')) {
            $all[$key] = json_decode(json_encode($old(), JSON_PRESERVE_ZERO_FRACTION), true);
            ksort($all);
            file_put_contents($path, json_encode($all, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION) . "\n");
        }
        $this->assertArrayHasKey($key, $all, "no recorded figures for {$key}");

        return $all[$key];
    }
}
