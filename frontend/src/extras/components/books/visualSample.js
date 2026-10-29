/** Made-up figures that show what the visual reports look like. They are never real data: the page uses them only when Extras is not licensed. */
const months = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
const income = [410, 380, 450, 520, 490, 610, 580, 640].map((x) => x * 1000);
const expenses = [330, 350, 360, 400, 420, 430, 450, 470].map((x) => x * 1000);

const days = [];
for (let i = 0; i < 365; i++) {
  const d = new Date(Date.UTC(2025, 6, 1 + i));
  const wk = d.getUTCDay();
  const n = wk === 0 ? 0 : Math.round(((Math.sin(i / 9) + 1.4) * (wk === 6 ? 2 : 4)) % 9);
  if (n) days.push({ date: d.toISOString().slice(0, 10), count: n, amount: n * 18500 });
}
let bal = 820000;

export const SAMPLE = {
  money: {
    bucket: 'month', accounts: [{ name: 'Main bank', in: 2400000, out: 1900000, net: 500000, closing: 1250000 }, { name: 'M-Pesa till', in: 1100000, out: 940000, net: 160000, closing: 310000 }, { name: 'Cash in hand', in: 380000, out: 350000, net: 30000, closing: 85000 }],
    series: months.map((m, i) => { const inn = 380000 + i * 22000; const out = 330000 + i * 15000; bal += inn - out; return { bucket: m, in: inn, out, balance: bal }; }),
  },
  expenses: {
    donut: [{ name: 'Cost of goods', value: 1850000 }, { name: 'Salaries', value: 920000 }, { name: 'Rent', value: 360000 }, { name: 'Transport', value: 210000 }, { name: 'Marketing', value: 140000 }, { name: 'Everything else', value: 120000 }],
    tree: [
      { name: 'Cost of goods', children: [{ name: 'Stock bought', size: 1500000 }, { name: 'Freight in', size: 350000 }] },
      { name: 'Payroll', children: [{ name: 'Salaries', size: 780000 }, { name: 'Casuals', size: 140000 }] },
      { name: 'Premises', children: [{ name: 'Rent', size: 360000 }, { name: 'Utilities', size: 70000 }] },
      { name: 'Selling', children: [{ name: 'Transport', size: 210000 }, { name: 'Marketing', size: 140000 }] },
    ],
  },
  top_customers: { rows: [['Acme Traders', 620], ['Riverside Hotel', 480], ['Mama Njeri Stores', 355], ['Corner Café', 290], ['Hilltop School', 240], ['Walk-in / cash customers', 205]].map(([name, v]) => ({ name, value: v * 1000, invoices: 12 })) },
  sales_purchases: { months: months.map((m, i) => ({ month: m, sales_cash: 120000 + i * 8000, sales_credit: 290000 + i * 25000, purchases_cash: 60000 + i * 3000, purchases_credit: 210000 + i * 12000 })) },
  composition: { tree: [{ name: 'Current assets', children: [{ name: 'Stock', size: 1450000 }, { name: 'Customers', size: 980000 }, { name: 'Bank', size: 1250000 }, { name: 'Cash', size: 85000 }] }, { name: 'Fixed assets', children: [{ name: 'Vehicles', size: 900000 }, { name: 'Equipment', size: 450000 }] }] },
  outstanding: {
    ageing: [{ bucket: 'Not yet due', receivables: 540000, payables: 380000 }, { bucket: '1–30', receivables: 260000, payables: 120000 }, { bucket: '31–60', receivables: 120000, payables: 40000 }, { bucket: 'Over 60', receivables: 60000, payables: 10000 }],
    bubbles: [{ name: 'Acme Traders', days: 12, amount: 280000, bills: 4 }, { name: 'Riverside Hotel', days: 38, amount: 210000, bills: 3 }, { name: 'Hilltop School', days: 71, amount: 95000, bills: 2 }, { name: 'Corner Café', days: 5, amount: 60000, bills: 5 }, { name: 'Mama Njeri Stores', days: 24, amount: 135000, bills: 6 }],
    build: [{ name: 'Customers owe us', value: 980000 }, { name: 'We owe suppliers', value: -550000 }, { name: 'Net position', value: 430000, total: true }],
  },
  heatmap: { from: '2025-07-01', to: '2026-06-30', days },
  waterfall: { steps: [{ name: 'Direct income', value: 3680000 }, { name: 'Direct costs', value: -1850000 }, { name: 'Gross profit', value: 1830000, total: true }, { name: 'Other income', value: 90000 }, { name: 'Expenses', value: -1200000 }, { name: 'Net profit', value: 720000, total: true }] },
  balance: { assets: 5115000, liabilities: 1300000, equity: 3815000 },
  profit_trend: { months: months.map((m, i) => ({ month: m, income: income[i], expenses: expenses[i], profit: income[i] - expenses[i] })) },
  recon: { rows: [{ name: 'Main bank', locked_to: '2026-05-31', days_behind: 30, unmatched: 0 }, { name: 'M-Pesa till', locked_to: '2026-04-30', days_behind: 61, unmatched: 14 }, { name: 'Savings account', locked_to: null, days_behind: null, unmatched: 0 }] },
};
