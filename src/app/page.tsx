"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface ArticleAgg {
  articleId: string;
  articleName: string;
  unit: string;
  quantity: number;
  total: number;
  totalTax: number;
  avgPrice: number;
  lastPrice: number;
}

interface DetailRow {
  articleId: string;
  articleName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface LoadAgg {
  id: number;
  date: string;
  docDate: string;
  docNum: string;
  total: number;
  totalTax: number;
  rows: DetailRow[];
}

interface SupplierAgg {
  supplierId: string;
  supplierName: string;
  loadCount: number;
  total: number;
  totalTax: number;
  articles: ArticleAgg[];
  loads: LoadAgg[];
}

interface Analytics {
  from: string;
  to: string;
  currency: string;
  totals: { loadCount: number; supplierCount: number; articleRowCount: number; total: number; totalTax: number };
  suppliers: SupplierAgg[];
}

interface Supplier {
  id: string;
  name: string;
}

interface Purchase {
  date: string;
  docDate: string;
  docNum: string;
  storeLoadId: number;
  supplierName: string;
  quantity: number;
  unitPrice: number;
  unitPriceTax: number;
  total: number;
  totalTax: number;
}

interface PeriodAgg {
  period: string;
  purchases: number;
  quantity: number;
  total: number;
  totalTax: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
}

interface ArticleHistory {
  article: { id: string; name: string; unit: string };
  from: string;
  to: string;
  summary: {
    purchases: number;
    quantity: number;
    total: number;
    totalTax: number;
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
    lastPrice: number;
    lastDate: string;
  };
  purchases: Purchase[];
  byMonth: PeriodAgg[];
  byYear: PeriodAgg[];
}

interface ArticleRef {
  id: string;
  name: string;
  unit: string;
}

function fmtMoney(n: number): string {
  return n.toLocaleString("bg-BG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function fmtMoneyShort(n: number): string {
  if (n >= 1000) return (n / 1000).toLocaleString("bg-BG", { maximumFractionDigits: 1 }) + "k €";
  return n.toLocaleString("bg-BG", { maximumFractionDigits: 0 }) + " €";
}

function fmtQty(n: number): string {
  return n.toLocaleString("bg-BG", { maximumFractionDigits: 3 });
}

function fmtPrice(n: number): string {
  return n.toLocaleString("bg-BG", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + " €";
}

const MONTH_NAMES = ["яну", "фев", "мар", "апр", "май", "юни", "юли", "авг", "сеп", "окт", "ное", "дек"];

function fmtPeriod(p: string): string {
  if (p.length === 7) {
    const [y, m] = p.split("-");
    return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
  }
  return p;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
}

interface Preset {
  key: string;
  label: string;
  range: () => { from: string; to: string };
}

const PRESETS: Preset[] = [
  { key: "today", label: "Днес", range: () => ({ from: daysAgo(0), to: daysAgo(0) }) },
  { key: "yesterday", label: "Вчера", range: () => ({ from: daysAgo(1), to: daysAgo(1) }) },
  { key: "7d", label: "7 дни", range: () => ({ from: daysAgo(7), to: daysAgo(0) }) },
  { key: "30d", label: "30 дни", range: () => ({ from: daysAgo(30), to: daysAgo(0) }) },
  {
    key: "thisMonth",
    label: "Този месец",
    range: () => {
      const now = new Date();
      return { from: iso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))), to: daysAgo(0) };
    },
  },
  {
    key: "lastMonth",
    label: "Минал месец",
    range: () => {
      const now = new Date();
      return {
        from: iso(new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1))),
        to: iso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 0))),
      };
    },
  },
];

