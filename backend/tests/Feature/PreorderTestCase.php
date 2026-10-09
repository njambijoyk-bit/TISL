<?php

namespace Tests\Feature;

use App\Services\Licensing\LicenseManager;
use App\Services\Location\VariantStockService;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** The in-memory tables the preorder tests share (the repo builds its database from SQL scripts), with the licence on and stock caches left alone. */
abstract class PreorderTestCase extends TestCase
{
    use Concerns\CreatesPreorderTables;

    protected function setUp(): void
    {
        parent::setUp();
        $this->mock(LicenseManager::class, fn ($m) => $m->shouldReceive('isActive')->andReturn(true));
        $this->partialMock(VariantStockService::class, fn ($m) => $m->shouldReceive('recomputeCaches')->andReturnNull());
        config(['cache.default' => 'array']);
    }
}
