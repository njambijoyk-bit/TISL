<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Books\PaymentMethod;
use App\Models\Location;
use App\Models\Menus\Channel;
use App\Models\Menus\MenuOrder;
use App\Services\Books\BooksException;
use App\Services\Menus\CounterService;
use App\Services\Menus\FloorService;
use App\Services\Menus\MenuOrderView;
use App\Services\Menus\PublicMenu;
use App\Services\Menus\ReceiptService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/** Menus → Till: the cashier's screen. */
class MenusCounterController extends Controller
{
    public function __construct(private CounterService $counter, private MenuOrderView $view, private ReceiptService $receipts, private PublicMenu $menu)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /** What the till needs to start: the menu being sold now, the rules, how to take money, tabs open and orders waiting to be handed over. */
    public function till(Request $request): JsonResponse
    {
        $ch = Channel::where('code', 'counter')->first();
        $loc = $request->integer('location_id') ?: Location::defaultSelling()?->id;
        $menu = $this->menu->build(Carbon::now((string) config('app.timezone', 'Africa/Nairobi')), $loc);
        if ($ch?->menu_ids) {
            $menu['menus'] = array_values(array_filter($menu['menus'], fn ($m) => in_array($m['id'], $ch->menu_ids, true)));
        }
        $b = $ch && $ch->is_active ? $this->counter->board() : ['tabs' => collect(), 'kiosk' => collect(), 'ready' => collect()];

        return response()->json(['on' => (bool) ($ch && $ch->is_active), 'menu' => $menu, 'rules' => $this->counter->rules(), 'services' => CounterService::SERVICES, 'location_id' => $loc,
            'branches' => Location::query()->sellsToCustomers()->ordered()->get(['id', 'name']),
            'payment_methods' => PaymentMethod::where('is_active', true)->orderBy('sort_order')->get(['id', 'name', 'kind', 'requires_reference']),
            'tabs' => $b['tabs']->map(fn ($o) => $this->row($o))->values(), 'kiosk' => $b['kiosk']->map(fn ($o) => $this->row($o))->values(), 'tables' => FloorService::installed() && $loc ? $this->tables($loc) : null, 'ready' => $b['ready']->map(fn ($o) => $this->row($o))->values()]);
    }

    /** The tables at the branch that can take a new tab, for the till to choose from. */
    private function tables(int $loc): array
    {
        return collect(app(FloorService::class)->floor($loc)['areas'])->flatMap(fn ($a) => collect($a['tables'])->map(fn ($t) => ['id' => $t['id'], 'name' => $t['name'], 'area' => $a['name'], 'state' => $t['state'], 'seats' => $t['seats'], 'tab_id' => $t['tab']['id'] ?? null]))->values()->all();
    }

    private function row(MenuOrder $o): array
    {
        $o->loadMissing('lines');

        return $this->view->staff($o) + ['short_no' => $o->short_no, 'session_code' => $o->session_code, 'label' => $o->label, 'table_id' => $o->table_id, 'guests' => $o->guests, 'service' => $o->service, 'service_charge' => (float) $o->service_charge, 'tip' => (float) $o->tip,
            'lines_full' => $o->lines->map(fn ($l) => ['id' => $l->id, 'name' => $l->name, 'quantity' => (float) $l->quantity, 'unit_price' => (float) $l->unit_price, 'options' => array_column($l->options ?? [], 'name'), 'note' => $l->note, 'round' => (int) $l->round])->values()->all()];
    }

