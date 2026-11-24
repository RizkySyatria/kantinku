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
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-100 bg-white px-8 py-7 shadow-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" />
          <p className="text-sm font-medium text-slate-600">
            Memuat dashboard...
          </p>
        </div>
      </main>
    );
  }

  const todayLabel = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-emerald-100/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-lg font-bold text-white shadow-sm shadow-emerald-700/20">
              <img
                src="icons/logo.png"
                alt="Logo KantinKu"
                className="h-11 w-11 shrink-0 rounded-xl object-cover shadow-sm"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                  KantinKu
                </h1>
                <span className="hidden rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 sm:inline-block">
                  Cashier
                </span>
              </div>
              <p className="text-xs text-slate-500 sm:text-sm">
                Dashboard Kasir
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex min-h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 sm:px-4"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10 17l5-5-5-5" />
              <path d="M15 12H3" />
              <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
            </svg>
            <span>Keluar</span>
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <section className="mb-6 rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-teal-50/70 p-5 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/80 px-3 py-1 text-xs font-semibold text-emerald-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                Shift Kasir Aktif
              </span>
              <h2 className="mt-2.5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Halo, {profile?.full_name || "Cashier"}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Siap melayani transaksi hari ini?
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2 self-start rounded-xl border border-emerald-200/80 bg-white/90 px-3.5 py-2 text-xs font-medium text-slate-600 shadow-2xs sm:self-center">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>{todayLabel}</span>
            </div>
          </div>
        </section>

        <section
          aria-label="Ringkasan kasir hari ini"
          className="grid grid-cols-2 gap-3 sm:gap-4"
        >
          <article className="min-w-0 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition hover:border-emerald-200 sm:p-5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium leading-5 text-slate-500 sm:text-sm">
                Penjualan Hari Ini
              </p>
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-sm font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/15"
                aria-hidden="true"
              >
                ↗
              </span>
            </div>

            <p className="mt-3 break-words text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {formatRupiah(salesToday)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Pendapatan shift ini
            </p>
          </article>

          <article className="min-w-0 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition hover:border-teal-200 sm:p-5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium leading-5 text-slate-500 sm:text-sm">
                Transaksi Hari Ini
              </p>
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-sm font-bold text-teal-700 ring-1 ring-inset ring-teal-600/15"
                aria-hidden="true"
              >
                #
              </span>
            </div>

            <p className="mt-3 break-words text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {transactionCountToday.toLocaleString("id-ID")}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Struk selesai diproses
            </p>
          </article>
        </section>

        <section className="mt-6">
          <button
            type="button"
            onClick={() => router.push("/cashier/pos")}
            className="group relative w-full cursor-pointer overflow-hidden rounded-2xl border border-emerald-700 bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 p-6 text-left text-white shadow-md shadow-emerald-900/15 transition duration-200 hover:-translate-y-0.5 hover:from-emerald-800 hover:to-teal-700 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 active:scale-[0.99]"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-50 ring-1 ring-inset ring-white/25">
                  Point of Sale
                </span>

                <h3 className="mt-3 text-2xl font-bold tracking-tight">
                  Transaksi Baru
                </h3>

                <p className="mt-1.5 text-sm text-emerald-100">
                  Mulai transaksi penjualan dan cetak atau catat pesanan.
                </p>
              </div>

              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-inset ring-white/25 transition group-hover:translate-x-1 group-hover:bg-white group-hover:text-emerald-700">
                <svg
                  className="h-6 w-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </div>
          </button>
        </section>

        <section className="mt-4">
          <button
            type="button"
            onClick={() => router.push("/cashier/history")}
            className="group flex w-full cursor-pointer items-center justify-between gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 active:scale-[0.99]"
          >
            <div className="flex min-w-0 items-center gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/15 transition-colors group-hover:bg-sky-600 group-hover:text-white">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
                  <path d="M9 8h6M9 12h6M9 16h3" />
                </svg>
              </span>

              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900 transition-colors group-hover:text-emerald-800">
                  Riwayat Transaksi
                </h3>

                <p className="mt-0.5 text-sm text-slate-500">
                  Lihat transaksi yang sudah dilakukan.
                </p>
              </div>
            </div>

            <svg
              className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-emerald-600"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </section>

        <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 text-sm font-medium text-emerald-800">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
            </span>
            <span>Status koneksi: Online</span>
          </div>
          <span className="text-xs font-normal text-emerald-700">
            Siap sinkronisasi
          </span>
        </div>
      </div>
    </main>
  );
}