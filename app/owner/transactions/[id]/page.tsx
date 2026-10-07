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

  const [transaction, setTransaction] =
    useState<Transaction | null>(null);

  const [items, setItems] = useState<TransactionItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadTransactionDetail() {
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

      if (!profile || profile.role !== "owner") {
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
        setError("Transaksi tidak ditemukan.");
        setLoading(false);
        return;
      }

      const { data: itemData, error: itemError } =
        await supabase
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
        setError(
          `Gagal memuat detail transaksi: ${itemError.message}`
        );
        setLoading(false);
        return;
      }

      setTransaction(transactionData);
      setItems(itemData ?? []);
      setLoading(false);
    }

    loadTransactionDetail();
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
    return value;
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-500">
          Memuat detail transaksi...
        </p>
      </main>
    );
  }

  if (!transaction) {
    return (
      <main className="min-h-screen bg-slate-100">
        <div className="mx-auto max-w-4xl px-4 py-10">
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <p className="text-red-600">
              {error || "Transaksi tidak ditemukan."}
            </p>

            <button
              onClick={() => router.push("/owner/transactions")}
              className="mt-5 cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Kembali ke Transaksi
            </button>
          </div>
        </div>
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
              Detail Transaksi
            </p>
          </div>

          <button
            onClick={() => router.push("/owner/transactions")}
            className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Kembali
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6">
        <section className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900">
            Detail Transaksi
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Informasi lengkap transaksi penjualan.
          </p>
        </section>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span className="font-bold">⚠</span>{" "}
            {error}
          </div>
        )}

        <section className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm text-slate-500">
                Kode Transaksi
              </p>

              <p className="mt-1 text-xl font-bold text-slate-900">
                {transaction.transaction_code}
              </p>

              <p className="mt-2 text-sm text-slate-500">
                {formatDate(transaction.created_at)}
              </p>
            </div>

            <span className="inline-flex w-fit rounded-full bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
              {formatStatus(transaction.status)}
            </span>
          </div>
        </section>

        <section className="mb-6 rounded-2xl bg-white shadow-sm">
          <div className="border-b px-6 py-4">
            <h3 className="font-semibold text-slate-900">
              Produk yang Dibeli
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Daftar produk dalam transaksi ini.
            </p>
          </div>

          {items.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-sm text-slate-500">
                Tidak ada detail produk.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-semibold text-slate-900">
                      {item.product_name}
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      {item.quantity} ×{" "}
                      {formatRupiah(Number(item.price))}
                    </p>
                  </div>

                  <p className="font-semibold text-slate-900">
                    {formatRupiah(Number(item.subtotal))}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="mb-5 font-semibold text-slate-900">
            Ringkasan Pembayaran
          </h3>

          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">
                Metode Pembayaran
              </span>

              <span className="font-medium text-slate-900">
                {formatPaymentMethod(
                  transaction.payment_method
                )}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500">
                Total Transaksi
              </span>

              <span className="font-medium text-slate-900">
                {formatRupiah(
                  Number(transaction.total_amount)
                )}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500">
                Uang Dibayar
              </span>

              <span className="font-medium text-slate-900">
                {formatRupiah(
                  Number(transaction.payment_amount)
                )}
              </span>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">
                  Kembalian
                </span>

                <span className="text-lg font-bold text-slate-900">
                  {formatRupiah(
                    Number(transaction.change_amount)
                  )}
                </span>
              </div>
            </div>
          </div>
        </section>

        <button
          onClick={() => router.push("/owner/transactions")}
          className="w-full cursor-pointer rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-800"
        >
          Kembali ke Daftar Transaksi
        </button>
      </div>
    </main>
  );
}