"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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

type TransactionItem = {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  price: number;
  subtotal: number;
};

export default function TransactionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const transactionId = params.id as string;
  const supabase = createClient();

  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [items, setItems] = useState<TransactionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadTransactionDetail() {
      setLoading(true);
      setError("");

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw new Error("Gagal memeriksa sesi pengguna.");

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

        const { data: transactionData, error: transactionError } =
          await supabase
            .from("transactions")
            .select(
              `
              id,
              transaction_code,
              total_amount,
              payment_amount,
              change_amount,
              payment_method,
              status,
              created_at
            `
            )
            .eq("id", transactionId)
            .single();

        if (transactionError || !transactionData) {
          throw new Error("Transaksi tidak ditemukan atau tidak dapat diakses.");
        }

        const { data: itemData, error: itemError } = await supabase
          .from("transaction_items")
          .select(
            `
            id,
            product_id,
            product_name,
            quantity,
            price,
            subtotal
            `
          )
          .eq("transaction_id", transactionId)
          .order("id", { ascending: true });

        if (itemError) {
          throw new Error(`Gagal memuat detail produk: ${itemError.message}`);
        }

        if (isMounted) {
          setTransaction(transactionData as Transaction);
          setItems((itemData as TransactionItem[]) ?? []);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Terjadi kesalahan saat memuat transaksi."
          );
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void loadTransactionDetail();

    return () => {
      isMounted = false;
    };
  }, [router, supabase, transactionId]);

  function formatRupiah(value: number) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(value);
  }

  function formatDate(value: string) {
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "full",
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
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }
    if (value === "pending") {
      return "border-amber-200 bg-amber-50 text-amber-700";
    }
    if (value === "cancelled" || value === "failed") {
      return "border-red-200 bg-red-50 text-red-700";
    }
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

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
            Memuat detail transaksi...
          </p>
        </div>
      </main>
    );
  }

  if (!transaction) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-8">
        <div className="mx-auto flex min-h-[65vh] max-w-xl items-center justify-center">
          <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-2xl font-bold text-red-600" aria-hidden="true">
              !
            </div>
            <h1 className="mt-4 text-xl font-bold text-slate-900">
              Detail transaksi tidak tersedia
            </h1>
            <p className="mt-2 break-words text-sm leading-6 text-slate-600" role="alert">
              {error || "Transaksi tidak ditemukan."}
            </p>
            <button
              type="button"
              onClick={() => router.push("/owner/transactions")}
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
            >
              <span className="mr-2" aria-hidden="true">←</span>
              Kembali ke Transaksi
            </button>
          </section>
        </div>
      </main>
    );
  }

  const totalQuantity = items.reduce(
    (total, item) => total + Number(item.quantity),
    0
  );

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-lg font-bold text-white shadow-sm">
              K
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight sm:text-xl">KantinKu</h1>
              <p className="text-sm text-slate-500">Detail Transaksi</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push("/owner/transactions")}
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 sm:px-4"
          >
            <span className="mr-2" aria-hidden="true">←</span>
            Kembali
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <section className="mb-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            Riwayat Penjualan
          </p>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Detail Transaksi
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
            Informasi transaksi, daftar produk, dan rincian pembayaran.
          </p>
        </section>

        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-500">Kode Transaksi</p>
              <p className="mt-2 break-all text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                {transaction.transaction_code}
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                {formatDate(transaction.created_at)}
              </p>
            </div>
            <span className={`inline-flex w-fit shrink-0 items-center rounded-full border px-3 py-1.5 text-sm font-semibold ${getStatusClass(transaction.status)}`}>
              <span className="mr-2 h-2 w-2 rounded-full bg-current" aria-hidden="true" />
              {formatStatus(transaction.status)}
            </span>
          </div>
        </section>

        <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">Produk yang Dibeli</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Rincian item pada transaksi ini.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {items.length} {items.length === 1 ? "jenis produk" : "jenis produk"}
              </span>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="px-5 py-10 text-center sm:px-6">
              <p className="text-sm text-slate-500">Tidak ada detail produk untuk transaksi ini.</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-100">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                  >
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-slate-900">
                        {item.product_name}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {item.quantity} × {formatRupiah(Number(item.price))}
                      </p>
                    </div>
                    <p className="shrink-0 text-base font-bold tabular-nums text-slate-900">
                      {formatRupiah(Number(item.subtotal))}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
                <span className="text-sm font-medium text-slate-600">Total jumlah item</span>
                <span className="font-bold tabular-nums text-slate-900">{totalQuantity} item</span>
              </div>
            </>
          )}
        </section>

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="font-semibold text-slate-900">Ringkasan Pembayaran</h3>
          <p className="mt-1 text-sm text-slate-500">
            Rincian metode dan nominal pembayaran.
          </p>

          <dl className="mt-5 space-y-4 text-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <dt className="text-slate-500">Metode Pembayaran</dt>
              <dd className="font-semibold text-slate-900">{formatPaymentMethod(transaction.payment_method)}</dd>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <dt className="text-slate-500">Total Transaksi</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{formatRupiah(Number(transaction.total_amount))}</dd>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <dt className="text-slate-500">Uang Dibayar</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{formatRupiah(Number(transaction.payment_amount))}</dd>
            </div>
            <div className="border-t border-slate-200 pt-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <dt className="font-semibold text-slate-900">Kembalian</dt>
                <dd className="text-xl font-bold tabular-nums text-slate-900">{formatRupiah(Number(transaction.change_amount))}</dd>
              </div>
            </div>
          </dl>
        </section>

        <button
          type="button"
          onClick={() => router.push("/owner/transactions")}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white transition duration-150 hover:bg-slate-800 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
        >
          <span className="mr-2" aria-hidden="true">←</span>
          Kembali ke Daftar Transaksi
        </button>
      </div>
    </main>
  );
}
