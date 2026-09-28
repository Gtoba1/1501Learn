// Generates the ShopLink Distribution practice dataset that learners download
// from /datasets/shoplink.zip (batch 1) and /datasets/shoplink-batch-2.zip.
//
// Usage: npm run data
//
// Output is deterministic (seeded random), so rerunning it produces the same
// files and course material that quotes row counts stays correct. Some data
// problems are planted on purpose for the staging, testing and data quality
// lessons; they are listed in PLANTED below and in each zip's README.txt.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../public/datasets");

// ---------------------------------------------------------------------------
// Seeded random helpers (mulberry32)
// ---------------------------------------------------------------------------
let seed = 1501;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(items: readonly T[]) => items[Math.floor(rand() * items.length)];
function weighted<T>(items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [item, w] of items) if ((r -= w) < 0) return item;
  return items[items.length - 1][0];
}

const DAY = 86_400_000;
const date = (d: Date) => d.toISOString().slice(0, 10);
const timestamp = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY);
const addSeconds = (d: Date, s: number) => new Date(d.getTime() + s * 1000);
const utc = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------
const WAREHOUSES = [
  { warehouse_id: 1, warehouse_name: "Lagos Ikeja Hub", city: "Ikeja", state: "Lagos", opened_date: "2019-03-01" },
  { warehouse_id: 2, warehouse_name: "Abuja Central", city: "Abuja", state: "FCT", opened_date: "2021-06-14" },
  { warehouse_id: 3, warehouse_name: "Port Harcourt Depot", city: "Port Harcourt", state: "Rivers", opened_date: "2022-02-07" },
  { warehouse_id: 4, warehouse_name: "Kano North", city: "Kano", state: "Kano", opened_date: "2023-09-18" },
  { warehouse_id: 5, warehouse_name: "Ibadan West", city: "Ibadan", state: "Oyo", opened_date: "2024-04-02" },
] as const;

// [city, state, nearest warehouse, weight]
const CITIES = [
  ["Ikeja", "Lagos", 1, 14], ["Lekki", "Lagos", 1, 10], ["Yaba", "Lagos", 1, 8], ["Surulere", "Lagos", 1, 7],
  ["Ikorodu", "Lagos", 1, 4], ["Abeokuta", "Ogun", 1, 4], ["Sango Ota", "Ogun", 1, 3],
  ["Abuja", "FCT", 2, 12], ["Kaduna", "Kaduna", 2, 4], ["Minna", "Niger", 2, 2], ["Jos", "Plateau", 2, 3],
  ["Port Harcourt", "Rivers", 3, 8], ["Warri", "Delta", 3, 3], ["Enugu", "Enugu", 3, 4], ["Onitsha", "Anambra", 3, 4],
  ["Owerri", "Imo", 3, 3], ["Uyo", "Akwa Ibom", 3, 2], ["Benin City", "Edo", 3, 4],
  ["Kano", "Kano", 4, 7], ["Katsina", "Katsina", 4, 2], ["Maiduguri", "Borno", 4, 2], ["Sokoto", "Sokoto", 4, 1],
  ["Ibadan", "Oyo", 5, 7], ["Osogbo", "Osun", 5, 2], ["Akure", "Ondo", 5, 2], ["Ilorin", "Kwara", 5, 3],
] as const;

const SURNAMES = [
  "Adeyemi", "Okafor", "Bello", "Chukwu", "Ibrahim", "Olawale", "Nwosu", "Abubakar", "Eze", "Balogun",
  "Okonkwo", "Yusuf", "Adebayo", "Obi", "Musa", "Oladipo", "Nnamdi", "Danjuma", "Akande", "Uchenna",
  "Salami", "Ogunleye", "Emeka", "Garba", "Afolabi", "Onyekachi", "Lawal", "Ifeanyi", "Suleiman", "Ajayi",
  "Mbah", "Tijani", "Oyelaran", "Chinwe", "Aliyu", "Babatunde", "Ekwueme", "Shehu", "Adewale", "Ikenna",
];
const RESELLER_SUFFIX = ["Electronics", "Gadgets", "Computers", "Phones & Accessories", "Tech Hub", "Digital Store", "Mobile World", "IT Solutions"];
const SCHOOL_FORMS = ["{s} College", "{s} Academy", "{c} Model School", "{s} International School", "Royal {s} Schools", "{c} Polytechnic"];
const BUSINESS_FORMS = ["{s} & Co", "{s} Logistics", "{s} Consulting", "{s} Microfinance Bank", "{s} Pharmacy", "{s} Energy", "{c} Hospitality", "{s} Legal Partners"];

