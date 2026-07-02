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

function fmtMoney(n: number): string {
  return n.toLocaleString("bg-BG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function fmtQty(n: number): string {
  return n.toLocaleString("bg-BG", { maximumFractionDigits: 3 });
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function Dashboard() {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(daysAgo(0));
  const [supplierId, setSupplierId] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/suppliers")
      .then((r) => r.json())
      .then((d) => setSuppliers(d.suppliers || []))
      .catch(() => {});
  }, []);

  const load = useCallback(async (f: string, t: string, sup: string) => {
    setLoading(true);
    setError("");
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

  const maxTotal = useMemo(
    () => Math.max(1, ...(data?.suppliers.map((s) => s.total) || [])),
    [data]
  );

  return (
    <div className="container">
      <h1>Barsy Analytics — Зареждания</h1>
      <p className="subtitle">СКЛАД → ЗАРЕЖДАНИЯ → ВСИЧКИ · по доставчик и артикул · период по документ дата</p>

      <div className="filters">
        <label>
          От дата
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          До дата
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label>
          Доставчик
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Всички доставчици</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => load(from, to, supplierId)} disabled={loading}>
          {loading ? "Зареждане…" : "Покажи"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {data && (
        <div className="kpis">
          <div className="kpi">
            <div className="label">Зареждания</div>
            <div className="value">{data.totals.loadCount}</div>
          </div>
          <div className="kpi">
            <div className="label">Доставчици</div>
            <div className="value">{data.totals.supplierCount}</div>
          </div>
          <div className="kpi">
            <div className="label">Стойност (без ДДС)</div>
            <div className="value">{fmtMoney(data.totals.total)}</div>
          </div>
          <div className="kpi">
            <div className="label">Стойност (с ДДС)</div>
            <div className="value">{fmtMoney(data.totals.totalTax)}</div>
          </div>
        </div>
      )}

      {loading && !data && <div className="loading">Зареждане на данни от Barsy…</div>}

      {data && data.suppliers.length === 0 && (
        <div className="empty">Няма зареждания за избрания период.</div>
      )}

      {data?.suppliers.map((s) => (
        <SupplierCard key={s.supplierId || s.supplierName} s={s} maxTotal={maxTotal} />
      ))}
    </div>
  );
}

function SupplierCard({ s, maxTotal }: { s: SupplierAgg; maxTotal: number }) {
  const [open, setOpen] = useState(false);
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
          {tab === "articles" ? <ArticlesTable articles={s.articles} /> : <LoadsTable loads={s.loads} />}
        </div>
      )}
    </div>
  );
}

function ArticlesTable({ articles }: { articles: ArticleAgg[] }) {
  return (
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
          <tr key={a.articleId || a.articleName}>
            <td>{a.articleName || a.articleId}</td>
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
  );
}

function LoadsTable({ loads }: { loads: LoadAgg[] }) {
  const [openId, setOpenId] = useState<number>(0);
  return (
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
          <LoadRows key={l.id} l={l} open={openId === l.id} toggle={() => setOpenId(openId === l.id ? 0 : l.id)} />
        ))}
      </tbody>
    </table>
  );
}

function LoadRows({ l, open, toggle }: { l: LoadAgg; open: boolean; toggle: () => void }) {
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
                  <tr key={`${r.articleId}-${i}`}>
                    <td>{r.articleName || r.articleId}</td>
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
