# Testing the new tax setup, step by step

Use made-up names (prefix **TEST**) so you can delete them afterwards. Nothing here touches posted documents.

## 0. Before you start
- Database scripts `229_tax_control.sql` and `230_tax_resolution.sql` must have been run (Workbench). Without them the Tax control tab and the opt-out box stay hidden.
- Your user needs: `books.tax.view`, `books.tax.control` (owner), `books.tax.override` (for step 7), and tax manage.
- On **Tax & Compliance → Rates** you already have VAT. Two rates there look like leftovers and will confuse the test, so do not use them: **VAT standard KSh 200.00** (a fixed amount, not a percentage) and **VAT standard 0.0001%** (start date shows "undefined"). Use the **VAT standard 16%** rate.

## 1. Settings: Books → Configuration → Tax control
Open the tab (between *Payment methods* and *Period control*). Check each section opens and saves:
1. **Categories and methods** – leave as is. Note "VAT / GST" offers *added*, *included*, *reverse charge*; only *added* and *reverse charge* work today (*included* says "not available yet").
2. **Where taxes are kept** – the group that holds taxes should be *Duties & Taxes*.
3. **Calculation** – leave "A change of the tax base needs a reason" **on**.
4. **Taxes that apply regardless** – leave empty for now (step 8).
Change one setting, save, reload: it should stay, and the change should appear in the log at the bottom.

## 2. Create the test taxes (Tax & Compliance → Tax types → New tax type)
| Name | Code | Category | How applied |
|---|---|---|---|
| TEST Excise | TEXC | Excise duty | Added to the price |
| TEST Import VAT | TRCV | VAT / GST | Reverse charge |

Then **Rates → New rate**:
- TEST Excise, **10%**, charged on *After discounts*.
- Your VAT, a new rate **16% "TEST VAT on price and excise"**, charged on *After discounts and earlier taxes* – a list of earlier taxes appears: **tick TEST Excise only**.
- TEST Import VAT, **16%**, *After discounts*.

## 3. Accounts with more than one tax (Books → Chart of accounts)
Create two sales accounts under a *Sales accounts* group:
- **TEST Sales – spirits**: set *Tax on this account* = **TEST Excise 10%** (the first tax is worked out first). Then open **Other taxes on this account** and add the type **VAT** with the rate **TEST VAT on price and excise**.
- **TEST Sales – plain**: Tax on this account = *VAT standard 16%* only.
Create one purchase account **TEST Purchases – imports**: tax = *TEST Import VAT*. Also create an **input tax ledger** (any asset ledger named *TEST Input VAT*) and set it on the TEST Import VAT type (edit type) so the claim has somewhere to go.

Also check: creating a ledger directly under *Duties & Taxes* is refused with a message pointing to Tax & Compliance.

## 4. Test products
Make two products, e.g. **TEST Whisky** (sales ledger *TEST Sales – spirits*) and **TEST Bread** (same sales ledger – used for the opt-out), price **1,000** each, exclusive of tax.

## 5. Test sale: two taxes
Create a sales invoice (customer any), line **TEST Whisky, qty 1, rate 1,000**.

| Expected | Amount |
|---|---|
| Excise 10% on 1,000 | 100.00 |
| VAT 16% on 1,100 (price + excise) | 176.00 |
| Invoice total | 1,276.00 |

Check: the preview shows two tax lines (not one); the invoice's tax breakdown lists both; after posting, the voucher entries show the excise ledger and the VAT ledger separately; the order breakdown shows no single "16%" beside 276. Repeat with a **10% line discount**: excise 90, VAT 158.40.

## 6. Item opt-out
Open **TEST Bread → Tax tab → "Taxes this product does not carry"**, tick *TEST Excise*, reason "Not excisable", Save. Invoice 1 × TEST Bread at 1,000: **VAT only = 160**, total 1,160 (VAT now on the price alone). Untick, save: back to 276.

## 7. Base override (needs `books.tax.override`)
On the invoice line for TEST Whisky click **Change what the tax is worked out on**, enter **800**, no reason: it must refuse ("Give a reason"). Add reason "Deposit is not taxable": excise 80, VAT 140.80. Save, reopen: the override and reason come back. Remove the permission from a test user: the button disappears. Do the same on **Purchases → New** (button under each product line).

## 8. Taxes that apply regardless
In Tax control → *Taxes that apply regardless* add a 1% levy (create *TEST Levy* type + 1% rate first), choose what it does when a customer is exempt. Invoice any product: levy appears on a line whose account does not list it. Remove the entry afterwards.

## 9. Reverse charge purchase
Purchases → New: supplier any, line on **TEST Purchases – imports** (use *Service or other charge* with that ledger, or a product whose purchase ledger is that account), amount **1,000**.
Expected: the bill total and supplier balance are **1,000** (nothing added). After posting, open the voucher entries: **Dr TEST Input VAT 160 / Cr Import VAT ledger 160**, marked as tax. The tax return report for the period shows the 160 under Import VAT.

## 10. Cart and checkout
On the shop, add TEST Whisky to the cart: the summary shows **two** tax lines and a total of 1,276. Place the order; the order page shows the same.

## 11. Rate form checks
- A combined/"higher of" rate type only appears on taxes that are *added*.
- Edit a rate that has been used on an order: amount and basis are locked.
- Change the 16% rate's basis away from *earlier taxes*: its ticked list is cleared.

## Cleanup
Delete the TEST products, accounts, rates and types (types and rates in use can only be switched off). Void the test vouchers.

## If something looks wrong, note
The screen and step, what you typed, what you expected and what you saw (a screenshot helps). Totals that differ from the tables above are the most useful finding.
