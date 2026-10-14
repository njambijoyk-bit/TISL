<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Books\PaymentMethod;
use App\Models\Courses\Book;
use App\Models\Courses\BookOrder;
use App\Models\Courses\CourseFile;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\GatewayPaymentService;
use App\Services\Courses\BookLibrary;
use App\Services\Courses\BookSales;
use App\Services\Courses\CourseFiles;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The books on the storefront: look without signing in, buy and download when signed in. A buyer only ever sees and pays their own orders. */
class CoursesBooksController extends Controller
{
    public function __construct(private BookLibrary $library, private BookSales $sales)
    {
    }

    private function guard(callable $fn)
    {
        try {
            abort_unless(BookLibrary::installed(), 422, 'Books are not set up yet.');

            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function index(Request $request): JsonResponse
    {
        if (! BookLibrary::installed()) {
            return response()->json(['ready' => false, 'books' => []]);
        }
        $q = Book::where('is_active', true)->orderBy('sort_order')->orderBy('title');
        if ($request->filled('format')) {
            $f = (string) $request->query('format');
            $q->where(fn ($w) => $w->where('format', $f)->orWhere('format', 'both'));
        }
        if ($request->filled('q')) {
            $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], trim((string) $request->query('q'))).'%';
            $q->where(fn ($w) => $w->where('title', 'like', $like)->orWhere('authors', 'like', $like)->orWhere('isbn', 'like', $like));
        }

        return response()->json(['ready' => true, 'books' => $q->limit(200)->get()->map(fn (Book $b) => $this->library->row($b))->values()]);
    }

    public function show(string $slug): JsonResponse
    {
        abort_unless(BookLibrary::installed(), 404);
        $b = Book::where('slug', $slug)->where('is_active', true)->firstOrFail();

        return response()->json(['book' => $this->library->row($b) + ['ways' => $this->sales->ways($b), 'download_limit' => $b->download_limit]]);
    }

    /** The free sample: anyone may download it. */
    public function sample(CourseFiles $files, int $id)
    {
        abort_unless(BookLibrary::installed(), 404);
        $b = Book::where('is_active', true)->findOrFail($id);
        $f = $b->sample_file_id ? CourseFile::find($b->sample_file_id) : null;
        abort_unless($f && $files->exists($f), 404);

        return $files->stream($f);
    }

    public function quote(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['quantity' => 'nullable|integer|min:1|max:50']);

        return $this->guard(fn () => response()->json($this->sales->quote(Book::where('is_active', true)->findOrFail($id), (int) ($d['quantity'] ?? 1), $request->user()) + [
            'payment_methods' => PaymentMethod::offeredAtCheckout()->orderBy('sort_order')->get(['id', 'name', 'kind', 'gateway'])->filter(fn ($m) => GatewayPaymentService::isAutomatic($m))->values()]));
    }

    public function buy(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['quantity' => 'nullable|integer|min:1|max:50', 'fulfil' => 'required|string|max:8', 'address' => 'nullable|string|max:500', 'phone' => 'nullable|string|max:40', 'payment_method_id' => 'nullable|integer']);

        return $this->guard(function () use ($request, $id, $d) {
            $o = $this->sales->order(Book::where('is_active', true)->findOrFail($id), $request->user(), $d, null, 'online');
            $pay = null;
            if ($o->status === 'pending' && ! empty($d['payment_method_id'])) {
                $pay = $this->sales->pay($o, ['payment_method_id' => $d['payment_method_id'], 'phone' => $d['phone'] ?? null], $request->user());
            }

            return response()->json(['message' => $pay['message'] ?? 'Your order is held: pay to confirm it.', 'order' => $this->sales->row($o, false), 'attempt' => $pay['attempt'] ?? null, 'redirect_url' => $pay['redirect_url'] ?? null], 201);
        });
    }

    public function mine(Request $request): JsonResponse
    {
        if (! BookLibrary::installed()) {
            return response()->json(['orders' => []]);
        }

        return response()->json(['orders' => BookOrder::where('buyer_user_id', $request->user()->id)->orderByDesc('id')->limit(100)->get()->map(fn (BookOrder $o) => $this->sales->row($o, false))->values()]);
    }

    public function pay(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['payment_method_id' => 'required|integer', 'phone' => 'nullable|string|max:40']);

        return $this->guard(function () use ($request, $id, $d) {
            $o = BookOrder::where('buyer_user_id', $request->user()->id)->findOrFail($id);   // only your own

            return response()->json($this->sales->pay($o, $d, $request->user()) + ['order' => $this->sales->row($o->fresh(), false)]);
        });
    }

    /** A fresh short-lived download address for your own paid digital book. */
    public function link(Request $request, int $id): JsonResponse
    {
        return $this->guard(function () use ($request, $id) {
            $o = BookOrder::where('buyer_user_id', $request->user()->id)->findOrFail($id);
            if ($why = $this->sales->downloadProblem($o, $request->user())) {
                throw new BooksException($why);
            }

            return response()->json(['url' => $this->sales->downloadLink($o, $request->user())]);
        });
    }

    /** The download behind the signed address. It is checked again here, and counted. */
    public function download(Request $request, int $order)
    {
        $o = BookOrder::findOrFail($order);
        $u = User::find((int) $request->query('u'));
        abort_unless($u && $this->sales->downloadProblem($o, $u) === null, 403, 'This download is not available.');
        $f = CourseFile::find(Book::whereKey($o->book_id)->value('file_id'));
        abort_unless($f && app(CourseFiles::class)->exists($f), 404, 'The file is missing.');   // checked before it is counted: a missing file never uses up a download
        $this->sales->recordDownload($o, $u, $request->ip());

        return app(CourseFiles::class)->stream($f);
    }
}
