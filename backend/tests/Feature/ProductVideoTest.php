<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\ProductVideoController;
use App\Models\Product;
use App\Services\ServiceVideo;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/** A product's video: a pasted link or an uploaded file, replaced and removed cleanly (an old uploaded file is deleted). Services share the same code. */
class ProductVideoTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Schema::create('products', function ($t) { $t->id(); $t->string('name')->nullable(); $t->string('slug')->nullable(); $t->string('video_url', 500)->nullable(); $t->softDeletes(); $t->timestamps(); });
    }

    private function product(): Product
    {
        return Product::unguarded(fn () => Product::create(['name' => 'Chair']));
    }

    private function controller(): ProductVideoController
    {
        return new ProductVideoController(app(ServiceVideo::class));
    }

    private function req(array $data = [], array $files = []): Request
    {
        return Request::create('/x', 'POST', $data, [], $files);
    }

    public function test_a_product_with_no_video_has_none(): void
    {
        $this->assertNull($this->product()->video);
    }

    public function test_a_pasted_link_becomes_a_safe_embed(): void
    {
        $p = $this->product();
        $res = $this->controller()->store($this->req(['url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ']), $p->id);
        $v = $res->getData(true)['video'];
        $this->assertSame(['embed', 'youtube'], [$v['kind'], $v['provider']]);
        $this->assertStringContainsString('youtube', $v['embed_url']);
        $this->assertSame($v, $p->fresh()->video);
    }

    public function test_a_link_to_some_other_site_is_refused_and_nothing_is_saved(): void
    {
        $p = $this->product();
        try {
            $this->controller()->store($this->req(['url' => 'https://evil.example.com/video.mp4']), $p->id);
            $this->fail('Expected a refusal');
        } catch (ValidationException) {
            $this->assertNull($p->fresh()->video);
        }
    }

    public function test_an_uploaded_file_is_stored_under_products_and_replacing_it_deletes_the_old_file(): void
    {
        $p = $this->product();
        $this->controller()->store($this->req([], ['file' => UploadedFile::fake()->create('a.mp4', 500, 'video/mp4')]), $p->id);
        $first = $p->fresh()->video_url;
        $this->assertStringStartsWith('/storage/products/video/', $first);
        Storage::disk('public')->assertExists(substr($first, 9));
        $this->assertSame('upload', $p->fresh()->video['kind']);

        $this->controller()->store($this->req(['url' => 'https://vimeo.com/76979871']), $p->id);   // replaced by a link
        Storage::disk('public')->assertMissing(substr($first, 9));
        $this->assertSame('vimeo', $p->fresh()->video['provider']);
    }

    public function test_removing_deletes_the_file_and_the_video(): void
    {
        $p = $this->product();
        $this->controller()->store($this->req([], ['file' => UploadedFile::fake()->create('a.webm', 300, 'video/webm')]), $p->id);
        $path = substr($p->fresh()->video_url, 9);
        $this->controller()->destroy($p->id);
        Storage::disk('public')->assertMissing($path);
        $this->assertNull($p->fresh()->video);
    }

    public function test_nothing_to_save_is_a_polite_422(): void
    {
        $this->assertSame(422, $this->controller()->store($this->req(), $this->product()->id)->getStatusCode());
    }

    public function test_the_video_is_part_of_what_a_product_sends_to_the_shop(): void
    {
        $this->assertContains('video', (new \ReflectionClass(Product::class))->getDefaultProperties()['appends']);
    }
}