const CATALOGUE = {
  Laptops: {
    brands: { HP: ["ProBook 450 G10", "EliteBook 840 G9", "250 G9", "Pavilion 15", "Victus 16"], Dell: ["Latitude 5440", "Inspiron 15 3520", "Vostro 3530", "XPS 13"], Lenovo: ["ThinkPad E14", "IdeaPad 3", "ThinkBook 15", "ThinkPad T14"], Apple: ["MacBook Air M2", "MacBook Air M3", "MacBook Pro 14"], Asus: ["VivoBook 15", "ExpertBook B1"] },
    cost: [350_000, 2_400_000],
  },
  Phones: {
    brands: { Samsung: ["Galaxy A15", "Galaxy A25", "Galaxy A55", "Galaxy S24"], Tecno: ["Spark 20", "Camon 30", "Pova 6"], Infinix: ["Hot 40", "Note 40", "Smart 8"], Apple: ["iPhone 13", "iPhone 15"], Itel: ["A70", "S24"], Xiaomi: ["Redmi 13C", "Redmi Note 13"] },
    cost: [65_000, 1_500_000],
  },
  Tablets: {
    brands: { Samsung: ["Galaxy Tab A9", "Galaxy Tab S9 FE"], Apple: ["iPad 10th Gen", "iPad Air"], Lenovo: ["Tab M10", "Tab P12"] },
    cost: [150_000, 1_100_000],
  },
  Accessories: {
    brands: { Oraimo: ["FreePods 4", "Power Bank 20000mAh", "Fast Charger 33W", "Smart Watch 2"], Logitech: ["M185 Wireless Mouse", "K120 Keyboard", "H390 Headset", "C270 Webcam"], Anker: ["USB-C Hub 7-in-1", "PowerCore 10000", "HDMI Cable 2m"], HP: ["Laptop Bag 15.6", "X200 Mouse"] },
    cost: [3_000, 85_000],
  },
  Networking: {
    brands: { "TP-Link": ["Archer C6 Router", "TL-SG108 Switch", "Deco M4 Mesh", "EAP225 Access Point"], Cisco: ["CBS250 24-Port Switch", "RV340 Router"], Ubiquiti: ["UniFi U6 Lite", "EdgeRouter X"], MikroTik: ["hAP ac2", "CRS326 Switch"] },
    cost: [15_000, 950_000],
  },
} as const;
type Category = keyof typeof CATALOGUE;

// What each customer type tends to buy, and in what quantities.
const BASKETS: Record<string, { mix: [Category, number][]; qty: Record<Category, [number, number]> }> = {
  reseller: {
    mix: [["Phones", 45], ["Accessories", 30], ["Laptops", 12], ["Tablets", 8], ["Networking", 5]],
    qty: { Phones: [5, 40], Accessories: [20, 150], Laptops: [2, 12], Tablets: [2, 15], Networking: [2, 20] },
  },
  school: {
    mix: [["Laptops", 40], ["Tablets", 30], ["Networking", 18], ["Accessories", 12], ["Phones", 0]],
    qty: { Laptops: [5, 45], Tablets: [10, 60], Networking: [1, 10], Accessories: [10, 80], Phones: [1, 1] },
  },
  business: {
    mix: [["Laptops", 38], ["Phones", 22], ["Networking", 20], ["Accessories", 15], ["Tablets", 5]],
    qty: { Laptops: [1, 15], Phones: [1, 12], Networking: [1, 8], Accessories: [2, 30], Tablets: [1, 6] },
  },
};

const PLANTED = [
  "orders.status: inconsistent casing and stray spaces (for example 'Delivered', ' shipped', 'CANCELLED')",
  "order_lines: 6 rows are exact duplicates of another row",
  "customers.city: about 12 customers have no city",
  "orders.customer_id: 3 orders point to customers that do not exist",
  "order_lines.quantity: 2 lines have a quantity of 0 or less",
  "products.is_active: some inactive products still appear on recent orders",
];

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
type Customer = {
  customer_id: number;
  customer_name: string;
  customer_type: "reseller" | "school" | "business";
  email: string;
  city: string | null;
  state: string;
  created_at: Date;
  updated_at: Date;
  warehouse: number;
  weight: number;
};

