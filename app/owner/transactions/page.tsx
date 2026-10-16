"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Transaction = {
  id: number;
  transaction_code: string;
  total_amount: number;
  payment_amount: number;
  change_amount: number;
  payment_method: string;
  status: string;
  created_at: string;
};

export default function OwnerTransactionsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadTransactions() {
      setLoading(true);
      setError("");

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace("/login");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (profileError || !profile || profile.role !== "owner") {
          router.replace("/login");
          return;
        }

        let query = supabase.from("transactions").select(`
          id,
          transaction_code,
          total_amount,
          payment_amount,
          change_amount,
          payment_method,
          status,
          created_at
        `);

        if (filterStartDate) {
          const start = new Date(`${filterStartDate}T00:00:00`);
          query = query.gte("created_at", start.toISOString());
        }

        if (filterEndDate) {
          const end = new Date(`${filterEndDate}T00:00:00`);
          end.setDate(end.getDate() + 1);
          query = query.lt("created_at", end.toISOString());
        }

        const { data, error: transactionError } = await query.order(
          "created_at",
          { ascending: false }
        );

        if (transactionError) {
          throw new Error(transactionError.message);
        }

        if (isMounted) {
          setTransactions((data as Transaction[]) ?? []);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(
            `Gagal memuat transaksi: ${
              loadError instanceof Error
                ? loadError.message
                : "Terjadi kesalahan yang tidak diketahui."
            }`
          );
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void loadTransactions();

    return () => {
      isMounted = false;
    };
  }, [router, supabase, filterStartDate, filterEndDate]);

  function formatRupiah(value: number) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(value);
  }

  function formatDate(value: string) {
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  function formatPaymentMethod(value: string) {
    if (value === "cash") return "Tunai";
    if (value === "qris") return "QRIS";
    return value;
  }

  function formatStatus(value: string) {
    if (value === "completed") return "Selesai";
    if (value === "pending") return "Menunggu";
    if (value === "cancelled") return "Dibatalkan";
    if (value === "failed") return "Gagal";
    return value;
  }

  function getStatusClass(value: string) {
    if (value === "completed") {
      return "border-green-200 bg-green-50 text-green-700";
    }
    if (value === "pending") {
      return "border-amber-200 bg-amber-50 text-amber-700";
    }
    if (value === "cancelled" || value === "failed") {
      return "border-red-200 bg-red-50 text-red-700";
    }
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  function handleApplyFilter() {
    if (startDate && endDate && startDate > endDate) {
      setError("Tanggal mulai tidak boleh lebih besar dari tanggal akhir.");
      return;
    }

    setError("");
    setFilterStartDate(startDate);
    setFilterEndDate(endDate);
  }

  function handleResetFilter() {
    setStartDate("");
    setEndDate("");
    setFilterStartDate("");
    setFilterEndDate("");
    setError("");
  }

  const totalSales = transactions.reduce(
    (total, transaction) => total + Number(transaction.total_amount),
    0
  );
  const completedCount = transactions.filter(
    (transaction) => transaction.status === "completed"
  ).length;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div
          className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white px-8 py-7 shadow-sm"
          role="status"
          aria-live="polite"
        >
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
          <p className="text-sm font-medium text-slate-600">
            Memuat transaksi...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-lg font-bold text-white shadow-sm">
              K
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight sm:text-xl">
                KantinKu
              </h1>
              <p className="text-sm text-slate-500">Transaksi Penjualan</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push("/owner")}
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition duration-150 hover:border-slate-400 hover:bg-slate-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 sm:px-4"
          >
            <span className="mr-2" aria-hidden="true">←</span>
            Kembali
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <section className="mb-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            Manajemen Penjualan
          </p>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Seluruh Transaksi
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            Pantau transaksi penjualan kantin, periksa metode pembayaran, dan
            buka detail transaksi bila diperlukan.
          </p>
        </section>

        {error && (
          <div
            className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            <span className="mt-0.5 font-bold" aria-hidden="true">!</span>
            <p className="min-w-0 break-words">{error}</p>
          </div>
        )}

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-5">
            <h3 className="font-semibold text-slate-900">Filter Periode</h3>
            <p className="mt-1 text-sm text-slate-500">
              Pilih rentang tanggal untuk menyaring transaksi.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="start-date"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Dari tanggal
              </label>
              <input
                id="start-date"
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(event) => setStartDate(event.target.value)}
                className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 sm:text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="end-date"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Sampai tanggal
              </label>
              <input
                id="end-date"
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(event) => setEndDate(event.target.value)}
                className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-800 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 sm:text-sm"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleApplyFilter}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition duration-150 hover:bg-slate-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
            >
              Tampilkan Transaksi
            </button>
            <button
              type="button"
              onClick={handleResetFilter}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition duration-150 hover:bg-slate-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
            >
              Reset Filter
            </button>
          </div>

          {(filterStartDate || filterEndDate) && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-slate-600">Filter aktif:</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
                {filterStartDate || "Awal tidak dibatasi"}
              </span>
              <span className="text-slate-400">sampai</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
                {filterEndDate || "Akhir tidak dibatasi"}
              </span>
            </div>
          )}
        </section>

        <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-150 hover:shadow-md sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-slate-500">Total Transaksi</p>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-lg font-bold text-blue-700" aria-hidden="true">
                #
              </span>
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
              {transactions.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">Sesuai periode terpilih</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-150 hover:shadow-md sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-slate-500">Total Penjualan</p>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-lg font-bold text-emerald-700" aria-hidden="true">
                Rp
              </span>
            </div>
            <p className="mt-3 break-words text-2xl font-bold tracking-tight sm:text-3xl">
              {formatRupiah(totalSales)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Akumulasi transaksi yang ditampilkan</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-150 hover:shadow-md sm:col-span-2 sm:p-6 lg:col-span-1">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-slate-500">Transaksi Selesai</p>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-lg font-bold text-violet-700" aria-hidden="true">
                ✓
              </span>
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
              {completedCount}
            </p>
            <p className="mt-1 text-xs text-slate-500">Berstatus selesai</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-1 border-b border-slate-200 px-4 py-4 sm:px-6">
            <h3 className="font-semibold text-slate-900">Daftar Transaksi</h3>
            <p className="text-sm text-slate-500">
              Transaksi terbaru ditampilkan terlebih dahulu.
            </p>
          </div>

          {transactions.length === 0 ? (
            <div className="px-5 py-12 text-center sm:px-8">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl text-slate-500" aria-hidden="true">
                ↗
              </div>
              <h4 className="mt-4 font-semibold text-slate-800">
                Belum ada transaksi
              </h4>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">
                Tidak ada transaksi pada periode yang dipilih. Coba ubah
                filter tanggal atau reset filter.
              </p>
              {(filterStartDate || filterEndDate) && (
                <button
                  type="button"
                  onClick={handleResetFilter}
                  className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
                >
                  Reset Filter
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500 sm:px-6">
                Menampilkan <span className="font-semibold text-slate-700">{transactions.length}</span> transaksi. Geser tabel ke samping untuk melihat semua kolom.
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] border-collapse text-left">
                  <thead className="bg-slate-50">
                    <tr className="text-xs uppercase tracking-wide text-slate-500">
                      <th scope="col" className="whitespace-nowrap px-5 py-4 font-semibold">Kode Transaksi</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-4 font-semibold">Tanggal</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-4 font-semibold">Pembayaran</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-4 font-semibold">Total</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-4 font-semibold">Status</th>
                      <th scope="col" className="whitespace-nowrap px-5 py-4 font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactions.map((transaction) => (
                      <tr
                        key={transaction.id}
                        className="text-sm transition-colors hover:bg-slate-50/80"
                      >
                        <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-900">
                          {transaction.transaction_code}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                          {formatDate(transaction.created_at)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                          {formatPaymentMethod(transaction.payment_method)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-900">
                          {formatRupiah(Number(transaction.total_amount))}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4">
                          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClass(transaction.status)}`}>
                            <span className="mr-2 h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                            {formatStatus(transaction.status)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4">
                          <button
                            type="button"
                            onClick={() => router.push(`/owner/transactions/${transaction.id}`)}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition duration-150 hover:border-slate-400 hover:bg-slate-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
                            aria-label={`Lihat detail transaksi ${transaction.transaction_code}`}
                          >
                            Detail
                            <span aria-hidden="true">→</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
