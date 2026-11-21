<?php

namespace App\Console\Commands;

use App\Casts\EncryptedOrPlain;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

/**
 * Run once after script 271 (HR stage 1): encrypts the bank and identity numbers already saved as plain text. Values already encrypted are left
 * alone, so it is safe to run again. Uses this server's APP_KEY: run it on the server that serves the records.
 */
class HrEncryptFields extends Command
{
    protected $signature = 'hr:encrypt-fields';

    protected $description = 'Encrypt the bank and identity numbers on employee records that are still plain text';

    public const FIELDS = ['bank_account_number', 'bank_account_name', 'id_number', 'kra_pin', 'nssf_number', 'nhif_number'];

    public function handle(): int
    {
        $done = 0;
        $records = 0;
        DB::table('employees')->orderBy('id')->select(array_merge(['id'], self::FIELDS))->chunkById(200, function ($rows) use (&$done, &$records) {
            foreach ($rows as $row) {
                $set = [];
                foreach (self::FIELDS as $f) {
                    $v = $row->{$f};
                    if ($v !== null && trim((string) $v) !== '' && ! EncryptedOrPlain::isEncrypted((string) $v)) {
                        $set[$f] = Crypt::encryptString(trim((string) $v));
                    }
                }
                if ($set) {
                    DB::table('employees')->where('id', $row->id)->update($set);
                    $done += count($set);
                    $records++;
                }
            }
        });
        $this->info("{$done} value(s) on {$records} record(s) encrypted.");

        return self::SUCCESS;
    }
}
