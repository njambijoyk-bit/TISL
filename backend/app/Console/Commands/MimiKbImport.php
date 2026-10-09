<?php

namespace App\Console\Commands;

use App\Services\Chat\Local\Knowledge;
use App\Services\Chat\Local\KnowledgeImporter;
use Illuminate\Console\Command;

class MimiKbImport extends Command
{
    protected $signature = 'mimi:kb-import {--file= : the HTML file (default resources/mimi/knowledge.html)} {--force : overwrite entries that already exist (they go back to draft)}';

    protected $description = "Load Mimi's knowledge entries from the structured HTML file into the database (script 105 first)";

    public function handle(KnowledgeImporter $importer): int
    {
        $file = $this->option('file') ?: (string) config('mimi.knowledge');
        if (! is_file($file)) {
            $this->error("No such file: {$file}");

            return self::FAILURE;
        }
        $r = $importer->import(Knowledge::fromFile($file), (bool) $this->option('force'));
        $this->info("Created {$r['created']}, updated {$r['updated']}, left alone {$r['skipped']}.");
        foreach ($r['problems'] as $key => $list) {
            $this->warn("Not imported: {$key}");
            foreach ($list as $p) {
                $this->line("   - {$p}");
            }
        }

        return $r['problems'] ? self::FAILURE : self::SUCCESS;
    }
}
