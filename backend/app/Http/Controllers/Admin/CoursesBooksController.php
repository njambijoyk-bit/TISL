<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Books\PaymentMethod;
use App\Models\Courses\Book;
use App\Models\Courses\BookOrder;
use App\Models\Courses\Offering;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Books\BooksException;
use App\Services\Courses\BookLibrary;
use App\Services\Courses\BookSales;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Courses → books: the library (course managers), selling at the counter, taking payment, delivering and cancelling (those who may enrol), refunds (those who may refund). All money goes through the books. */
class CoursesBooksController extends Controller
{
    public function __construct(private BookLibrary $library, private BookSales $sales, private Authorizer $authz)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            abort_unless(BookLibrary::installed(), 422, 'Run database script 156_courses_books.sql first.');

            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function meta(): JsonResponse
    {
        $u = request()->user();

        return response()->json(['ready' => BookLibrary::installed(), 'formats' => Book::FORMATS, 'statuses' => BookOrder::STATUSES, 'fulfil' => BookOrder::FULFIL,
            'payment_methods' => PaymentMethod::where('is_active', true)->orderBy('sort_order')->get(['id', 'name', 'kind', 'requires_reference']), 'can_manage' => $this->authz->allows($u, 'courses.manage'),
            'can_enrol' => $this->authz->allows($u, 'courses.enrol'), 'can_refund' => $this->authz->allows($u, 'courses.refund')]);
    }

    public function index(): JsonResponse
    {
        if (! BookLibrary::installed()) {
            return response()->json(['ready' => false, 'books' => []]);
        }

        return response()->json(['ready' => true, 'books' => Book::orderBy('sort_order')->orderBy('title')->get()->map(fn (Book $b) => $this->library->row($b, true))->values()]);
    }

    private function validated(Request $request): array
    {
        return $request->validate(['title' => 'sometimes|string|max:190', 'authors' => 'sometimes|nullable|string|max:200', 'isbn' => 'sometimes|nullable|string|max:30', 'description' => 'sometimes|nullable|string|max:5000', 'cover' => 'sometimes|nullable|string|max:255',
            'format' => 'sometimes|string|max:8', 'price' => 'sometimes|numeric', 'ledger_id' => 'sometimes|integer', 'stock_variant_id' => 'sometimes|nullable|integer', 'download_limit' => 'sometimes|integer', 'is_active' => 'sometimes|boolean', 'sort_order' => 'sometimes|integer']);
    }

    public function create(Request $request): JsonResponse
    {
        $d = $this->validated($request);

        return $this->guard(fn () => response()->json(['message' => 'Book saved.', 'book' => $this->library->row($this->library->save($d, null, $request->user()?->id), true)], 201));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $b = Book::findOrFail($id);
        $d = $this->validated($request);

        return $this->guard(fn () => response()->json(['message' => 'Book saved.', 'book' => $this->library->row($this->library->save($d, $b), true)]));
    }

    public function destroy(int $id): JsonResponse
    {
        $b = Book::findOrFail($id);

        return $this->guard(function () use ($b) { $this->library->delete($b); return response()->json(['message' => 'Book removed.']); });
    }

    public function upload(Request $request, int $id, string $which): JsonResponse
    {
        abort_unless(in_array($which, ['file', 'sample'], true), 404);
        $b = Book::findOrFail($id);
        $request->validate(['file' => 'required|file']);

        return $this->guard(fn () => response()->json(['message' => 'File added.', 'book' => $this->library->row($this->library->attach($b, $which, $request->file('file'), $request->user()?->id), true)]));
    }

    public function removeFile(int $id, string $which): JsonResponse
    {
        abort_unless(in_array($which, ['file', 'sample'], true), 404);
        $b = Book::findOrFail($id);

        return $this->guard(fn () => response()->json(['message' => 'File removed.', 'book' => $this->library->row($this->library->detach($b, $which), true)]));
    }

    public function offeringBooks(int $id): JsonResponse
    {
        if (! BookLibrary::installed()) {
            return response()->json(['ready' => false, 'books' => []]);
        }

        return response()->json(['ready' => true, 'books' => $this->library->forOffering(Offering::findOrFail($id)->id)]);
    }

    public function setOfferingBooks(Request $request, int $id): JsonResponse
    {
        $o = Offering::findOrFail($id);
        $d = $request->validate(['books' => 'present|array|max:50', 'books.*.book_id' => 'required|integer', 'books.*.relation' => 'required|string|max:12']);

        return $this->guard(function () use ($o, $d) { $this->library->setForOffering($o, $d['books']); return response()->json(['message' => 'Books saved.', 'books' => $this->library->forOffering($o->id)]); });
    }

    // ── orders ────────────────────────────────────────────────────────────

    public function orders(Request $request): JsonResponse
    {
        if (! BookLibrary::installed()) {
            return response()->json(['ready' => false, 'orders' => []]);
        }
        $q = BookOrder::query()->orderByDesc('id');
        foreach (['book_id', 'status'] as $f) {
            if ($request->filled($f)) {
                $q->where($f, $request->query($f));
            }
        }
        if ($request->filled('q')) {
            $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], trim((string) $request->query('q'))).'%';
            $q->where(fn ($w) => $w->where('number', 'like', $like)->orWhereIn('buyer_user_id', User::where('name', 'like', $like)->orWhere('email', 'like', $like)->select('id')));
        }

        return response()->json(['ready' => true, 'orders' => $q->limit(200)->get()->map(fn (BookOrder $o) => $this->sales->row($o))->values()]);
    }

    public function sell(Request $request, int $id): JsonResponse
    {
        $b = Book::findOrFail($id);
        $d = $request->validate(['buyer_user_id' => 'required|integer', 'quantity' => 'nullable|integer|min:1|max:50', 'fulfil' => 'required|string|max:8', 'address' => 'nullable|string|max:500', 'phone' => 'nullable|string|max:40']);

        return $this->guard(fn () => response()->json(['message' => 'Order made.', 'order' => $this->sales->row($this->sales->order($b, User::findOrFail($d['buyer_user_id']), $d, $request->user(), 'counter'))], 201));
    }

    public function payment(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['tenders' => 'required|array|min:1', 'tenders.*.payment_method_id' => 'required|integer', 'tenders.*.amount' => 'required|numeric|min:0.01', 'tenders.*.reference' => 'nullable|string|max:80']);

        return $this->guard(fn () => response()->json(['message' => 'Payment recorded.', 'order' => $this->sales->row($this->sales->takePayment(BookOrder::findOrFail($id), $d['tenders'], $request->user()))]));
    }

    public function deliver(Request $request, int $id): JsonResponse
    {
        return $this->guard(fn () => response()->json(['message' => 'Marked as delivered.', 'order' => $this->sales->row($this->sales->deliver(BookOrder::findOrFail($id), $request->user()))]));
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['reason' => 'nullable|string|max:300']);

        return $this->guard(fn () => response()->json(['message' => 'Order cancelled.', 'order' => $this->sales->row($this->sales->cancel(BookOrder::findOrFail($id), $d['reason'] ?? null, $request->user()))]));
    }

    public function refund(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['reason' => 'nullable|string|max:300', 'refund_ledger_id' => 'nullable|integer']);

        return $this->guard(fn () => response()->json(['message' => 'Refunded: the credit note is in the books.', 'order' => $this->sales->row($this->sales->refund(BookOrder::findOrFail($id), $request->user(), $d['reason'] ?? null, $d['refund_ledger_id'] ?? null))]));
    }
}
