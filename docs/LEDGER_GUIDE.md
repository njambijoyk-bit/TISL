# How money is organised in the books

This guide explains where taxes, withholding, shipping, discounts, promo and referral codes, loyalty points, gift vouchers, customer credit and currencies live in the ledgers, and what every action posts.
Ledger names below are the defaults. The accounts a feature uses are chosen under **Books → Settings → Default ledgers**, so yours may be named differently.

---

## 1. The idea in five lines

1. **A ledger is an account.** Anything that holds or measures money is a ledger inside a **group** (Sales Accounts, Duties & Taxes, Current Liabilities…).
2. **A group says what its ledgers are** (its *behaviour*): ordinary, **tax** (ledgers carry a rate) or **delivery** (ledgers carry a charge). The ledger form shows only the fields that behaviour needs.
3. **Money only moves through vouchers** (Sales Order, Sales, Cash Sale, Credit Note, Receipt, Payment, Journal…). Every voucher balances: total debits = total credits, in the voucher's currency *and* in the base currency.
4. **Registers are detail, never money.** Gift voucher codes, loyalty point lots, withholding certificates and bill references explain a ledger balance; they never replace it.
5. **Every register reconciles to a control ledger**: Books → Reports → **Reconciliation** shows each pair and whether they agree.

---

## 2. The chart at a glance

| Group | Behaviour | What lives here |
|---|---|---|
| **Sales Accounts** | ordinary | Sales, Sales Returns, Discounts contra lines land in expenses (see §6) |
| **Shipping & Delivery** | **delivery** | One ledger per delivery method (e.g. *Courier service*), plus any delivery *cost* ledgers |
| **Duties & Taxes** | **tax** | One subgroup per tax type; one ledger per tax rate; the tax type's balance ledgers |
| **Current Assets** | ordinary | Cash, Bank, M-Pesa, customers (Sundry Debtors), *Withholding Tax Receivable* |
| **Current Liabilities** | ordinary | Suppliers (Sundry Creditors), **Gift Vouchers Liability**, **Loyalty Points Liability**, withholding payable |
| **Indirect Expenses** | ordinary | **Discounts Allowed**, **Rewards & Referral Expense**, Exchange Loss, Withholding Tax Written Off |
| **Indirect Incomes** | ordinary | Exchange Gain, Interest Income, **Gift Voucher Breakage Income**, **Loyalty Points Breakage Income** |

---

## 3. Taxes

### 3.1 Structure

```
Duties & Taxes                         (group, behaviour = tax)
└── VAT                                (a TAX TYPE = a group)
    ├── VAT Account                    (control ledger: the opening balance / brought-forward)
    ├── VAT 16%                        (a TAX RATE = a ledger, rate 16 %)
    └── VAT 8%                         (another rate)
```

* A **tax type** is a group directly under Duties & Taxes. It carries: code, mode (*additive* = added to the price like VAT; *withheld* = held back from a payment), compounding, active flag.
* A **tax rate** is a **ledger**: rate type (percentage / fixed amount / per unit), value, currency (for fixed amounts), valid from / until, classification, calculation base and order, certificate required.
* A change of rate is **a new dated rate ledger**, so old invoices keep the rate they were charged.
* **Output and input tax share the same rate ledger.** Selling credits it, buying debits it, so its balance is *what you owe the authority* (credit) or *can reclaim* (debit).
* The **opening balance** you enter when creating a tax type goes on the type's control ledger (*VAT Account*) and is added to what the tax return shows as brought forward.

### 3.2 What stays configuration (not money)

Districts, tax rules (module / customer type / order bands / priority), exemption certificates and per-item or per-customer exemptions decide **which rate applies**. They point at rates but hold no balances.

### 3.3 Postings

| Event | Dr | Cr |
|---|---|---|
| Sale with 16 % VAT (Sales invoice / Cash Sale) | Customer (or cash / bank) | Sales ledger (net) + **VAT 16 %** |
| Purchase with VAT | Purchase ledger (net) + **VAT 16 %** | Supplier |
| Credit / debit note | the reverse of the original | |
| Exempt or zero-rated line | — (the line still prints, tax 0) | |