export default function Dashboard() {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(daysAgo(0));
  const [supplierId, setSupplierId] = useState("");
  const [preset, setPreset] = useState("30d");
  const [viewSupplier, setViewSupplier] = useState(""); // instant client-side chip filter
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [articleModal, setArticleModal] = useState<ArticleRef | null>(null);

  useEffect(() => {
    fetch("/api/suppliers")
      .then((r) => r.json())
      .then((d) => setSuppliers(d.suppliers || []))
      .catch(() => {});
  }, []);

  const load = useCallback(async (f: string, t: string, sup: string) => {
    setLoading(true);
    setError("");
    setViewSupplier("");
    try {
      const params = new URLSearchParams({ from: f, to: t });
      if (sup) params.set("supplier", sup);
      const res = await fetch(`/api/analytics?${params}`);
      const d = await res.json();
      if (!res.ok) {
        throw new Error(d.error ? `${d.error}${d.barsyBody ? `\n${d.barsyBody}` : ""}` : `HTTP ${res.status}`);
      }
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка при зареждане");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(daysAgo(30), daysAgo(0), "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPreset = (p: Preset) => {
    const r = p.range();
    setFrom(r.from);
    setTo(r.to);
    setPreset(p.key);
    load(r.from, r.to, supplierId);
  };

  const maxTotal = useMemo(
    () => Math.max(1, ...(data?.suppliers.map((s) => s.total) || [])),
    [data]
  );

  const chipSuppliers = useMemo(() => (data?.suppliers || []).slice(0, 10), [data]);

  const visibleSuppliers = useMemo(() => {
    if (!data) return [];
    if (!viewSupplier) return data.suppliers;
    return data.suppliers.filter((s) => (s.supplierId || s.supplierName) === viewSupplier);
  }, [data, viewSupplier]);

  const shownTotals = useMemo(() => {
    if (!data) return null;
    if (!viewSupplier) return data.totals;
    const t = { loadCount: 0, supplierCount: visibleSuppliers.length, articleRowCount: 0, total: 0, totalTax: 0 };
    for (const s of visibleSuppliers) {
      t.loadCount += s.loadCount;
      t.total += s.total;
      t.totalTax += s.totalTax;
    }
    t.total = Math.round(t.total * 100) / 100;
    t.totalTax = Math.round(t.totalTax * 100) / 100;
    return t;
  }, [data, viewSupplier, visibleSuppliers]);

  return (
    <div className="container">
      <h1>Barsy Analytics — Зареждания</h1>
      <p className="subtitle">СКЛАД → ЗАРЕЖДАНИЯ → ВСИЧКИ · по доставчик и артикул · период по документ дата</p>

      <div className="presets" role="group" aria-label="Бърз период">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            className={`preset ${preset === p.key ? "active" : ""}`}
            onClick={() => applyPreset(p)}
            disabled={loading}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="filters">
        <label>
          От дата
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPreset("");
            }}
          />
        </label>
        <label>
          До дата
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPreset("");
            }}
          />
        </label>
        <label>
          Доставчик
          <select
            value={supplierId}
            onChange={(e) => {
              setSupplierId(e.target.value);
              load(from, to, e.target.value);
            }}
          >
            <option value="">Всички доставчици</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button className="go" onClick={() => load(from, to, supplierId)} disabled={loading}>
          {loading ? "Зареждане…" : "Покажи"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {data && !supplierId && chipSuppliers.length > 1 && (
        <div className="chips" aria-label="Бърз филтър по доставчик">
          <button className={`chip ${viewSupplier === "" ? "active" : ""}`} onClick={() => setViewSupplier("")}>
            Всички
          </button>
          {chipSuppliers.map((s) => {
            const key = s.supplierId || s.supplierName;
            return (
              <button
                key={key}
                className={`chip ${viewSupplier === key ? "active" : ""}`}
                onClick={() => setViewSupplier(viewSupplier === key ? "" : key)}
              >
                {s.supplierName} <span className="chip-sum">{fmtMoneyShort(s.total)}</span>
              </button>
            );
          })}
        </div>
      )}

      {shownTotals && (
        <div className="kpis">
          <div className="kpi">
            <div className="label">Зареждания</div>
            <div className="value">{shownTotals.loadCount}</div>
          </div>
          <div className="kpi">
            <div className="label">Доставчици</div>
            <div className="value">{shownTotals.supplierCount}</div>
          </div>
          <div className="kpi">
            <div className="label">Стойност (без ДДС)</div>
            <div className="value">{fmtMoney(shownTotals.total)}</div>
          </div>
          <div className="kpi">
            <div className="label">Стойност (с ДДС)</div>
            <div className="value">{fmtMoney(shownTotals.totalTax)}</div>
          </div>
        </div>
      )}

      {loading && !data && <div className="loading">Зареждане на данни от Barsy…</div>}

      {data && visibleSuppliers.length === 0 && (
        <div className="empty">Няма зареждания за избрания период.</div>
      )}

      {visibleSuppliers.map((s) => {
        const key = s.supplierId || s.supplierName;
        const solo = viewSupplier === key || !!supplierId || visibleSuppliers.length === 1;
        return (
          <SupplierCard key={`${key}-${solo}`} s={s} maxTotal={maxTotal} defaultOpen={solo} onArticle={setArticleModal} />
        );
      })}

      {articleModal && <ArticleModal article={articleModal} onClose={() => setArticleModal(null)} />}
    </div>
  );
}

