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

      if (!profile || profile.role !== "owner") {
        router.replace("/login");
        return;
      }

    let query = supabase
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
        );

    if (filterStartDate) {
        const start = new Date(`${filterStartDate}T00:00:00`);

        query = query.gte(
            "created_at",
            start.toISOString()
        );
    }

    if (filterEndDate) {
        const end = new Date(`${filterEndDate}T00:00:00`);

        end.setDate(end.getDate() + 1);

        query = query.lt(
            "created_at",
            end.toISOString()
        );
    }

    const { data, error } = await query.order("created_at", {
        ascending: false,
    });

      if (error) {
        setError(`Gagal memuat transaksi: ${error.message}`);
        setLoading(false);
        return;
      }

      setTransactions(data ?? []);
      setLoading(false);
    }

    loadTransactions();
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
    return value;
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

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-500">Memuat transaksi...</p>
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
              Transaksi Penjualan
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
            Seluruh Transaksi
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Lihat transaksi penjualan yang telah dilakukan oleh cashier.
          </p>
        </section>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span className="font-bold">⚠</span>{" "}
            {error}
          </div>
        )}

        <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-4">
                <h3 className="font-semibold text-slate-900">
                Filter Periode
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                Tampilkan transaksi berdasarkan periode tanggal.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
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
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
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
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                />
                </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
                <button
                type="button"
                onClick={handleApplyFilter}
                className="cursor-pointer rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                Tampilkan
                </button>

                <button
                type="button"
                onClick={handleResetFilter}
                className="cursor-pointer rounded-lg border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                Reset
                </button>
            </div>

            {(filterStartDate || filterEndDate) && (
                <p className="mt-4 text-sm text-slate-500">
                Filter aktif:
                {" "}
                {filterStartDate || "Semua"}
                {" "}
                sampai
                {" "}
                {filterEndDate || "Semua"}
                </p>
            )}
        </section>

        <section className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Total Transaksi
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {transactions.length}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Total Penjualan
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {formatRupiah(
                transactions.reduce(
                  (total, transaction) =>
                    total + Number(transaction.total_amount),
                  0
                )
              )}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Transaksi Selesai
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {
                transactions.filter(
                  (transaction) =>
                    transaction.status === "completed"
                ).length
              }
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="border-b px-5 py-4">
            <h3 className="font-semibold text-slate-900">
              Daftar Transaksi
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Transaksi terbaru ditampilkan terlebih dahulu.
            </p>
          </div>

          {transactions.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-slate-500">
                Belum ada transaksi.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead className="bg-slate-50">
                  <tr className="text-left text-sm text-slate-500">
                    <th className="px-5 py-4 font-medium">
                      Kode Transaksi
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Tanggal
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Pembayaran
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Total
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Status
                    </th>

                    <th className="px-5 py-4 font-medium">
                      Aksi
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {transactions.map((transaction) => (
                    <tr
                      key={transaction.id}
                      className="text-sm"
                    >
                      <td className="px-5 py-4 font-medium text-slate-900">
                        {transaction.transaction_code}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {formatDate(transaction.created_at)}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {formatPaymentMethod(
                          transaction.payment_method
                        )}
                      </td>

                      <td className="px-5 py-4 font-semibold text-slate-900">
                        {formatRupiah(
                          Number(transaction.total_amount)
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <span className="inline-flex rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                          {formatStatus(transaction.status)}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <button
                            type="button"
                            className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            onClick={() =>
                                router.push(`/owner/transactions/${transaction.id}`)
                            }
                            >
                            Detail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}