<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/** Headers every response carries, and the ones only JSON answers and sign-in answers get. */
class SecurityHeadersTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Route::get('/api/test-file', fn () => response('%PDF-1.4 fake', 200, ['Content-Type' => 'application/pdf']));
        Route::get('/api/test-cached', fn () => response()->json(['ok' => true], 200, ['Cache-Control' => 'public, max-age=60']));
        Route::get('/api/auth/test-token', fn () => response()->json(['token' => 'x']));
        Route::get('/api/admin/security/test', fn () => response()->json(['x' => 1]));
        Route::get('/api/test-own-headers', fn () => response()->json(['ok' => true], 200, ['Referrer-Policy' => 'same-origin', 'X-Frame-Options' => 'SAMEORIGIN']));
        Route::get('/api/test-boom', fn () => throw new \RuntimeException('boom'));
    }

    public function test_every_answer_is_not_sniffed_has_no_referrer_and_no_camera_for_this_origin(): void
    {
        $r = $this->getJson('/api/ping');
        $this->assertSame('nosniff', $r->headers->get('X-Content-Type-Options'));
        $this->assertSame('no-referrer', $r->headers->get('Referrer-Policy'));
        $this->assertSame('camera=(), microphone=(), geolocation=(), payment=()', $r->headers->get('Permissions-Policy'));
    }

    public function test_json_may_not_be_framed_and_may_not_load_anything(): void
    {
        $r = $this->getJson('/api/ping');
        $this->assertSame("default-src 'none'; frame-ancestors 'none'", $r->headers->get('Content-Security-Policy'));
        $this->assertSame('DENY', $r->headers->get('X-Frame-Options'));
    }

    public function test_a_file_the_api_hands_out_can_still_be_shown_in_a_frame_but_is_not_sniffed(): void
    {
        $r = $this->get('/api/test-file');
        $this->assertNull($r->headers->get('X-Frame-Options'));
        $this->assertNull($r->headers->get('Content-Security-Policy'));
        $this->assertSame('nosniff', $r->headers->get('X-Content-Type-Options'));
    }

    public function test_hsts_is_sent_over_https_only(): void
    {
        $this->assertNull($this->getJson('/api/ping')->headers->get('Strict-Transport-Security'));
        $secure = $this->getJson('https://localhost/api/ping');
        $this->assertSame('max-age=31536000; includeSubDomains', $secure->headers->get('Strict-Transport-Security'));
    }

    public function test_hsts_can_be_switched_off_and_so_can_the_lot(): void
    {
        config(['security.headers.hsts' => false]);
        $this->assertNull($this->getJson('https://localhost/api/ping')->headers->get('Strict-Transport-Security'));
        config(['security.headers.enabled' => false]);
        $r = $this->getJson('/api/ping');
        $this->assertNull($r->headers->get('X-Content-Type-Options'));
        $this->assertNull($r->headers->get('Content-Security-Policy'));
    }

    public function test_sign_in_and_security_answers_are_never_stored(): void
    {
        foreach (['/api/auth/test-token', '/api/admin/security/test'] as $url) {
            $this->assertStringContainsString('no-store', (string) $this->getJson($url)->headers->get('Cache-Control'), $url);
        }
        $this->assertStringNotContainsString('no-store', (string) $this->getJson('/api/ping')->headers->get('Cache-Control'), 'other answers are left alone');
    }

    public function test_a_header_the_controller_set_is_not_overwritten(): void
    {
        $this->assertStringContainsString('public', (string) $this->getJson('/api/test-cached')->headers->get('Cache-Control'));
    }

    public function test_a_security_header_the_controller_chose_is_kept(): void
    {
        $r = $this->getJson('/api/test-own-headers');
        $this->assertSame('same-origin', $r->headers->get('Referrer-Policy'));
        $this->assertSame('SAMEORIGIN', $r->headers->get('X-Frame-Options'));
        $this->assertSame('nosniff', $r->headers->get('X-Content-Type-Options'), 'the rest are still added');
    }

    public function test_errors_carry_the_headers_too(): void
    {
        $missing = $this->getJson('/api/nothing-here');
        $missing->assertStatus(404);
        $this->assertSame('nosniff', $missing->headers->get('X-Content-Type-Options'));
        $bad = $this->postJson('/api/auth/login', []);
        $bad->assertStatus(422);
        $this->assertSame('nosniff', $bad->headers->get('X-Content-Type-Options'));
        $this->assertStringContainsString('no-store', (string) $bad->headers->get('Cache-Control'));
        $boom = $this->getJson('/api/test-boom');
        $boom->assertStatus(500);
        $this->assertSame('nosniff', $boom->headers->get('X-Content-Type-Options'));
    }
}