### 3.4 Withholding tax (a tax type with mode *withheld*)

A customer who pays you **keeps back** part of the payment; you hold a *receivable* from the tax authority. When *you* pay a supplier you keep part back; you owe the authority a *payable*.

| Event | Dr | Cr |
|---|---|---|
| **Receipt** from a customer with 2 % withheld (gross 1,000) | Bank 980 + **Withholding Tax Receivable** 20 | Customer 1,000 |
| **Payment** to a supplier with 2 % withheld | Supplier 1,000 | Bank 980 + **{Type} Payable** 20 |
| Clear the credit against tax you owe | the tax ledger you owe (e.g. VAT Account) | Withholding Tax Receivable |
| …or a refund arrives | Bank | Withholding Tax Receivable |
| Write off what will not be recovered | Withholding Tax Written Off | Withholding Tax Receivable |

* A withheld **rate is a rate card** (it holds the percentage); the postings go to the type's Receivable / Payable ledgers.
* Each such receipt / payment automatically creates a **withholding certificate** (number, status *pending → issued → received*, document). Cancelling the voucher voids it; a certificate whose credit was already cleared cannot be voided until the clearing journal is cancelled.
* Clearances and write-offs are **Journal vouchers**, listed on the credit with their voucher numbers.

### 3.5 Reports

* **Tax return**: per tax type and rate, sales value and output tax, purchases value and input tax, brought forward, and *owed at the end*.
* **Withholding certificates**: every certificate in a period with status and credit status.

---

## 4. Shipping and delivery

* Group **Shipping & Delivery** (behaviour *delivery*). Each **delivery method is one ledger**: *Courier service*, *Standard delivery*…
* The ledger carries the rate: **percentage of the goods, fixed amount or per unit**, its **currency**, minimum / maximum, free-above threshold, transit days and an optional tax rate.
* A charge is a line on the sale. It is converted into the voucher's currency at that day's rate (e.g. a USD 500 rate on a JPY invoice) and shows the ledger name and the conversion note at the bottom of the invoice.
* Delivery **costs you incur** are ordinary ledgers in the same group with the *expense* side (no rate needed).

| Event | Dr | Cr |
|---|---|---|
| Customer pays delivery on a sale | Customer / cash | **the delivery ledger** (+ its tax rate if set) |
| Free delivery (above the threshold or tier benefit) | — (line shown as *free*) | |
| You pay a courier | Delivery cost ledger | Bank / supplier |

Deleting a delivery method deletes its ledger — or, if anything was ever posted to it, switches it off and keeps it.

---

## 5. Payment methods and cash

A payment method (Cash, M-Pesa, Bank transfer, Card, Cheque, Gift voucher…) **maps to a ledger** (bank / cash / the gift voucher liability). A receipt or a cash sale debits that ledger. Online methods with a gateway (M-Pesa) also record a **payment attempt**; the books are posted only when the payment is confirmed.
A sale can be paid by **several methods at once** (split tenders), including a gift voucher.

---

## 6. Discounts, promo codes and referral codes

### 6.1 Discounts on a sale (tier, customer type, promo code, referral, manual)

* A discount is **not a ledger of its own**. It is a discount on the line: the sales ledger is credited with the **gross** amount and the discount posts as a **contra debit** to the discount ledger (default **Discounts Allowed**; a campaign may name its own).
* Each discounted line records **where the discount came from** (*tier · customer type · promo · referral · manual*) and the code, so any campaign's cost can be reported.
* Order of application at checkout: tier / customer-type % → the new customer's referral discount → a promo code.
* Gift voucher lines are never discounted.

| Event | Dr | Cr |
|---|---|---|
| Sale of 1,000 with 100 promo discount | Customer 900 + **Discounts Allowed** 100 | Sales 1,000 |

### 6.2 Promo codes

A promo code is a **rule** (percentage or fixed amount, currency, minimum order, validity, usage limits). It has **no balance**. Using it creates the discount line above; the code's usage counter is updated when the sale is paid.

