"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Transaction = {
  id: number;
  total_amount: number;
  payment_method: string;
  created_at: string;
  status: string;
};

type TransactionItem = {
  transaction_id: number;
  product_name: string;
  quantity: number;
  subtotal: number;
};

type DailySales = {
  date: string;
  total: number;
};

type ProductSales = {
  name: string;
  quantity: number;
  total: number;
};

type PaymentSales = {
  method: string;
  transactionCount: number;
  total: number;
};

export default function AnalyticsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionItems, setTransactionItems] = useState<
    TransactionItem[]
  >([]);

  const [dailySales, setDailySales] = useState<DailySales[]>([]);
  const [productSales, setProductSales] = useState<ProductSales[]>([]);
  const [paymentSales, setPaymentSales] = useState<PaymentSales[]>([]);

  const [totalSales, setTotalSales] = useState(0);
  const [transactionCount, setTransactionCount] = useState(0);
  const [averageTransaction, setAverageTransaction] = useState(0);

  useEffect(() => {
    const today = new Date();

    const end = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );

    const start = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - 6
    );

    setStartDate(formatDateInput(start));
    setEndDate(formatDateInput(end));

    loadAnalytics(formatDateInput(start), formatDateInput(end));
  }, []);

  function formatDateInput(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function formatRupiah(value: number) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(value);
  }

  function formatDate(date: string) {
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(`${date}T00:00:00`));
  }

  async function loadAnalytics(from: string, to: string) {
    setLoading(true);

    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);

    end.setDate(end.getDate() + 1);

    const {
      data: transactionData,
      error: transactionError,
    } = await supabase
      .from("transactions")
      .select(
        "id, total_amount, payment_method, created_at, status"
      )
      .eq("status", "completed")
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: true });

    if (transactionError) {
      console.error(transactionError);
      setLoading(false);
      return;
    }

    const loadedTransactions =
      (transactionData as Transaction[]) ?? [];

    setTransactions(loadedTransactions);

    if (loadedTransactions.length === 0) {
      setTransactionItems([]);
      setDailySales([]);
      setProductSales([]);
      setPaymentSales([]);
      setTotalSales(0);
      setTransactionCount(0);
      setAverageTransaction(0);
      setLoading(false);
      return;
    }

    const transactionIds = loadedTransactions.map(
      (transaction) => transaction.id
    );

    const {
      data: itemData,
      error: itemError,
    } = await supabase
      .from("transaction_items")
      .select(
        "transaction_id, product_name, quantity, subtotal"
      )
      .in("transaction_id", transactionIds);

    if (itemError) {
      console.error(itemError);
      setLoading(false);
      return;
    }

    const loadedItems =
      (itemData as TransactionItem[]) ?? [];

    setTransactionItems(loadedItems);

    calculateAnalytics(
      loadedTransactions,
      loadedItems
    );

    setLoading(false);
  }

  function calculateAnalytics(
    transactionData: Transaction[],
    itemData: TransactionItem[]
  ) {
    const sales = transactionData.reduce(
      (sum, transaction) =>
        sum + Number(transaction.total_amount),
      0
    );

    const count = transactionData.length;

    setTotalSales(sales);
    setTransactionCount(count);
    setAverageTransaction(
      count > 0 ? sales / count : 0
    );

    // =========================
    // PENJUALAN PER HARI
    // =========================

    const dailyMap: Record<string, number> = {};

    transactionData.forEach((transaction) => {
      const date = new Date(transaction.created_at);

      const key = formatDateInput(date);

      dailyMap[key] =
        (dailyMap[key] ?? 0) +
        Number(transaction.total_amount);
    });

    const dailyResult = Object.entries(dailyMap)
      .map(([date, total]) => ({
        date,
        total,
      }))
      .sort((a, b) =>
        a.date.localeCompare(b.date)
      );

    setDailySales(dailyResult);

    // =========================
    // PRODUK TERLARIS
    // =========================

    const productMap: Record<
      string,
      {
        quantity: number;
        total: number;
      }
    > = {};

    itemData.forEach((item) => {
      if (!productMap[item.product_name]) {
        productMap[item.product_name] = {
          quantity: 0,
          total: 0,
        };
      }

      productMap[item.product_name].quantity +=
        Number(item.quantity);

      productMap[item.product_name].total +=
        Number(item.subtotal);
    });

    const productResult = Object.entries(productMap)
      .map(([name, data]) => ({
        name,
        quantity: data.quantity,
        total: data.total,
      }))
      .sort((a, b) => b.quantity - a.quantity);

    setProductSales(productResult);

    // =========================
    // METODE PEMBAYARAN
    // =========================

    const paymentMap: Record<
      string,
      {
        transactionCount: number;
        total: number;
      }
    > = {};

    transactionData.forEach((transaction) => {
      const method = transaction.payment_method;

      if (!paymentMap[method]) {
        paymentMap[method] = {
          transactionCount: 0,
          total: 0,
        };
      }

      paymentMap[method].transactionCount += 1;
      paymentMap[method].total +=
        Number(transaction.total_amount);
    });

    const paymentResult = Object.entries(paymentMap)
      .map(([method, data]) => ({
        method,
        transactionCount: data.transactionCount,
        total: data.total,
      }))
      .sort((a, b) => b.total - a.total);

    setPaymentSales(paymentResult);
  }

  function handleFilter() {
    if (!startDate || !endDate) {
      return;
    }

    if (startDate > endDate) {
      alert(
        "Tanggal mulai tidak boleh lebih besar dari tanggal akhir."
      );
      return;
    }

    loadAnalytics(startDate, endDate);
  }

  function handleReset() {
    const today = new Date();

    const end = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );

    const start = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - 6
    );

    const from = formatDateInput(start);
    const to = formatDateInput(end);

    setStartDate(from);
    setEndDate(to);

    loadAnalytics(from, to);
  }

  const maxDailySales =
    dailySales.length > 0
      ? Math.max(...dailySales.map((item) => item.total))
      : 0;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-500">
          Memuat analytics...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              KantinKu
            </h1>

            <p className="text-sm text-slate-500">
              Analytics Penjualan
            </p>
          </div>

          <button
            onClick={() => router.push("/owner")}
            className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Kembali
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <section className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900">
            Analytics
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Analisis penjualan berdasarkan data transaksi kantin.
          </p>
        </section>

        {/* FILTER PERIODE */}

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">
            Filter Periode
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            Pilih periode untuk melihat performa penjualan.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Dari tanggal
              </label>

              <input
                type="date"
                value={startDate}
                onChange={(event) =>
                  setStartDate(event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Sampai tanggal
              </label>

              <input
                type="date"
                value={endDate}
                onChange={(event) =>
                  setEndDate(event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              />
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              onClick={handleFilter}
              className="cursor-pointer rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Tampilkan
            </button>

            <button
              onClick={handleReset}
              className="cursor-pointer rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Reset
            </button>
          </div>
        </section>

        {/* RINGKASAN */}

        <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Total Penjualan
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {formatRupiah(totalSales)}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Total Transaksi
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {transactionCount}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Rata-rata Transaksi
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {formatRupiah(averageTransaction)}
            </p>
          </div>
        </section>

        {/* TREN PENJUALAN */}

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">
            Tren Penjualan
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            Total penjualan berdasarkan tanggal.
          </p>

          {dailySales.length === 0 ? (
            <div className="mt-6 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
              Tidak ada transaksi pada periode ini.
            </div>
          ) : (
            <div className="mt-6 h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={dailySales}
                  margin={{
                    top: 10,
                    right: 20,
                    left: 10,
                    bottom: 10,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />

                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    tick={{ fontSize: 12 }}
                  />

                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => formatRupiah(value)}
                  />

                  <Tooltip
                    formatter={(value) => formatRupiah(Number(value))}
                    labelFormatter={(label) => formatDate(String(label))}
                  />

                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke="currentColor"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* PRODUK TERLARIS */}

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">
              Produk Terlaris
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Produk berdasarkan jumlah unit yang terjual.
            </p>

            {productSales.length === 0 ? (
              <div className="mt-6 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                Belum ada data produk.
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {productSales.slice(0, 5).map((product, index) => {
                  const maxQuantity = productSales[0]?.quantity ?? 0;

                  const percentage =
                    maxQuantity > 0
                      ? (product.quantity / maxQuantity) * 100
                      : 0;

                  return (
                    <div
                      key={product.name}
                      className="rounded-xl bg-slate-50 px-4 py-4"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                            {index + 1}
                          </div>

                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900">
                              {product.name}
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                              {product.quantity} unit terjual
                            </p>
                          </div>
                        </div>

                        <p className="shrink-0 font-semibold text-slate-900">
                          {formatRupiah(product.total)}
                        </p>
                      </div>

                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-slate-900"
                          style={{
                            width: `${percentage}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* METODE PEMBAYARAN */}

          {/* PENJUALAN BERDASARKAN METODE PEMBAYARAN */}

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">
              Penjualan Berdasarkan Metode Pembayaran
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Perbandingan transaksi tunai dan QRIS.
            </p>

            {paymentSales.length === 0 ? (
              <div className="mt-6 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                Belum ada data pembayaran.
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {paymentSales.map((payment) => {
                  const totalPaymentSales = paymentSales.reduce(
                    (sum, item) => sum + item.total,
                    0
                  );

                  const percentage =
                    totalPaymentSales > 0
                      ? (payment.total / totalPaymentSales) * 100
                      : 0;

                  const paymentLabel =
                    payment.method.toLowerCase() === "qris"
                      ? "QRIS"
                      : payment.method.toLowerCase() === "cash"
                        ? "Cash"
                        : payment.method;

                  return (
                    <div
                      key={payment.method}
                      className="rounded-xl bg-slate-50 px-4 py-4"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-medium text-slate-900">
                            {paymentLabel}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {payment.transactionCount} transaksi
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="font-semibold text-slate-900">
                            {formatRupiah(payment.total)}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {percentage.toFixed(1)}%
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-slate-900"
                          style={{
                            width: `${percentage}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}