const usedNames = new Set<string>();
function customerName(type: Customer["customer_type"], city: string) {
  for (;;) {
    const s = pick(SURNAMES);
    const name =
      type === "reseller"
        ? `${s} ${pick(RESELLER_SUFFIX)}`
        : pick(type === "school" ? SCHOOL_FORMS : BUSINESS_FORMS).replace("{s}", s).replace("{c}", city);
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
}

function emailFor(name: string, id: number) {
  const local = name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, ".").replace(/(^\.|\.$)/g, "");
  return `${local}.${id}@example.com`;
}

function makeCustomer(id: number, from: Date, to: Date): Customer {
  const type = weighted([["reseller", 55], ["school", 20], ["business", 25]] as const);
  const [city, state, warehouse] = weighted(CITIES.map((c) => [c, c[3]] as const));
  const name = customerName(type, city);
  const created = new Date(from.getTime() + rand() * (to.getTime() - from.getTime()));
  const created_at = addSeconds(created, int(8 * 3600, 18 * 3600));
  return {
    customer_id: id,
    customer_name: name,
    customer_type: type,
    email: emailFor(name, id),
    city,
    state,
    created_at,
    updated_at: addSeconds(created_at, int(0, 30) * 86_400),
    warehouse,
    // A few big accounts place most orders, as in any distributor.
    weight: rand() < 0.08 ? int(15, 30) : rand() < 0.3 ? int(4, 8) : 1,
  };
}

const START = utc(2024, 1, 1);
const END = utc(2026, 6, 30);

const customers: Customer[] = [];
for (let id = 1; id <= 400; id++) {
  // Most customers exist before orders start; the rest join steadily after.
  const early = id <= 160;
  customers.push(makeCustomer(id, early ? utc(2022, 6, 1) : START, early ? utc(2023, 12, 20) : utc(2026, 5, 31)));
}
customers.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
customers.forEach((c, i) => {
  c.customer_id = i + 1;
  c.email = emailFor(c.customer_name, c.customer_id);
});
for (const c of pickDistinct(customers, 12)) c.city = null;

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
type Product = {
  product_id: number;
  product_name: string;
  category: Category;
  brand: string;
  unit_cost: number;
  list_price: number;
  is_active: boolean;
};

const products: Product[] = [];
for (const [category, spec] of Object.entries(CATALOGUE) as [Category, (typeof CATALOGUE)[Category]][]) {
  for (const [brand, models] of Object.entries(spec.brands) as [string, readonly string[]][]) {
    for (const model of models) {
      const [lo, hi] = spec.cost;
      const cost = Math.round((lo + (hi - lo) * rand() ** 1.6) / 500) * 500;
      products.push({
        product_id: 0,
        product_name: `${brand} ${model}`,
        category,
        brand,
        unit_cost: cost,
        list_price: Math.round((cost * (1.15 + rand() * 0.2)) / 500) * 500,
        is_active: true,
      });
    }
  }
}
// Pad to 120 with storage/memory variants of popular laptops and phones.
const variants = ["8GB/256GB", "16GB/512GB", "128GB", "256GB"];
for (let i = 0; products.length < 120; i++) {
  const base = products.filter((p) => p.category === "Laptops" || p.category === "Phones")[i % 40];
  const variant = variants[i % variants.length];
  const bump = 1.12 + (i % 3) * 0.1;
  products.push({
    ...base,
    product_name: `${base.product_name} ${variant}`,
    unit_cost: Math.round((base.unit_cost * bump) / 500) * 500,
    list_price: Math.round((base.list_price * bump) / 500) * 500,
  });
}
products.forEach((p, i) => (p.product_id = i + 1));
const inactive = pickDistinct(products, 10);
for (const p of inactive) p.is_active = false;

const productsByCategory = new Map<Category, Product[]>();
for (const p of products) productsByCategory.set(p.category, [...(productsByCategory.get(p.category) ?? []), p]);

