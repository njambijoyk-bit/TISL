<?php

namespace Tests\Unit;

use App\Services\Exchange\Wnkjap;
use App\Services\Exchange\WnkjapException;
use PHPUnit\Framework\TestCase;

/** The .wnkjap file: it opens only with its password, any change to it is noticed, and bad files are refused. */
class WnkjapFileTest extends TestCase
{
    private const JSON = '{"format":"wnkjap","version":1,"sections":{"ledgers":[{"id":1,"name":"Cash ünï"}]}}';

    public function test_a_sealed_file_opens_with_its_password(): void
    {
        $file = Wnkjap::seal(self::JSON, 'correct horse battery', 100000);
        $this->assertStringStartsWith('WNKJAP', $file);
        $this->assertStringNotContainsString('Cash', $file);
        $this->assertSame(self::JSON, Wnkjap::open($file, 'correct horse battery'));
    }

    public function test_the_same_books_never_seal_to_the_same_bytes(): void
    {
        $this->assertNotSame(Wnkjap::seal(self::JSON, 'correct horse battery', 100000), Wnkjap::seal(self::JSON, 'correct horse battery', 100000));
    }

    public function test_a_wrong_password_or_a_changed_byte_is_refused_alike(): void
    {
        $file = Wnkjap::seal(self::JSON, 'correct horse battery', 100000);
        foreach ([[$file, 'wrong password!!'], [substr_replace($file, chr(ord($file[30]) ^ 1), 30, 1), 'correct horse battery'], [substr_replace($file, chr(ord($file[60]) ^ 1), 60, 1), 'correct horse battery'],
            [substr_replace($file, chr(ord($file[11]) ^ 1), 11, 1), 'correct horse battery']] as [$bytes, $pw]) {
            try {
                Wnkjap::open($bytes, $pw);
                $this->fail('A file that should not open did.');
            } catch (WnkjapException $e) {
                $this->assertSame('Wrong password, or the file was changed.', $e->getMessage());
            }
        }
    }

    public function test_things_that_are_not_files_are_refused(): void
    {
        $this->expectException(WnkjapException::class);
        Wnkjap::open('not a file at all, just some text that is long enough to pass the size check....', 'whatever1');
    }

    public function test_a_forged_round_count_is_refused_before_any_work_is_done(): void
    {
        $file = Wnkjap::seal(self::JSON, 'correct horse battery', 100000);
        $forged = substr($file, 0, 8) . pack('N', 4000000000) . substr($file, 12);
        $this->expectException(WnkjapException::class);
        Wnkjap::open($forged, 'correct horse battery');
    }

    public function test_a_short_password_is_not_accepted_for_sealing(): void
    {
        $this->expectException(WnkjapException::class);
        Wnkjap::seal(self::JSON, 'short');
    }
}
