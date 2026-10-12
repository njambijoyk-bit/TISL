<?php

namespace App\Services\Courses;

use App\Models\Courses\Book;
use App\Models\Courses\BookOrder;
use App\Models\Courses\CourseFile;
use App\Models\Courses\Offering;
use App\Services\Books\BooksException;
use App\Services\Books\TradingAccounts;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/** The library of books Courses sells: the catalogue entries, their files, and which books a course asks for or suggests. */
class BookLibrary
{
    public static function installed(): bool
    {
        return Schema::hasTable('course_books') && Schema::hasTable('course_book_orders') && Schema::hasTable('course_offering_books');
    }

    public function __construct(private CourseFiles $files)
    {
    }

    /**
     * @param array{title?: mixed, authors?: mixed, isbn?: mixed, description?: mixed, cover?: mixed, format?: mixed, price?: mixed, ledger_id?: mixed, stock_variant_id?: mixed, download_limit?: mixed, is_active?: mixed, sort_order?: mixed} $d
     */
    public function save(array $d, ?Book $b = null, ?int $by = null): Book
    {
        $title = trim((string) ($d['title'] ?? $b?->title ?? ''));
        if ($title === '' || mb_strlen($title) > 190) {
            throw new BooksException('Give the book a title of up to 190 letters.');
        }
        $format = (string) ($d['format'] ?? $b?->format ?? 'printed');
        if (! isset(Book::FORMATS[$format])) {
            throw new BooksException('Choose printed, digital or both.');
        }
        $price = round((float) ($d['price'] ?? $b?->price ?? 0), 2);
        if ($price <= 0 || $price > 10000000) {
            throw new BooksException('Give the price of the book.');
        }
        $ledger = (int) ($d['ledger_id'] ?? $b?->ledger_id ?? 0);
        if (! $ledger) {
            throw new BooksException('Choose the sales account the book is booked under.');
        }
        if (($problem = TradingAccounts::problem($ledger, 'sales', 'product')) && TradingAccounts::problem($ledger, 'sales', 'service')) {
            throw new BooksException($problem);
        }
        $isbn = array_key_exists('isbn', $d) ? preg_replace('/[^0-9Xx]/', '', (string) $d['isbn']) : $b?->isbn;
        if ($isbn !== null && $isbn !== '' && ! in_array(strlen($isbn), [10, 13], true)) {
            throw new BooksException('An ISBN has 10 or 13 digits.');
        }
        $variant = array_key_exists('stock_variant_id', $d) ? ($d['stock_variant_id'] ? (int) $d['stock_variant_id'] : null) : $b?->stock_variant_id;
        if ($variant && ! DB::table('product_variants')->where('id', $variant)->exists()) {
            throw new BooksException('That stock item does not exist.');
        }
        $limit = array_key_exists('download_limit', $d) ? (int) $d['download_limit'] : (int) ($b?->download_limit ?? 5);
        if ($limit < 0 || $limit > 100) {
            throw new BooksException('A buyer may download between 0 (no limit) and 100 times.');
        }
        $row = ['title' => $title, 'format' => $format, 'price' => $price, 'ledger_id' => $ledger, 'stock_variant_id' => $variant, 'download_limit' => $limit, 'isbn' => $isbn === '' ? null : $isbn];
        foreach (['authors' => 200, 'description' => 5000, 'cover' => 255] as $k => $max) {
            if (array_key_exists($k, $d)) {
                $v = trim((string) $d[$k]);
                $row[$k] = $v === '' ? null : mb_substr($v, 0, $max);
            }
        }
        if (array_key_exists('is_active', $d)) {
            $row['is_active'] = (bool) $d['is_active'];
        }
        if (array_key_exists('sort_order', $d)) {
            $row['sort_order'] = (int) $d['sort_order'];
        }
        if ($b && $format === 'printed' && $b->file_id) {
            throw new BooksException('Remove the digital file first, or choose digital or both.');
        }
        if (! $b) {
            $row['slug'] = $this->slug($title);
            $row['created_by'] = $by;
        }
        $b ??= new Book(['is_active' => true]);
        $b->fill($row)->save();

        return $b->fresh();
    }

    private function slug(string $title): string
    {
        $base = Str::slug($title) ?: 'book';
        $slug = $base;
        for ($i = 2; Book::where('slug', $slug)->exists(); $i++) {
            $slug = "{$base}-{$i}";
        }

        return $slug;
    }