// ---------------------------------------------------------------------------
// Orders and order lines
// ---------------------------------------------------------------------------
type Order = {
  order_id: number;
  customer_id: number;
  warehouse_id: number;
  order_date: Date;
  status: string;
  channel: string;
  updated_at: Date;
};
type OrderLine = {
  order_line_id: number;
  order_id: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  discount_pct: number;
};

let nextOrderId = 100_001;
let nextLineId = 1;

function warehouseFor(customer: Customer, day: Date) {
  const open: number[] = WAREHOUSES.filter((w) => new Date(w.opened_date) <= day).map((w) => w.warehouse_id);
  const preferred = open.includes(customer.warehouse) ? customer.warehouse : 1;
  return rand() < 0.88 ? preferred : pick(open);
}

function statusFor(day: Date, asOf: Date) {
  const age = (asOf.getTime() - day.getTime()) / DAY;
  if (age < 4) return weighted([["pending", 55], ["shipped", 40], ["cancelled", 5]] as const);
  if (age < 21) return weighted([["pending", 8], ["shipped", 32], ["delivered", 53], ["cancelled", 7]] as const);
  return weighted([["delivered", 90], ["cancelled", 6.5], ["returned", 3.5]] as const);
}

function statusUpdatedAt(orderedAt: Date, status: string, asOf: Date) {
  const days = { pending: 0, shipped: int(1, 3), delivered: int(2, 7), cancelled: int(0, 2), returned: int(10, 25) }[status] ?? 0;
  const t = addSeconds(orderedAt, days * 86_400 + int(600, 20_000));
  return t > asOf ? asOf : t;
}

function priceOn(product: Product, day: Date) {
  // Naira prices rise over time: roughly 1.2% a month across the period.
  const months = (day.getTime() - START.getTime()) / (30 * DAY);
  return Math.round((product.list_price * (1 + 0.012 * Math.max(0, months))) / 500) * 500;
}

function makeLines(order: Order, customer: Customer): OrderLine[] {
  const basket = BASKETS[customer.customer_type];
  const count = weighted([[1, 18], [2, 26], [3, 24], [4, 16], [5, 10], [6, 6]] as const);
  const lines: OrderLine[] = [];
  const used = new Set<number>();
  for (let i = 0; i < count; i++) {
    const category = weighted(basket.mix.filter(([, w]) => w > 0));
    const candidates = productsByCategory.get(category)!.filter((p) => !used.has(p.product_id));
    const active = candidates.filter((p) => p.is_active);
    const product = pick(rand() < 0.97 && active.length ? active : candidates);
    used.add(product.product_id);
    const [lo, hi] = basket.qty[category];
    const quantity = int(lo, hi);
    const discount = quantity >= hi * 0.7 ? weighted([[5, 40], [10, 35], [15, 25]] as const) : rand() < 0.12 ? 5 : 0;
    lines.push({
      order_line_id: nextLineId++,
      order_id: order.order_id,
      product_id: product.product_id,
      quantity,
      unit_price: priceOn(product, order.order_date),
      discount_pct: discount,
    });
  }
  return lines;
}

function ordersPerDay(day: Date) {
  const months = (day.getTime() - START.getTime()) / (30 * DAY);
  const month = day.getUTCMonth() + 1;
  const season = month === 12 ? 1.45 : month === 9 ? 1.25 : month === 1 ? 0.8 : 1;
  const weekday = day.getUTCDay() === 0 ? 0.35 : day.getUTCDay() === 6 ? 0.7 : 1.08;
  return (6.8 + months * 0.24) * season * weekday;
}

function generateOrders(from: Date, to: Date, asOf: Date, pool: Customer[]) {
  const orders: Order[] = [];
  const lines: OrderLine[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const eligible = pool.filter((c) => c.created_at < day);
    const expected = ordersPerDay(day);
    const n = Math.max(0, Math.round(expected + (rand() - 0.5) * expected * 0.6));
    for (let i = 0; i < n; i++) {
      const customer = weighted(eligible.map((c) => [c, c.weight] as const));
      const orderedAt = addSeconds(day, int(7 * 3600, 21 * 3600));
      const status = statusFor(orderedAt, asOf);
      const order: Order = {
        order_id: nextOrderId++,
        customer_id: customer.customer_id,
        warehouse_id: warehouseFor(customer, day),
        order_date: day,
        status,
        channel: weighted([["web", 45], ["whatsapp", 35], ["sales_rep", 20]] as const),
        updated_at: statusUpdatedAt(orderedAt, status, asOf),
      };
      orders.push(order);
      lines.push(...makeLines(order, customer));
    }
  }
  return { orders, lines };
}