### 6.3 Referral codes and the referral programme

Set once under **Referrals → Referral programme**:

| Setting | Effect |
|---|---|
| **The new customer gets** a percentage or fixed discount (with currency, cap, minimum order) | A discount line on their **first sale**, as in §6.1, source *referral* |
| **The referrer earns** loyalty points | When that first sale is **paid**: points are given and their value is booked (§7) |
| **…plus a gift voucher** of an amount / currency | A gift voucher is issued to the referrer (§8), funded from *Rewards & Referral Expense* |

Either reward, or both, or neither (0 = nothing). Other, admin-made codes may carry their own reward. Rewards are given once per referred customer, and are taken back if the paid sale is cancelled.

---

## 7. Loyalty points

Points are **not money**. They are a **quantity**, tracked in **lots**, whose *value* is a liability.

* **Lot** = one earn: points, the **value of one point on that day**, points still unspent, expiry.
* Spending, deducting, reversing and expiring consume lots — the one being reversed first, then those expiring soonest, then the oldest — and release **exactly the value those lots carry**.
* Therefore **Loyalty Points Liability = the sum of the lots' values**, whatever the point value does later.

| Event | Dr | Cr |
|---|---|---|
| Points earned on a paid sale | Rewards & Referral Expense | **Loyalty Points Liability** |
| Sale cancelled → points taken back | Loyalty Points Liability | Rewards & Referral Expense |
| Admin grants points / referral bonus points | Rewards & Referral Expense | Loyalty Points Liability |
| Admin deducts points | Loyalty Points Liability | Rewards & Referral Expense |
| Points **expire** | Loyalty Points Liability | **Loyalty Points Breakage Income** |
| Points redeemed for a **gift voucher** | Loyalty Points Liability (lots' value) | Gift Vouchers Liability (voucher value); any difference to Rewards & Referral Expense |
| Points redeemed for a **goods reward** | Loyalty Points Liability | Rewards & Referral Expense (staff deliver the goods separately) |

Settings (Loyalty Settings): points per 100 spent (base currency), tier multipliers, minimum redemption, expiry months (expiry runs **daily**), gift voucher cap %.
**Redemption rules** each name the **currency** their value is in — the value is money, so a rule must say which currency (there is no silent "base currency" default any more).
Points earned on *gift voucher purchases* are excluded.

---

## 8. Gift vouchers

A gift voucher is **a claim on you for money**. One ledger, **Gift Vouchers Liability**, holds the total; each voucher (code, holder, currency, expiry, balance) is a row in the register that explains it.

| Where the value comes from | Voucher / posting |
|---|---|
| **Sold** at the till (Gift Vouchers tab, "paid now") | Journal: Dr the payment method's ledger, Cr **Gift Vouchers Liability** |
| **Sold** on a Cash Sale or online (customer "My wallet → Buy a voucher") | The sale's own posting: Dr cash, Cr **Gift Vouchers Liability** (never Sales, never taxed, never discounted); the code is issued **when the sale is paid**; cancelling the sale voids an unspent voucher, and is refused once it has been used |
| **Refund of a Credit Note** ("Refund as gift voucher") | Journal: Dr the **customer's account**, Cr Gift Vouchers Liability — so the return costs *Sales Returns*, not marketing. Limited to what the note has left and what the account holds in credit |
| **From the customer's account** | Dr customer account, Cr Gift Vouchers Liability |
| **Loyalty redemption** | Dr Loyalty Points Liability (§7) |
| **Promotion / referral / manual gift** | Dr Rewards & Referral Expense |

| Movement | Dr | Cr |
|---|---|---|
| **Spent** on a sale (a payment tender; partial use allowed; several vouchers per sale) | Gift Vouchers Liability | (the sale's receivable is settled) |
| Sale cancelled → value restored | reverses the tender | |
| **Expires** (daily job) | Gift Vouchers Liability | Gift Voucher Breakage Income |
| Cancelled unspent voucher | Gift Vouchers Liability | the ledger it came from |
| Closed at a different exchange rate than issued | Gift Vouchers Liability / Exchange Loss | Exchange Gain / Gift Vouchers Liability (so a closed voucher carries **nothing**) |

Every movement stores the **base value actually booked**, so Reconciliation is exact even for foreign-currency vouchers.
Customers see their vouchers, points and every movement (linked to the order it came from) under **My wallet**.

---

## 9. Customer credit

There is **no separate customer credit table**. A customer's account is their **ledger** under Sundry Debtors:

* *Debit balance* = they owe you. *Credit balance* = you owe them (overpayment, unallocated receipt, credit note).
* Their **credit limit, terms (days) and interest** are settings on the customer; ageing works on **bill-by-bill references** (invoice = *new reference*, receipt = *against* it, on-account receipt = *advance*).
* Checkout **"pay on account"** raises a Sales invoice to the ledger if the limit allows.
* Interest charged: Dr customer ledger, Cr **Interest Income**. Manual adjustments are Journals against the customer ledger.
* Old "store credit" is now **gift vouchers**; there is no separate store-credit balance.

---

## 10. Currency

* Every voucher is in **one currency** and stores its **exchange rate**; every entry stores both the voucher-currency amount and the **base-currency amount**. All reports use base amounts.
* Rates come from the **dated rate history**; a rate typed on a voucher wins.
* Settling a foreign-currency invoice at a different rate books a **realised gain or loss** (*Exchange Gain / Exchange Loss*).
* Shipping charges, fixed-amount taxes, promo codes, referral rewards, tiers, gift vouchers and redemption rules are each stored **in their own currency** and converted at the voucher's rate — there is no hardcoded currency.

---

## 11. Reconciliation — proving the registers match the ledgers

Books → Reports → **Reconciliation**:

| Check | Books side | Register side |
|---|---|---|
| Trial balance | total debits | total credits |
| **Gift vouchers** | Gift Vouchers Liability | Σ booked base value of vouchers |
| **Loyalty points** | Loyalty Points Liability | Σ lot remaining × value at earn (a **Post correction** button fixes drift from points moved before everything was booked) |
| **Withholding credits** | Withholding Tax Receivable | Σ open credits (an opening balance is shown as *explained*) |
| **Receivables / payables** | Sundry Debtors / Creditors | open bills (differences = advances and non-bill-wise balances) |
| **Stock value** | Stock ledger | Σ of every batch still holding stock × its cost, today (expired stock not yet written off is included). *Explained*: goods **delivered** on notes not yet invoiced (out of the batches, costed when invoiced) less goods **received** on notes not yet billed (in the batches, booked on the purchase). Anything else is a real difference: a price changed after receipt, a debit note posted at another amount, opening stock entered before batches at cost 0, an entry made straight on the Stock ledger |
| **Stock units** | what the shop shows per product and branch | in-date batches. A **Refresh** button sets the shop's numbers from the batches |

Also: **Tax return**, **Withholding certificates**, Trial balance, Profit & loss, Balance sheet, Ledger statement, Receivables / Payables ageing.

---

## 12. Cheat sheet — event → posting

| Event | Debit | Credit |
|---|---|---|
| Cash sale, cash paid | Cash / Bank | Sales, Tax ledgers, Delivery ledger |
| Sale on account | Customer | Sales, Tax ledgers, Delivery ledger |
| Discount on a sale | Discounts Allowed | (reduces what is owed; sales stay at gross) |
| Receipt from customer | Bank (+ Withholding Receivable) | Customer |
| Payment to supplier | Supplier | Bank (+ Withholding Payable) |
| Points earned | Rewards & Referral Expense | Loyalty Points Liability |
| Points expire | Loyalty Points Liability | Loyalty Points Breakage Income |
| Gift voucher sold | Cash / Bank | Gift Vouchers Liability |
| Gift voucher spent | Gift Vouchers Liability | (sale settled) |
| Gift voucher expires | Gift Vouchers Liability | Gift Voucher Breakage Income |
| Credit note refunded as voucher | Customer account | Gift Vouchers Liability |
| Referrer reward (points / voucher) | Rewards & Referral Expense | Loyalty Points Liability / Gift Vouchers Liability |
| Interest on overdue account | Customer | Interest Income |
| Foreign-currency settlement difference | Exchange Loss | Exchange Gain (whichever applies) |

---

## 12b. Account characteristics (what a ledger *is*)

Like Tally, what an account is decides what the voucher does with it. The group sets the behaviour; the ledger form shows the matching fields.

| Group behaviour | Where | Fields on the ledger |
|---|---|---|
| **Sales** | Sales Accounts | **Tax on this account**: taxable (with its tax rate) / zero-rated (with a 0 % rate) / exempt / out of scope |
| **Purchase** | Purchase Accounts | The same tax nature, for input tax |
| **Tax** | Duties & Taxes › tax types | Rate type and value, currency, validity, classification |
| **Delivery** | Shipping & Delivery | Rate, currency, minimum / maximum, free above, transit days, income / expense side |
| **Bank / cash** | Bank Accounts, Cash-in-hand | Bank, account number, branch |
| **Party** | Sundry Debtors / Creditors | Currency; credit terms live on the customer |
| ordinary | everything else | opening balance, currency |

**How a voucher line is taxed:** the account it posts to decides. A product or service names its **sales account** (and a product its **purchase account**) on its *Tax* tab; a line typed by hand picks its account. So one invoice can carry *Batteries → Sales - VAT-able* (16 % charged) and *Solar panel → Sales - exempt* (no tax) and each line posts to its own account and its own tax ledger. A customer holding a blanket exemption is never taxed, and an item exempted on its own is never taxed. If an account has no tax nature set, the older tax rules (module / customer type / district) still apply, so nothing changes until you set one.
The **Tax return** then shows the value of supplies split into standard-rated, zero-rated and exempt, taken from the accounts the lines posted to.

---

## 12c. Stock, batches and cost of goods sold

Stock is valued. Every arrival of stock is a **batch** with its own cost; a batch of a product that tracks expiry also has a batch number and expiry date. Sales take from the batch expiring first (oldest first when nothing expires). The **Stock** ledger holds the value of what is on the shelves; **Cost of Goods Sold** holds what sold goods cost. Both, and the other stock ledgers, are chosen under Books → Settings → Default ledgers — until they are chosen, purchases and sales post as they did before.

| Event | Dr | Cr |
|---|---|---|
| **Purchase** (stocked products) | Stock (the line's net cost) + input tax | Supplier |
| **Purchase paid at once** (cash, bank, M-Pesa) | the same | the cash / bank ledger — **no supplier debt, no bill**; the seller can be a vendor or just typed party details |
| **Opening stock** (go-live) | Stock | Opening Stock Balance |
| **Sale / Cash Sale** of stocked goods | (the sale as usual) **and** Cost of Goods Sold, at the cost of the batches the goods came from | Stock |
| **Sale invoiced from a delivery** | the same cost, taken from what the delivery took out | Stock |
| **Customer return** (Credit Note that puts goods back) | Stock, back into the batch it was sold from, at that batch's cost | Cost of Goods Sold |
| **Expired stock written off** | Stock Loss, at the batch's cost | Stock |
| **Expired stock returned to the supplier** (Debit Note) | Supplier (against the purchase it came in on) | Stock, at the batch's cost |
| Goods received before the invoice (Receipt Note) | nothing yet — stock and its batches arrive; the money is booked on the purchase | |
| **Service, material charged** (a door on a repair) | the customer, with the service — the material sells from stock like any sale, so **Cost of Goods Sold** / Cr Stock at its batch cost | Sales (its own account) |
| **Service, material included** (nail polish in a manicure) | no charge; **Cost of Services**, at the batch cost | Stock |
| **Service, part bought elsewhere** (a side mirror) | the customer for what is charged (Cr its income ledger); and **Job Materials Cost** for what it cost | the supplier owed, or cash / bank it was paid from — as a bill to the supplier when owed |
| **Service, customer's own part** | nothing — noted on the job | |
| **Stock transfer** between branches | nothing — same stock, same company (in transit until received) | |
| **Transfer received short** | Stock Loss, at the batch's cost, for what did not arrive | Stock |
| **Stock count**, shortage | Stock Loss (net of gains on the same count) | Stock |
| **Stock count**, surplus | Stock | Stock Loss |
| **Production run** (ingredients → finished batch) | nothing — stock changes shape, not value; the finished batch costs what the ingredients cost | |
| **Made-to-order item sold** (a recipe used on sale) | the sale as usual; **Cost of Goods Sold** at the cost of the ingredients used | Stock |
| **Materials issued to a job** | Work in Progress | Stock |
| **Materials returned from a job** | Stock | Work in Progress |
| **Job completed** | Cost of Services | Work in Progress |

Notes: a document that only moves stock (Delivery Note, Goods received) posts nothing; the cost is booked by the invoice or purchase made from it. Stock a purchase brought in cannot be edited or cancelled once some of it has been sold or used — return it to the supplier with a Debit Note. Debit notes post at the note's amount while the stock leaves at batch cost; the difference is a reconciliation item. Existing stock entered before batches has cost 0 until its real cost is set (script 23, part E).

---

## 13. What is not in the books (by design) and known limits

* **Rules and campaigns** — tax rules, districts, exemption certificates, promo code rules, tiers, redemption rules, referral settings — are configuration; they decide amounts but hold no balances.
* Goods rewards: the value is released, but the **cost of the goods** is not posted (goods rewards do not draw from stock yet).
* VAT is not charged when a gift voucher is *sold* (it is charged when the voucher is spent).
* The code of a sold gift voucher is shown to the buyer; it is not e-mailed to a recipient yet.
* Still on the legacy tables: delivery manifests, older reports and analytics, the chat assistant, financial notes and inventory purchase orders.

## Items and sales accounts

Tax lives on the **account**, not the item. A sales or purchase account (and any
sub-group ledger under it) cannot be created without a tax treatment: a rate from
the system (a 0 % rate is zero-rated), Exempt, or Out of scope.

Every product, service, hamper and auction must name the sales account it is sold
under, and will not save without one (products may also name a purchase account).
When a voucher is raised each line is taxed by its own account, so one invoice can
carry VAT-able, zero-rated and exempt lines side by side. Hampers derive their
tax from the account they are booked to.

## Auction charges

Auction fees are master data. A group that "behaves as" **Auction charges** holds ledgers such as Buyer's premium,
Entry fee, Deposit, Handling, Storage, Removal, Payment fee and Import/customs. Each ledger says how it is worked out
(% of the winning bid, fixed amount, or amount per day with free days), an optional minimum and maximum, when it is
due (to take part, held as a deposit, on winning, after winning), whether it is refundable, whether new auctions start
with it, and its tax (a fee is usually VAT-able; a refundable deposit is out of scope and sits in a liability group).

Each auction picks its charges from these, switching them on or off and overriding amounts. They are fixed once
bidding starts. When an auction is won, the Sales Order carries the winning bid on the auction's sales account and each
"on winning" charge on its own account with its own tax. Deposits and entry fees are taken before bidding and storage
builds up after winning; those are kept apart from the amount payable.

A charge normally carries its own tax. Setting "Tax on this charge follows → the auction's sales account" makes it taxed
exactly like the item being sold instead (exempt on an exempt auction, VAT-able on a VAT-able one).

### Entry fees and deposits

An auction with an entry fee or deposit switched on makes bidders register first. Registering raises a Sales Order for
those amounts (the entry fee is income, taxed as its account says; the deposit goes to the "Auction Deposits"
liability). When the order is paid it becomes a Cash Sale and the bidder may bid. When the auction is settled the
deposit is released to the bidder's own account (Dr Auction Deposits, Cr the customer) — from there it is refunded or
set against what they owe. Bidders see the winning bid, VAT, each charge and the amount payable, worked out by the
server for the bid shown, before they bid.