    /** Put the digital file or the free sample on a book (replacing the old one). @param string $which file|sample */
    public function attach(Book $b, string $which, UploadedFile $upload, ?int $by = null): Book
    {
        if (! in_array($which, ['file', 'sample'], true)) {
            throw new BooksException('Choose the file or the sample.');
        }
        if ($which === 'file' && ! $b->hasDigital()) {
            throw new BooksException('Make the book digital (or both) before adding its file.');
        }
        $col = $which === 'file' ? 'file_id' : 'sample_file_id';
        $old = $b->{$col} ? CourseFile::find($b->{$col}) : null;
        $new = $this->files->store($upload, null, $by);
        $b->update([$col => $new->id]);
        if ($old) {
            $this->discard($old);
        }

        return $b->fresh();
    }

    public function detach(Book $b, string $which): Book
    {
        $col = $which === 'file' ? 'file_id' : 'sample_file_id';
        $old = $b->{$col} ? CourseFile::find($b->{$col}) : null;
        $b->update([$col => null]);
        if ($old) {
            $this->discard($old);
        }

        return $b->fresh();
    }

    private function discard(CourseFile $f): void
    {
        try {
            $this->files->remove($f);
        } catch (BooksException) {
            // still used by a lesson: leave the file alone
        }
    }

    /** A book that has been sold is switched off, not deleted. */
    public function delete(Book $b): void
    {
        if (BookOrder::where('book_id', $b->id)->exists()) {
            throw new BooksException('This book has been sold: switch it off instead.');
        }
        DB::table('course_offering_books')->where('book_id', $b->id)->delete();
        foreach ([$b->file_id, $b->sample_file_id] as $id) {
            if ($id && ($f = CourseFile::find($id))) {
                $this->discard($f);
            }
        }
        $b->delete();
    }

    /** The books a course asks for or suggests. @param array<int, array{book_id: int, relation: string}> $rows */
    public function setForOffering(Offering $o, array $rows): void
    {
        $clean = [];
        foreach ($rows as $r) {
            $id = (int) ($r['book_id'] ?? 0);
            $rel = (string) ($r['relation'] ?? 'recommended');
            if (! in_array($rel, ['required', 'recommended'], true)) {
                throw new BooksException('Say whether each book is required or recommended.');
            }
            if (! Book::whereKey($id)->exists()) {
                throw new BooksException('One of the books does not exist.');
            }
            $clean[$id] = $rel;
        }
        DB::transaction(function () use ($o, $clean) {
            DB::table('course_offering_books')->where('offering_id', $o->id)->delete();
            foreach ($clean as $id => $rel) {
                DB::table('course_offering_books')->insert(['offering_id' => $o->id, 'book_id' => $id, 'relation' => $rel, 'created_at' => now(), 'updated_at' => now()]);
            }
        });
    }

    /** @return array<string, mixed> */
    public function row(Book $b, bool $staff = false): array
    {
        $out = ['id' => $b->id, 'slug' => $b->slug, 'title' => $b->title, 'authors' => $b->authors, 'isbn' => $b->isbn, 'description' => $b->description, 'cover' => $b->cover, 'format' => $b->format, 'format_label' => Book::FORMATS[$b->format] ?? $b->format,
            'price' => (float) $b->price, 'has_sample' => (bool) $b->sample_file_id, 'is_active' => $b->is_active];
        if ($staff) {
            $out += ['ledger_id' => $b->ledger_id, 'stock_variant_id' => $b->stock_variant_id, 'file' => $b->file_id ? $this->files->row(CourseFile::findOrFail($b->file_id)) : null, 'sample' => $b->sample_file_id ? $this->files->row(CourseFile::findOrFail($b->sample_file_id)) : null,
                'download_limit' => $b->download_limit, 'sort_order' => $b->sort_order, 'stock_item' => $b->stock_variant_id ? DB::table('product_variants as v')->join('products as p', 'p.id', '=', 'v.product_id')->where('v.id', $b->stock_variant_id)->value('p.name') : null,
                'sold' => (int) BookOrder::where('book_id', $b->id)->whereIn('status', ['paid', 'fulfilled'])->sum('quantity')];
        }

        return $out;
    }

    /** @return array<int, array<string, mixed>> the books of an offering for its page */
    public function forOffering(int $offeringId): array
    {
        if (! self::installed()) {
            return [];
        }
        $rel = DB::table('course_offering_books')->where('offering_id', $offeringId)->pluck('relation', 'book_id');

        return Book::whereIn('id', $rel->keys())->where('is_active', true)->get()->map(fn (Book $b) => $this->row($b) + ['relation' => $rel[$b->id]])->sortBy(fn ($r) => [$r['relation'] === 'required' ? 0 : 1, $r['title']])->values()->all();
    }
}