function messyStatus(status: string) {
  return weighted([
    [status, 94],
    [status[0].toUpperCase() + status.slice(1), 3],
    [status.toUpperCase(), 1.5],
    [` ${status}`, 0.8],
    [`${status} `, 0.7],
  ] as const);
}

function pickDistinct<T>(items: T[], n: number): T[] {
  const copy = [...items];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  return out;
}

const BATCH1_AS_OF = utc(2026, 6, 30);
const batch1 = generateOrders(START, END, addSeconds(BATCH1_AS_OF, 23 * 3600), customers);

// Planted problems in batch 1.
for (const o of batch1.orders) o.status = messyStatus(o.status);
for (const [i, o] of pickDistinct(batch1.orders.slice(500, -500), 3).entries()) o.customer_id = 9001 + i;
const zeroLines = pickDistinct(batch1.lines, 2);
zeroLines[0].quantity = 0;
zeroLines[1].quantity = -2;
const recentOrderIds = new Set(batch1.orders.filter((o) => o.order_date >= utc(2026, 3, 1)).map((o) => o.order_id));
for (const [i, line] of pickDistinct(batch1.lines.filter((l) => recentOrderIds.has(l.order_id)), 4).entries()) {
  line.product_id = inactive[i].product_id;
}
const duplicates = pickDistinct(batch1.lines, 6).map((l) => ({ ...l }));
const batch1Lines = [...batch1.lines];
for (const dup of duplicates) {
  const at = batch1Lines.findIndex((l) => l.order_line_id === dup.order_line_id);
  batch1Lines.splice(at + int(1, 40), 0, dup);
}

// ---------------------------------------------------------------------------
// Batch 2: the July 2026 extract
// ---------------------------------------------------------------------------
const BATCH2_AS_OF = addSeconds(utc(2026, 7, 31), 23 * 3600);

const batch2Customers = customers.map((c) => ({ ...c }));
for (const c of pickDistinct(batch2Customers.filter((c) => c.city !== null), 20)) {
  if (rand() < 0.7) {
    const [city, state, warehouse] = weighted(CITIES.filter((x) => x[1] !== c.state).map((x) => [x, x[3]] as const));
    c.city = city;
    c.state = state;
    c.warehouse = warehouse;
  } else {
    c.customer_type = c.customer_type === "reseller" ? "business" : "reseller";
  }
  c.updated_at = addSeconds(utc(2026, 7, int(1, 28)), int(8 * 3600, 18 * 3600));
}
for (let id = 401; id <= 430; id++) {
  const c = makeCustomer(id, utc(2026, 7, 1), utc(2026, 7, 25));
  c.customer_id = id;
  c.email = emailFor(c.customer_name, id);
  // Nothing in an extract can be newer than the extract itself.
  if (c.updated_at > BATCH2_AS_OF) c.updated_at = BATCH2_AS_OF;
  batch2Customers.push(c);
}

const batch2 = generateOrders(utc(2026, 7, 1), utc(2026, 7, 31), BATCH2_AS_OF, batch2Customers);
for (const o of batch2.orders) o.status = messyStatus(o.status);

const openJune = batch1.orders.filter(
  (o) => o.order_date >= utc(2026, 6, 1) && ["pending", "shipped"].includes(o.status.trim().toLowerCase()),
);
const changedJune = pickDistinct(openJune, Math.min(150, openJune.length)).map((o) => {
  const status = weighted([["delivered", 85], ["cancelled", 10], ["returned", 5]] as const);
  return { ...o, status, updated_at: addSeconds(utc(2026, 7, int(1, 20)), int(8 * 3600, 20 * 3600)) };
});

// ---------------------------------------------------------------------------
// Write CSVs and zips
// ---------------------------------------------------------------------------
function csv<T extends object>(rows: T[], columns: (keyof T)[]) {
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = v instanceof Date ? timestamp(v) : String(v);
    return /[",\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\n") + "\n";
}

