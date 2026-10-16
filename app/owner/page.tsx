
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

type ProductStock = {
  stock: number;
  min_stock: number;
  is_active: boolean;
};

const navigationItems = [
  {
    title: "Produk & Menu",
    description: "Kelola produk, harga, kategori, dan status produk.",
    href: "/owner/products",
    icon: "package",
    accent: "bg-blue-50 text-blue-700",
  },
  {
    title: "Persediaan",
    description: "Pantau dan kelola stok barang kantin.",
    href: "/owner/inventory",
    icon: "boxes",
    accent: "bg-emerald-50 text-emerald-700",
  },
  {
    title: "Transaksi",
    description:
      "Lihat seluruh transaksi penjualan dan riwayat pembayaran.",
    href: "/owner/transactions",
    icon: "receipt",
    accent: "bg-violet-50 text-violet-700",
  },
  {
    title: "Analytics",
    description: "Lihat penjualan, tren, dan produk terlaris.",
    href: "/owner/analytics",
    icon: "chart",
    accent: "bg-amber-50 text-amber-700",
  },
  {
    title: "Laporan",
    description: "Lihat laporan penjualan dan ekspor data transaksi.",
    href: "/owner/reports",
    icon: "file",
    accent: "bg-rose-50 text-rose-700",
  },
] as const;

function MenuIcon({ name }: { name: string }) {
  const commonProps = {
    className: "h-6 w-6",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
  };

  switch (name) {
    case "package":
      return (
        <svg {...commonProps}>
          <path d="m12 3 9 5-9 5-9-5 9-5Z" />
          <path d="M3 8v8l9 5 9-5V8" />
          <path d="M12 13v8" />
        </svg>
      );
    case "boxes":
      return (
        <svg {...commonProps}>
          <rect x="3" y="4" width="8" height="7" rx="1" />
          <rect x="13" y="4" width="8" height="7" rx="1" />
          <rect x="3" y="13" width="8" height="7" rx="1" />
          <rect x="13" y="13" width="8" height="7" rx="1" />
        </svg>
      );
    case "receipt":
      return (
        <svg {...commonProps}>
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
          <path d="M9 8h6M9 12h6M9 16h3" />
        </svg>
      );
    case "chart":
      return (
        <svg {...commonProps}>
          <path d="M3 3v18h18" />
          <path d="m7 14 4-4 4 3 5-7" />
        </svg>
      );
    default:
      return (
        <svg {...commonProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6M8 13h8M8 17h8" />
        </svg>
      );
  }
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function OwnerPage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const [salesToday, setSalesToday] = useState(0);
  const [transactionCountToday, setTransactionCountToday] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);

  useEffect(() => {
    async function loadProfile() {
      try {
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

        if (!data || data.role !== "owner") {
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

        const [
          { data: todayTransactions, error: transactionError },
          { data: products, error: productError },
        ] = await Promise.all([
          supabase
            .from("transactions")
            .select("total_amount")
            .eq("status", "completed")
            .gte("created_at", startOfToday.toISOString())
            .lt("created_at", startOfTomorrow.toISOString()),

          supabase
            .from("products")
            .select("stock, min_stock, is_active"),
        ]);

        if (!transactionError) {
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

        if (!productError) {
          const productData = (products as ProductStock[]) ?? [];

          const activeProducts = productData.filter(
            (product) => product.is_active
          );

          const lowStockProducts = activeProducts.filter(
            (product) => product.stock <= product.min_stock
          );

          setProductCount(activeProducts.length);
          setLowStockCount(lowStockProducts.length);
        }
      } catch (error) {
        console.error("Gagal memuat dashboard Owner:", error);
      } finally {
        setLoading(false);
      }
    }

    void loadProfile();
  }, [router, supabase]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-8 py-7 shadow-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-800" />
          <p className="text-sm font-medium text-slate-600">
            Memuat dashboard...
          </p>
        </div>
      </main>
    );
  }

  const statistics = [
    {
      label: "Penjualan Hari Ini",
      value: formatRupiah(salesToday),
      note: "Total transaksi selesai",
      icon: "↗",
      accent: "bg-blue-50 text-blue-700",
    },
    {
      label: "Transaksi",
      value: transactionCountToday.toLocaleString("id-ID"),
      note: "Transaksi hari ini",
      icon: "#",
      accent: "bg-violet-50 text-violet-700",
    },
    {
      label: "Produk",
      value: productCount.toLocaleString("id-ID"),
      note: "Produk aktif",
      icon: "□",
      accent: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Stok Menipis",
      value: lowStockCount.toLocaleString("id-ID"),
      note: "Perlu diperiksa",
      icon: "!",
      accent:
        lowStockCount > 0
          ? "bg-amber-50 text-amber-700"
          : "bg-slate-100 text-slate-600",
    },
  ];

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-lg font-bold text-white shadow-sm">
              K
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                KantinKu
              </h1>
              <p className="text-xs text-slate-500 sm:text-sm">
                Dashboard Owner
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex min-h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 sm:px-4"
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

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <section className="mb-7 sm:mb-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Ringkasan operasional
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Selamat datang, {profile?.full_name || "Owner"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            Pantau kinerja penjualan dan kelola operasional kantin dari satu tempat.
          </p>
        </section>

        <section aria-label="Statistik kantin">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-base font-bold text-slate-900 sm:text-lg">
              Ringkasan Hari Ini
            </h3>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
              Hari ini
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {statistics.map((item) => (
              <article
                key={item.label}
                className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium leading-5 text-slate-500 sm:text-sm">
                    {item.label}
                  </p>
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base font-bold ${item.accent}`}
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>
                </div>

                <p className="mt-4 break-words text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                  {item.value}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {item.note}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8 sm:mt-10">
          <div className="mb-4">
            <h3 className="text-base font-bold text-slate-900 sm:text-lg">
              Menu Manajemen
            </h3>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              Pilih menu untuk mengelola dan memantau kegiatan kantin.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {navigationItems.map((item) => (
              <button
                key={item.href}
                type="button"
                onClick={() => router.push(item.href)}
                className="group flex min-h-32 w-full cursor-pointer items-start gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 sm:p-5"
              >
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${item.accent}`}
                >
                  <MenuIcon name={item.icon} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {item.title}
                    </span>
                    <svg
                      className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700"
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
                  </span>
                  <span className="mt-2 block text-sm leading-5 text-slate-600">
                    {item.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <footer className="mt-8 border-t border-slate-200 py-5 text-center sm:mt-10">
          <p className="text-xs text-slate-500">
            KantinKu · Platform Manajemen Kantin Kampus
          </p>
        </footer>
      </div>
    </main>
  );
}
