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
  payment_method: "cash" | "qris";
  status: "completed" | "cancelled";
  created_at: string;
};

type TransactionItem = {
  id: number;
  transaction_id: number;
  product_id: number | null;
  product_name: string;
  quantity: number;
  price: number;
  subtotal: number;
};

export default function CashierHistoryPage() {
  const router = useRouter();
  const supabase = createClient();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);

  const [transactionItems, setTransactionItems] =
    useState<TransactionItem[]>([]);

  const [loadingDetail, setLoadingDetail] = useState(false);

  async function loadTransactions() {
    setLoading(true);
    setError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "cashier") {
      router.replace("/login");
      return;
    }

    const { data, error } = await supabase
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
      .eq("cashier_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      setError(
        `Gagal memuat riwayat transaksi: ${error.message}`
      );
      setLoading(false);
      return;
    }

    setTransactions(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadTransactions();
  }, []);

  async function loadTransactionDetail(
    transaction: Transaction
  ) {
    setError("");
    setLoadingDetail(true);
    setSelectedTransaction(transaction);
    setTransactionItems([]);

    const { data, error } = await supabase
      .from("transaction_items")
      .select(
        `
        id,
        transaction_id,
        product_id,
        product_name,
        quantity,
        price,
        subtotal
        `
      )
      .eq("transaction_id", transaction.id)
      .order("id", { ascending: true });

    if (error) {
      setError(
        `Gagal memuat detail transaksi: ${error.message}`
      );
      setLoadingDetail(false);
      return;
    }

    setTransactionItems(data ?? []);
    setLoadingDetail(false);
  }

  function closeTransactionDetail() {
    setSelectedTransaction(null);
    setTransactionItems([]);
    setError("");
  }

  function formatRupiah(value: number) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(value);
  }

  function formatDateTime(value: string) {
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-500">
          Memuat riwayat transaksi...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              KantinKu
            </h1>

            <p className="text-sm text-slate-500">
              Riwayat Transaksi
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/cashier")}
            className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Kembali
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900">
            Riwayat Transaksi
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Daftar transaksi yang telah dilakukan oleh
            cashier.
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span className="font-bold">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {selectedTransaction ? (
          <div className="rounded-2xl bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-5">
              <button
                type="button"
                onClick={closeTransactionDetail}
                className="mb-4 cursor-pointer text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                ← Kembali ke Riwayat
              </button>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm text-slate-500">
                    Detail Transaksi
                  </p>

                  <h2 className="mt-1 text-xl font-bold text-slate-900">
                    {selectedTransaction.transaction_code}
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    {formatDateTime(
                      selectedTransaction.created_at
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      selectedTransaction.payment_method ===
                      "cash"
                        ? "bg-green-50 text-green-700"
                        : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    {selectedTransaction.payment_method ===
                    "cash"
                      ? "Tunai"
                      : "QRIS"}
                  </span>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      selectedTransaction.status ===
                      "completed"
                        ? "bg-green-50 text-green-700"
                        : "bg-red-50 text-red-700"
                    }`}
                  >
                    {selectedTransaction.status ===
                    "completed"
                      ? "Selesai"
                      : "Dibatalkan"}
                  </span>
                </div>
              </div>
            </div>

            <div className="px-5 py-5">
              <h3 className="font-semibold text-slate-900">
                Rincian Produk
              </h3>

              {loadingDetail ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-slate-500">
                    Memuat rincian transaksi...
                  </p>
                </div>
              ) : transactionItems.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center">
                  <p className="text-sm text-slate-500">
                    Tidak ada rincian produk untuk transaksi
                    ini.
                  </p>
                </div>
              ) : (
                <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {transactionItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-4 px-4 py-4"
                    >
                      <div>
                        <p className="font-medium text-slate-900">
                          {item.product_name}
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          {item.quantity} ×{" "}
                          {formatRupiah(item.price)}
                        </p>
                      </div>

                      <p className="font-semibold text-slate-900">
                        {formatRupiah(item.subtotal)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 border-t border-slate-200 pt-5">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">
                      Total
                    </span>

                    <span className="font-bold text-slate-900">
                      {formatRupiah(
                        selectedTransaction.total_amount
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">
                      Metode Pembayaran
                    </span>

                    <span className="font-semibold text-slate-900">
                      {selectedTransaction.payment_method ===
                      "cash"
                        ? "Tunai"
                        : "QRIS"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">
                      Dibayar
                    </span>

                    <span className="font-semibold text-slate-900">
                      {formatRupiah(
                        selectedTransaction.payment_amount
                      )}
                    </span>
                  </div>

                  {selectedTransaction.payment_method ===
                    "cash" && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">
                        Kembalian
                      </span>

                      <span className="font-semibold text-green-600">
                        {formatRupiah(
                          selectedTransaction.change_amount
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : transactions.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <p className="font-medium text-slate-700">
              Belum ada transaksi.
            </p>

            <p className="mt-1 text-sm text-slate-500">
              Transaksi yang berhasil dilakukan akan muncul
              di sini.
            </p>

            <button
              type="button"
              onClick={() => router.push("/cashier/pos")}
              className="mt-5 cursor-pointer rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Buat Transaksi
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <p className="font-semibold text-slate-900">
                {transactions.length} Transaksi
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              {transactions.map((transaction) => (
                <button
                  key={transaction.id}
                  type="button"
                  onClick={() =>
                    loadTransactionDetail(transaction)
                  }
                  className="block w-full cursor-pointer px-5 py-4 text-left transition hover:bg-slate-50"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {transaction.transaction_code}
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        {formatDateTime(
                          transaction.created_at
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          transaction.payment_method ===
                          "cash"
                            ? "bg-green-50 text-green-700"
                            : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {transaction.payment_method ===
                        "cash"
                          ? "Tunai"
                          : "QRIS"}
                      </span>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          transaction.status ===
                          "completed"
                            ? "bg-green-50 text-green-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {transaction.status ===
                        "completed"
                          ? "Selesai"
                          : "Dibatalkan"}
                      </span>

                      <span className="font-bold text-slate-900">
                        {formatRupiah(
                          transaction.total_amount
                        )}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}