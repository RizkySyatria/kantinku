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

export default function OwnerPage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const [salesToday, setSalesToday] = useState(0);
  const [transactionCountToday, setTransactionCountToday] =
    useState(0);
  const [productCount, setProductCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);

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
        const productData =
          (products as ProductStock[]) ?? [];

        const activeProducts = productData.filter(
          (product) => product.is_active
        );

        const lowStockProducts = activeProducts.filter(
          (product) => product.stock <= product.min_stock
        );

        setProductCount(activeProducts.length);
        setLowStockCount(lowStockProducts.length);
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
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              KantinKu
            </h1>
            <p className="text-sm text-slate-500">
              Dashboard Owner
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Keluar
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <section className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900">
            Selamat datang, {profile?.full_name}
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Kelola operasional dan pantau kinerja kantin.
          </p>
        </section>

        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
              Transaksi
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {transactionCountToday}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Produk
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {productCount}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Stok Menipis
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {lowStockCount}
            </p>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <button
            onClick={() => router.push("/owner/products")}
            className="cursor-pointer rounded-2xl bg-white p-6 text-left shadow-sm hover:shadow-md"
          >
            <h3 className="font-semibold text-slate-900">
              Produk & Menu
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              Kelola produk, harga, kategori, dan status produk.
            </p>
          </button>

          <button
            onClick={() => router.push("/owner/inventory")}
            className="cursor-pointer rounded-2xl bg-white p-6 text-left shadow-sm hover:shadow-md"
          >
            <h3 className="font-semibold text-slate-900">
              Persediaan
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              Pantau dan kelola stok barang kantin.
            </p>
          </button>

          <button
            onClick={() => router.push("/owner/transactions")}
            className="cursor-pointer rounded-2xl bg-white p-6 text-left shadow-sm hover:shadow-md"
          >
            <h3 className="font-semibold text-slate-900">
              Transaksi
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              Lihat seluruh transaksi penjualan dan riwayat pembayaran.
            </p>
          </button>

          <button
            onClick={() => router.push("/owner/analytics")}
            className="cursor-pointer rounded-2xl bg-white p-6 text-left shadow-sm hover:shadow-md"
          >
            <h3 className="font-semibold text-slate-900">
              Analytics
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              Lihat penjualan, tren, dan produk terlaris.
            </p>
          </button>

          <button
            onClick={() => router.push("/owner/reports")}
            className="cursor-pointer rounded-2xl bg-white p-6 text-left shadow-sm hover:shadow-md"
          >
            <h3 className="font-semibold text-slate-900">
              Laporan
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              Lihat laporan penjualan dan ekspor data transaksi.
            </p>
          </button>
        </section>
      </div>
    </main>
  );
}