<?php

namespace Tests\Feature;

use App\Services\Notify\ConnectionTester;

/** The email test says what is wrong in plain words and never throws for an ordinary failure. (A real SMTP server is the one thing it can not be tested against here.) */
class NotifyConnectionTesterTest extends NotifyTestCase
{
    private function tester(): ConnectionTester
    {
        return app(ConnectionTester::class);
    }

    public function test_no_address_to_send_the_test_to(): void
    {
        $r = $this->tester()->email(['host' => 'smtp.example.com'], null);
        $this->assertFalse($r['ok']);
        $this->assertStringContainsString('no email address', $r['message']);
    }

    public function test_no_host_yet(): void
    {
        $r = $this->tester()->email(['host' => ''], $this->admin());
        $this->assertFalse($r['ok']);
        $this->assertStringContainsString('mail server', $r['message']);
    }

    public function test_no_sender_address_anywhere(): void
    {
        $r = $this->tester()->email(['host' => 'smtp.example.com', 'username' => 'not-an-email', 'from_address' => ''], $this->admin());
        $this->assertFalse($r['ok']);
        $this->assertStringContainsString('sender address', $r['message']);
    }

    public function test_a_server_that_refuses_the_connection_is_reported_in_a_line(): void
    {
        $r = $this->tester()->email(['host' => '127.0.0.1', 'port' => 1, 'encryption' => 'none', 'from_address' => 'shop@example.com'], $this->admin());
        $this->assertFalse($r['ok']);
        $this->assertStringNotContainsString("\n", $r['message']);
        $this->assertLessThanOrEqual(300, mb_strlen($r['message']));
        $this->assertNotSame('', $r['message']);
    }
}