    private function rules(): array
    {
        return ['table_id' => 'nullable|integer', 'guests' => 'nullable|integer|min:1|max:200', 'line_ids' => 'nullable|array|max:80', 'line_ids.*' => 'integer', 'location_id' => 'nullable|integer', 'service' => 'nullable|string|in:dine_in,take_out', 'label' => 'nullable|string|max:80', 'tip' => 'nullable|numeric|min:0|max:10000000', 'waive_service' => 'nullable|boolean',
            'items' => 'nullable|array|max:80', 'items.*.dish_id' => 'required|integer', 'items.*.quantity' => 'required|integer|min:1|max:50', 'items.*.serving_id' => 'nullable|integer', 'items.*.picks' => 'nullable|array', 'items.*.picks.*' => 'array', 'items.*.option_ids' => 'nullable|array|max:40', 'items.*.option_ids.*' => 'integer', 'items.*.note' => 'nullable|string|max:200',
            'tenders' => 'nullable|array|max:6', 'tenders.*.payment_method_id' => 'required|integer', 'tenders.*.amount' => 'required|numeric|min:0', 'tenders.*.reference' => 'nullable|string|max:100'];
    }

    public function quote(Request $request): JsonResponse
    {
        $d = $request->validate($this->rules());

        return $this->guard(fn () => response()->json($this->counter->quote($d)));
    }

    public function quoteTab(Request $request, int $id): JsonResponse
    {
        $d = $request->validate($this->rules());

        return $this->guard(fn () => response()->json($this->counter->quoteTab(MenuOrder::findOrFail($id), $d)));
    }

    public function sell(Request $request): JsonResponse
    {
        $d = $request->validate($this->rules());

        return $this->guard(fn () => response()->json(['order' => $this->row($this->counter->sell($d, $request->user())), 'message' => 'Sold.'], 201));
    }

    public function openTab(Request $request): JsonResponse
    {
        $d = $request->validate($this->rules());

        return $this->guard(fn () => response()->json(['order' => $this->row($this->counter->openTab($d, $request->user())), 'message' => 'Tab opened and sent to the kitchen.'], 201));
    }

    public function addToTab(Request $request, int $id): JsonResponse
    {
        $d = $request->validate($this->rules());

        return $this->guard(fn () => response()->json(['order' => $this->row($this->counter->addToTab(MenuOrder::findOrFail($id), $d, $request->user())), 'message' => 'Sent to the kitchen.']));
    }

    public function moveTab(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['table_id' => 'required|integer']);

        return $this->guard(fn () => response()->json(['order' => $this->row($this->counter->moveTab(MenuOrder::findOrFail($id), (int) $d['table_id'])), 'message' => 'Moved.']));
    }

    public function splitTab(Request $request, int $id): JsonResponse
    {
        $d = $request->validate($this->rules());

        return $this->guard(fn () => response()->json(['order' => $this->row($this->counter->splitTab(MenuOrder::findOrFail($id), (array) ($d['line_ids'] ?? []))), 'message' => 'The dishes are on a new bill.']));
    }

    public function voidLine(int $id, int $line): JsonResponse
    {
        return $this->guard(fn () => response()->json(['order' => $this->row($this->counter->voidLine(MenuOrder::findOrFail($id), $line))]));
    }

    public function settleTab(Request $request, int $id): JsonResponse
    {
        $d = $request->validate($this->rules());

        return $this->guard(fn () => response()->json(['order' => $this->row($this->counter->settleTab(MenuOrder::findOrFail($id), $d, $request->user())), 'message' => 'Tab paid.']));
    }

    public function settleKiosk(Request $request, int $id): JsonResponse
    {
        $d = $request->validate($this->rules());

        return $this->guard(fn () => response()->json(['order' => $this->row($this->counter->settleKiosk(MenuOrder::findOrFail($id), $d, $request->user())), 'message' => 'Paid. The kitchen has the order.']));
    }

    public function cancelTab(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['reason' => 'nullable|string|max:300']);

        return $this->guard(fn () => response()->json(['order' => $this->row($this->counter->cancelTab(MenuOrder::findOrFail($id), $d['reason'] ?? null, $request->user()))]));
    }

    public function receipt(Request $request, int $id): JsonResponse
    {
        $o = MenuOrder::findOrFail($id);

        return response()->json($this->receipts->for($o, $request->integer('width', 32)));
    }
}
