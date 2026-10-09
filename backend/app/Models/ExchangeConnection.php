<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Schema;

/** Another company's site this system may fetch an export from. Only the connection is kept (name, address, encrypted key), never any of their books. */
class ExchangeConnection extends Model
{
    protected $fillable = ['name', 'base_url', 'key_enc', 'created_by'];

    protected $hidden = ['key_enc'];

    public static function ready(): bool
    {
        static $ready;

        return $ready ??= Schema::hasTable('exchange_connections');
    }

    public function setKey(string $key): void
    {
        $this->key_enc = Crypt::encryptString($key);
    }

    public function key(): string
    {
        return Crypt::decryptString($this->key_enc);
    }
}
