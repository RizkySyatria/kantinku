"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Profile = {
  full_name: string;
  role: string;
};

type TodayTransaction = {
  total_amount: number;
};

export default function CashierPage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const [salesToday, setSalesToday] = useState(0);
  const [transactionCountToday, setTransactionCountToday] =
    useState(0);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("id", user.id)
        .single();

      if (!data || data.role !== "cashier") {
        router.replace("/login");
        return;
      }

      setProfile(data);

      const now = new Date();

      const startOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );

      const startOfTomorrow = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1
      );

      const { data: todayTransactions, error } =
        await supabase
          .from("transactions")
          .select("total_amount")
          .eq("cashier_id", user.id)
          .eq("status", "completed")
          .gte("created_at", startOfToday.toISOString())
          .lt("created_at", startOfTomorrow.toISOString());

      if (!error) {
        const transactions =
          (todayTransactions as TodayTransaction[]) ?? [];

        const totalSales = transactions.reduce(
          (total, transaction) =>
            total + Number(transaction.total_amount),
          0
        );

        setSalesToday(totalSales);
        setTransactionCountToday(transactions.length);
      }

      setLoading(false);
    }

    loadProfile();
  }, [router, supabase]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function formatRupiah(value: number) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(value);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-slate-500">Memuat dashboard...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              KantinKu
            </h1>
            <p className="text-sm text-slate-500">
              Dashboard Cashier
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="cursor-pointer border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Keluar
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-6">
        <section className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900">
            Halo, {profile?.full_name}
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Siap melayani transaksi hari ini?
          </p>
        </section>

        <section className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Penjualan Hari Ini
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {formatRupiah(salesToday)}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Transaksi Hari Ini
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {transactionCountToday}
            </p>
          </div>
        </section>

        <section className="mt-6">
          <button
            onClick={() => router.push("/cashier/pos")}
            className="w-full rounded-2xl cursor-pointer bg-slate-900 p-6 text-left text-white shadow-sm hover:bg-slate-800"
          >
            <p className="text-sm text-slate-300">
              Point of Sale
            </p>

            <h3 className="mt-1 text-2xl font-bold">
              Transaksi Baru
            </h3>

            <p className="mt-2 text-sm text-slate-300">
              Mulai transaksi penjualan.
            </p>
          </button>
        </section>

        <section className="mt-4">
          <button
            onClick={() => router.push("/cashier/history")}
            className="w-full rounded-2xl cursor-pointer bg-white p-5 text-left shadow-sm hover:shadow-md"
          >
            <h3 className="font-semibold text-slate-900">
              Riwayat Transaksi
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Lihat transaksi yang sudah dilakukan.
            </p>
          </button>
        </section>

        <div className="mt-6 rounded-xl bg-orange-50 px-4 py-3 text-sm text-orange-700">
          Status koneksi: Online
        </div>
      </div>
    </main>
  );
}