const customerCsv = (rows: Customer[]) =>
  csv(
    rows.map((c) => ({ ...c, created_at: timestamp(c.created_at), updated_at: timestamp(c.updated_at) })),
    ["customer_id", "customer_name", "customer_type", "email", "city", "state", "created_at", "updated_at"],
  );
const orderCsv = (rows: Order[]) =>
  csv(
    rows.map((o) => ({ ...o, order_date: date(o.order_date), updated_at: timestamp(o.updated_at) })),
    ["order_id", "customer_id", "warehouse_id", "order_date", "status", "channel", "updated_at"],
  );
const lineCsv = (rows: OrderLine[]) =>
  csv(rows, ["order_line_id", "order_id", "product_id", "quantity", "unit_price", "discount_pct"]);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Minimal zip writer (deflate, fixed timestamp so output is reproducible).
function zip(files: { name: string; content: string }[]) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const dosTime = 0;
  const dosDate = ((2026 - 1980) << 9) | (8 << 5) | 1;
  for (const f of files) {
    const data = Buffer.from(f.content, "utf8");
    const compressed = deflateRawSync(data, { level: 9 });
    const name = Buffer.from(f.name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralSize = centrals.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

const batch1Files = [
  { name: "shoplink/customers.csv", content: customerCsv(customers) },
  {
    name: "shoplink/products.csv",
    content: csv(products, ["product_id", "product_name", "category", "brand", "unit_cost", "list_price", "is_active"]),
  },
  {
    name: "shoplink/warehouses.csv",
    content: csv([...WAREHOUSES], ["warehouse_id", "warehouse_name", "city", "state", "opened_date"]),
  },
  { name: "shoplink/orders.csv", content: orderCsv(batch1.orders) },
  { name: "shoplink/order_lines.csv", content: lineCsv(batch1Lines) },
];

const batch2Orders = [...changedJune, ...batch2.orders];
const batch2Files = [
  { name: "shoplink-batch-2/customers.csv", content: customerCsv(batch2Customers) },
  { name: "shoplink-batch-2/orders.csv", content: orderCsv(batch2Orders) },
  { name: "shoplink-batch-2/order_lines.csv", content: lineCsv(batch2.lines) },
];

const readme1 = `ShopLink Distribution practice data, batch 1
===========================================

A fictional Lagos electronics distributor. Orders from 2024-01-01 to 2026-06-30.
Amounts are in naira. Timestamps are UTC, formatted YYYY-MM-DD HH:MM:SS.

customers.csv    ${customers.length} rows    one row per customer account
products.csv     ${products.length} rows    one row per product
warehouses.csv   ${WAREHOUSES.length} rows      one row per warehouse
orders.csv       ${batch1.orders.length} rows   one row per order
order_lines.csv  ${batch1Lines.length} rows  one row per product on an order

Net revenue for a line = quantity * unit_price * (1 - discount_pct / 100).
Cancelled and returned orders are not revenue.

This is realistic data, so it is not perfectly clean. Finding and handling
the problems is part of the course. If you want to check your work, these
were planted on purpose:

${PLANTED.map((p) => `- ${p}`).join("\n")}
`;

const readme2 = `ShopLink Distribution practice data, batch 2
===========================================

A later extract, taken on 2026-07-31. Load it on top of batch 1.

customers.csv    ${batch2Customers.length} rows    the full customer table again: about 20 existing
                              customers changed (moved, or changed type) with a newer
                              updated_at, plus ${batch2Customers.length - customers.length} new customers
orders.csv       ${batch2Orders.length} rows    ${batch2.orders.length} new July orders, plus ${changedJune.length} June orders
                              whose status changed since batch 1 (same order_id,
                              newer updated_at)
order_lines.csv  ${batch2.lines.length} rows   lines for the new July orders only

Order lines never change once written, so only new orders have lines here.
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(path.join(OUT_DIR, "shoplink.zip"), zip([{ name: "shoplink/README.txt", content: readme1 }, ...batch1Files]));
writeFileSync(
  path.join(OUT_DIR, "shoplink-batch-2.zip"),
  zip([{ name: "shoplink-batch-2/README.txt", content: readme2 }, ...batch2Files]),
);

console.log(readme1);
console.log(readme2);