function SupplierCard({
  s,
  maxTotal,
  defaultOpen,
  onArticle,
}: {
  s: SupplierAgg;
  maxTotal: number;
  defaultOpen: boolean;
  onArticle: (a: ArticleRef) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState<"articles" | "loads">("articles");

  return (
    <div className="supplier-card">
      <div className="supplier-head" onClick={() => setOpen((o) => !o)}>
        <span className="chev">{open ? "▾" : "▸"}</span>
        <span className="name">{s.supplierName}</span>
        <span className="meta">
          {s.loadCount} {s.loadCount === 1 ? "зареждане" : "зареждания"} · {s.articles.length} артикула
        </span>
        <span className="sum">{fmtMoney(s.total)}</span>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${(s.total / maxTotal) * 100}%` }} />
      </div>
      {open && (
        <div className="supplier-body">
          <div className="tabs">
            <button className={tab === "articles" ? "active" : ""} onClick={() => setTab("articles")}>
              Артикули ({s.articles.length})
            </button>
            <button className={tab === "loads" ? "active" : ""} onClick={() => setTab("loads")}>
              Зареждания ({s.loads.length})
            </button>
          </div>
          {tab === "articles" ? (
            <ArticlesTable articles={s.articles} onArticle={onArticle} />
          ) : (
            <LoadsTable loads={s.loads} onArticle={onArticle} />
          )}
        </div>
      )}
    </div>
  );
}

function ArticlesTable({ articles, onArticle }: { articles: ArticleAgg[]; onArticle: (a: ArticleRef) => void }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Артикул</th>
            <th className="r">Количество</th>
            <th>Мярка</th>
            <th className="r">Средна цена</th>
            <th className="r">Последна цена</th>
            <th className="r">Стойност (без ДДС)</th>
            <th className="r">С ДДС</th>
          </tr>
        </thead>
        <tbody>
          {articles.map((a) => (
            <tr
              key={a.articleId || a.articleName}
              className={a.articleId ? "article-row" : ""}
              onClick={() => a.articleId && onArticle({ id: a.articleId, name: a.articleName, unit: a.unit })}
            >
              <td className={a.articleId ? "article-link" : ""}>{a.articleName || a.articleId}</td>
              <td className="r">{fmtQty(a.quantity)}</td>
              <td>{a.unit}</td>
              <td className="r">{fmtMoney(a.avgPrice)}</td>
              <td className="r">{fmtMoney(a.lastPrice)}</td>
              <td className="r">{fmtMoney(a.total)}</td>
              <td className="r">{fmtMoney(a.totalTax)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoadsTable({ loads, onArticle }: { loads: LoadAgg[]; onArticle: (a: ArticleRef) => void }) {
  const [openId, setOpenId] = useState<number>(0);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Дата</th>
            <th>Док. дата</th>
            <th>Док. №</th>
            <th className="r">Артикули</th>
            <th className="r">Стойност (без ДДС)</th>
            <th className="r">С ДДС</th>
          </tr>
        </thead>
        <tbody>
          {loads.map((l) => (
            <LoadRows
              key={l.id}
              l={l}
              open={openId === l.id}
              toggle={() => setOpenId(openId === l.id ? 0 : l.id)}
              onArticle={onArticle}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

const HISTORY_RANGES = [
  { key: "6m", label: "6 мес", months: 6 },
  { key: "12m", label: "12 мес", months: 12 },
  { key: "24m", label: "24 мес", months: 24 },
  { key: "all", label: "Всичко", months: 0 },
];

function ArticleModal({ article, onClose }: { article: ArticleRef; onClose: () => void }) {
  const [range, setRange] = useState("12m");
  const [tab, setTab] = useState<"months" | "years" | "purchases">("months");
  const [hist, setHist] = useState<ArticleHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const r = HISTORY_RANGES.find((x) => x.key === range)!;
    const from = r.months
      ? (() => {
          const d = new Date();
          d.setMonth(d.getMonth() - r.months);
          return iso(d);
        })()
      : "2024-01-01";
    setLoading(true);
    setError("");
    fetch(`/api/article?id=${article.id}&from=${from}`)
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
        setHist(d);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Грешка");
        setHist(null);
      })
      .finally(() => setLoading(false));
  }, [article.id, range]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const s = hist?.summary;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{article.name}</div>
            <div className="modal-sub">Цена на доставка за 1 {article.unit || "бр"} · без ДДС</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Затвори">
            ✕
          </button>
        </div>

        <div className="presets" style={{ padding: "0 16px" }}>
          {HISTORY_RANGES.map((r) => (
            <button key={r.key} className={`preset ${range === r.key ? "active" : ""}`} onClick={() => setRange(r.key)}>
              {r.label}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {loading && <div className="loading">Зареждане…</div>}
          {error && <div className="error">{error}</div>}

          {!loading && hist && s && s.purchases === 0 && (
            <div className="empty">Няма зареждания на този артикул за периода.</div>
          )}

          {!loading && hist && s && s.purchases > 0 && (
            <>
              <div className="kpis kpis-modal">
                <div className="kpi">
                  <div className="label">Последна цена</div>
                  <div className="value">{fmtPrice(s.lastPrice)}</div>
                </div>
                <div className="kpi">
                  <div className="label">Средна цена</div>
                  <div className="value">{fmtPrice(s.avgPrice)}</div>
                </div>
                <div className="kpi">
                  <div className="label">Мин / Макс</div>
                  <div className="value small">
                    {fmtPrice(s.minPrice)} / {fmtPrice(s.maxPrice)}
                  </div>
                </div>
                <div className="kpi">
                  <div className="label">Общо {fmtQty(s.quantity)} {article.unit}</div>
                  <div className="value small">{fmtMoney(s.total)}</div>
                </div>
              </div>

              <PriceChart purchases={hist.purchases} />

              <div className="tabs">
                <button className={tab === "months" ? "active" : ""} onClick={() => setTab("months")}>
                  По месеци ({hist.byMonth.length})
                </button>
                <button className={tab === "years" ? "active" : ""} onClick={() => setTab("years")}>
                  По години ({hist.byYear.length})
                </button>
                <button className={tab === "purchases" ? "active" : ""} onClick={() => setTab("purchases")}>
                  Покупки ({hist.purchases.length})
                </button>
              </div>

              {tab !== "purchases" ? (
                <PeriodTable periods={tab === "months" ? hist.byMonth : hist.byYear} unit={article.unit} />
              ) : (
                <PurchasesTable purchases={hist.purchases} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PriceChart({ purchases }: { purchases: Purchase[] }) {
  const pts = purchases.filter((p) => p.unitPrice > 0);
  if (pts.length < 2) return null;

  const W = 640;
  const H = 180;
  const PAD_L = 8;
  const PAD_R = 8;
  const PAD_T = 14;
  const PAD_B = 22;

  const times = pts.map((p) => new Date(p.date.replace(" ", "T")).getTime());
  const prices = pts.map((p) => p.unitPrice);
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const pMin = Math.min(...prices);
  const pMax = Math.max(...prices);
  const pPad = (pMax - pMin) * 0.15 || pMax * 0.1 || 1;
  const yLo = Math.max(0, pMin - pPad);
  const yHi = pMax + pPad;

  const x = (t: number) => PAD_L + ((t - tMin) / Math.max(1, tMax - tMin)) * (W - PAD_L - PAD_R);
  const y = (p: number) => PAD_T + (1 - (p - yLo) / (yHi - yLo)) * (H - PAD_T - PAD_B);

  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(times[i]).toFixed(1)},${y(p.unitPrice).toFixed(1)}`).join(" ");

  const first = pts[0];
  const last = pts[pts.length - 1];
  const fmtD = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(2, 4)}`;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="price-chart" preserveAspectRatio="none" role="img" aria-label="Цена по време">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={PAD_L} x2={W - PAD_R} y1={PAD_T + f * (H - PAD_T - PAD_B)} y2={PAD_T + f * (H - PAD_T - PAD_B)} className="grid" />
        ))}
        <path d={path} className="line" />
        {pts.map((p, i) => (
          <circle key={i} cx={x(times[i])} cy={y(p.unitPrice)} r={pts.length > 40 ? 2 : 3.5} className="dot">
            <title>{`${fmtD(p.date)} · ${p.unitPrice.toFixed(4)} € · ${p.quantity} × · ${p.supplierName}`}</title>
          </circle>
        ))}
        <circle cx={x(times[times.length - 1])} cy={y(last.unitPrice)} r={5} className="dot-last" />
        <text x={PAD_L} y={y(pMax) - 4} className="lbl">{`макс ${fmtPrice(pMax)}`}</text>
        <text x={PAD_L} y={y(pMin) + 12} className="lbl">{`мин ${fmtPrice(pMin)}`}</text>
        <text x={PAD_L} y={H - 6} className="lbl dim">{fmtD(first.date)}</text>
        <text x={W - PAD_R} y={H - 6} className="lbl dim" textAnchor="end">{fmtD(last.date)}</text>
      </svg>
    </div>
  );
}

function PeriodTable({ periods, unit }: { periods: PeriodAgg[]; unit: string }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Период</th>
            <th className="r">Покупки</th>
            <th className="r">Количество ({unit || "бр"})</th>
            <th className="r">Ср. цена</th>
            <th className="r">Мин</th>
            <th className="r">Макс</th>
            <th className="r">Стойност (без ДДС)</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.period}>
              <td>{fmtPeriod(p.period)}</td>
              <td className="r">{p.purchases}</td>
              <td className="r">{fmtQty(p.quantity)}</td>
              <td className="r">{fmtPrice(p.avgPrice)}</td>
              <td className="r">{fmtPrice(p.minPrice)}</td>
              <td className="r">{fmtPrice(p.maxPrice)}</td>
              <td className="r">{fmtMoney(p.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PurchasesTable({ purchases }: { purchases: Purchase[] }) {
  const rows = [...purchases].reverse();
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Дата</th>
            <th>Доставчик</th>
            <th>Док. №</th>
            <th className="r">Количество</th>
            <th className="r">Ед. цена</th>
            <th className="r">Стойност (без ДДС)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={`${p.storeLoadId}-${i}`}>
              <td>{p.date.slice(0, 10)}</td>
              <td>{p.supplierName}</td>
              <td>{p.docNum || p.storeLoadId}</td>
              <td className="r">{fmtQty(p.quantity)}</td>
              <td className="r">{fmtPrice(p.unitPrice)}</td>
              <td className="r">{fmtMoney(p.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoadRows({
  l,
  open,
  toggle,
  onArticle,
}: {
  l: LoadAgg;
  open: boolean;
  toggle: () => void;
  onArticle: (a: ArticleRef) => void;
}) {
  return (
    <>
      <tr className="load-row" onClick={toggle}>
        <td>
          {open ? "▾ " : "▸ "}
          {l.date.slice(0, 16)}
        </td>
        <td>{l.docDate}</td>
        <td>{l.docNum || l.id}</td>
        <td className="r">{l.rows.length}</td>
        <td className="r">{fmtMoney(l.total)}</td>
        <td className="r">{fmtMoney(l.totalTax)}</td>
      </tr>
      {open && (
        <tr className="load-items">
          <td colSpan={6}>
            <table>
              <thead>
                <tr>
                  <th>Артикул</th>
                  <th className="r">Количество</th>
                  <th>Мярка</th>
                  <th className="r">Единична цена</th>
                  <th className="r">Стойност (без ДДС)</th>
                </tr>
              </thead>
              <tbody>
                {l.rows.map((r, i) => (
                  <tr
                    key={`${r.articleId}-${i}`}
                    className={r.articleId ? "article-row" : ""}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (r.articleId) onArticle({ id: r.articleId, name: r.articleName, unit: r.unit });
                    }}
                  >
                    <td className={r.articleId ? "article-link" : ""}>{r.articleName || r.articleId}</td>
                    <td className="r">{fmtQty(r.quantity)}</td>
                    <td>{r.unit}</td>
                    <td className="r">{fmtMoney(r.unitPrice)}</td>
                    <td className="r">{fmtMoney(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}
