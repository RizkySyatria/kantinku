"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Product = {
  id: number;
  name: string;
  stock: number;
  min_stock: number;
  unit: string;
  is_active: boolean;
};

type InventoryRecord = {
  id: number;
  product_id: number;
  type: "in" | "out" | "adjustment";
  quantity: number;
  note: string | null;
  created_at: string;
};

export default function OwnerInventoryPage() {
  const router = useRouter();
  const supabase = createClient();

  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [showForm, setShowForm] = useState(false);

  const [formType, setFormType] = useState<"in" | "adjustment">("in");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");

  async function loadData() {
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

    const [
      { data: productData, error: productError },
      { data: inventoryData, error: inventoryError },
    ] = await Promise.all([
      supabase
        .from("products")
        .select(
          "id, name, stock, min_stock, unit, is_active"
        )
        .eq("is_active", true)
        .order("name", { ascending: true }),

      supabase
        .from("inventory")
        .select(
          "id, product_id, type, quantity, note, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (productError) {
      setError(
        `Gagal memuat produk: ${productError.message}`
      );
      setLoading(false);
      return;
    }

    if (inventoryError) {
      setError(
        `Gagal memuat riwayat inventory: ${inventoryError.message}`
      );
      setLoading(false);
      return;
    }

    setProducts(productData ?? []);
    setInventory(inventoryData ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  function resetForm() {
    setFormType("in");
    setSelectedProductId("");
    setQuantity("");
    setNote("");
    setShowForm(false);
  }

  function openAddStockForm(productId?: number) {
    setMessage("");
    setError("");
    setFormType("in");
    setSelectedProductId(
      productId ? String(productId) : ""
    );
    setQuantity("");
    setNote("");
    setShowForm(true);
  }

  function openAdjustmentForm(productId?: number) {
    setMessage("");
    setError("");
    setFormType("adjustment");

    if (productId) {
      const product = products.find(
        (item) => item.id === productId
      );

      setSelectedProductId(String(productId));
      setQuantity(product ? String(product.stock) : "");
    } else {
      setSelectedProductId("");
      setQuantity("");
    }

    setNote("");
    setShowForm(true);
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (saving) return;

    setMessage("");
    setError("");

    if (!selectedProductId) {
      setError("Pilih produk terlebih dahulu.");
      return;
    }

    if (quantity === "") {
      setError("Jumlah stok wajib diisi.");
      return;
    }

    const parsedQuantity = Number(quantity);

    if (
      !Number.isInteger(parsedQuantity) ||
      parsedQuantity < 0
    ) {
      setError(
        "Jumlah stok harus berupa angka bulat dan tidak boleh negatif."
      );
      return;
    }

    if (formType === "in" && parsedQuantity <= 0) {
      setError(
        "Jumlah stok masuk harus lebih dari 0."
      );
      return;
    }

    const product = products.find(
      (item) => item.id === Number(selectedProductId)
    );

    if (!product) {
      setError("Produk tidak ditemukan.");
      return;
    }

    setSaving(true);

    const { data, error: rpcError } =
      await supabase.rpc("owner_adjust_inventory", {
        p_product_id: Number(selectedProductId),
        p_type: formType,
        p_quantity: parsedQuantity,
        p_note:
          note.trim() ||
          (formType === "in"
            ? "Penambahan stok"
            : "Koreksi stok"),
        p_supplier_id: null,
      });

    if (rpcError) {
      setError(
        `Gagal memperbarui stok: ${rpcError.message}`
      );
      setSaving(false);
      return;
    }

    setMessage(
      formType === "in"
        ? `Stok ${product.name} berhasil ditambahkan. Stok sekarang: ${data} ${product.unit}.`
        : `Stok ${product.name} berhasil dikoreksi. Stok sekarang: ${data} ${product.unit}.`
    );

    resetForm();
    setSaving(false);

    await loadData();
  }

  function getProductName(productId: number) {
    const product = products.find(
      (item) => item.id === productId
    );

    return product?.name ?? "Produk";
  }

  function getProductUnit(productId: number) {
    const product = products.find(
      (item) => item.id === productId
    );

    return product?.unit ?? "pcs";
  }

  function getStockStatus(product: Product) {
    if (product.stock === 0) {
      return {
        label: "Habis",
        className:
          "bg-red-50 text-red-700",
      };
    }

    if (product.stock <= product.min_stock) {
      return {
        label: "Menipis",
        className:
          "bg-orange-50 text-orange-700",
      };
    }

    return {
      label: "Aman",
      className:
        "bg-green-50 text-green-700",
    };
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
          Memuat inventory...
        </p>
      </main>
    );
  }

  const totalProducts = products.length;

  const safeStockCount = products.filter(
    (product) =>
      product.stock > 0 &&
      product.stock > product.min_stock
  ).length;

  const lowStockCount = products.filter(
    (product) =>
      product.stock > 0 &&
      product.stock <= product.min_stock
  ).length;

  const outOfStockCount = products.filter(
    (product) => product.stock === 0
  ).length;

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              KantinKu
            </h1>

            <p className="text-sm text-slate-500">
              Persediaan
            </p>
          </div>

          <button
            type="button"
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
            Persediaan
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Pantau dan kelola stok produk kantin.
          </p>
        </section>

        {message && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            <span className="font-bold">✓</span>
            <span>{message}</span>
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span className="font-bold">⚠</span>
            <span>{error}</span>
          </div>
        )}

        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Total Produk
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {totalProducts}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Stok Aman
            </p>

            <p className="mt-2 text-2xl font-bold text-green-700">
              {safeStockCount}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Stok Menipis
            </p>

            <p className="mt-2 text-2xl font-bold text-orange-600">
              {lowStockCount}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Stok Habis
            </p>

            <p className="mt-2 text-2xl font-bold text-red-600">
              {outOfStockCount}
            </p>
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Daftar Stok
              </h3>

              <p className="text-sm text-slate-500">
                Stok saat ini berdasarkan produk aktif.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => openAddStockForm()}
                className="cursor-pointer rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                + Tambah Stok
              </button>

              <button
                type="button"
                onClick={() => openAdjustmentForm()}
                className="cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Koreksi Stok
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            {products.length === 0 ? (
              <div className="p-8 text-center">
                <p className="font-medium text-slate-700">
                  Belum ada produk aktif.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {products.map((product) => {
                  const status =
                    getStockStatus(product);

                  return (
                    <div
                      key={product.id}
                      className="px-5 py-5"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <h4 className="font-semibold text-slate-900">
                            {product.name}
                          </h4>

                          <p className="mt-1 text-sm text-slate-500">
                            Minimum stok:{" "}
                            {product.min_stock}{" "}
                            {product.unit}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <div className="text-right">
                            <p className="text-lg font-bold text-slate-900">
                              {product.stock}{" "}
                              {product.unit}
                            </p>

                            <p className="text-xs text-slate-500">
                              Stok saat ini
                            </p>
                          </div>

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ${status.className}`}
                          >
                            {status.label}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              openAddStockForm(
                                product.id
                              )
                            }
                            className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Tambah
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              openAdjustmentForm(
                                product.id
                              )
                            }
                            className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Koreksi
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {showForm && (
          <section className="mt-6">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="mb-5">
                <h3 className="text-lg font-bold text-slate-900">
                  {formType === "in"
                    ? "Tambah Stok"
                    : "Koreksi Stok"}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {formType === "in"
                    ? "Tambahkan stok produk yang baru masuk."
                    : "Sesuaikan stok produk dengan kondisi stok sebenarnya."}
                </p>
              </div>

              <form
                onSubmit={handleSubmit}
                className="space-y-4"
              >
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Jenis Perubahan
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setFormType("in");
                        setQuantity("");
                      }}
                      className={`cursor-pointer rounded-xl border p-4 text-left ${
                        formType === "in"
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      <p className="font-semibold">
                        Stok Masuk
                      </p>

                      <p
                        className={`mt-1 text-xs ${
                          formType === "in"
                            ? "text-slate-300"
                            : "text-slate-500"
                        }`}
                      >
                        Menambah jumlah stok.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setFormType("adjustment");

                        const product =
                          products.find(
                            (item) =>
                              item.id ===
                              Number(
                                selectedProductId
                              )
                          );

                        setQuantity(
                          product
                            ? String(product.stock)
                            : ""
                        );
                      }}
                      className={`cursor-pointer rounded-xl border p-4 text-left ${
                        formType === "adjustment"
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      <p className="font-semibold">
                        Koreksi Stok
                      </p>

                      <p
                        className={`mt-1 text-xs ${
                          formType === "adjustment"
                            ? "text-slate-300"
                            : "text-slate-500"
                        }`}
                      >
                        Menyesuaikan stok sebenarnya.
                      </p>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Produk
                  </label>

                  <select
                    value={selectedProductId}
                    onChange={(event) => {
                      const value =
                        event.target.value;

                      setSelectedProductId(value);

                      if (formType === "adjustment") {
                        const product =
                          products.find(
                            (item) =>
                              item.id ===
                              Number(value)
                          );

                        setQuantity(
                          product
                            ? String(product.stock)
                            : ""
                        );
                      }
                    }}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-900"
                  >
                    <option value="">
                      Pilih produk
                    </option>

                    {products.map((product) => (
                      <option
                        key={product.id}
                        value={product.id}
                      >
                        {product.name} — stok{" "}
                        {product.stock}{" "}
                        {product.unit}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    {formType === "in"
                      ? "Jumlah Stok Masuk"
                      : "Stok Setelah Koreksi"}
                  </label>

                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={quantity}
                    onChange={(event) =>
                      setQuantity(
                        event.target.value
                      )
                    }
                    placeholder={
                      formType === "in"
                        ? "Contoh: 20"
                        : "Contoh: 15"
                    }
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-900"
                  />

                  {formType === "adjustment" && (
                    <p className="mt-1 text-xs text-slate-500">
                      Masukkan jumlah stok akhir yang
                      sebenarnya.
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Catatan
                  </label>

                  <textarea
                    value={note}
                    onChange={(event) =>
                      setNote(event.target.value)
                    }
                    rows={3}
                    placeholder={
                      formType === "in"
                        ? "Contoh: Restock barang dari pemasok"
                        : "Contoh: Hasil pengecekan stok fisik"
                    }
                    className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-900"
                  />
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={resetForm}
                    disabled={saving}
                    className="cursor-pointer rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Batal
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className="cursor-pointer rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving
                      ? "Menyimpan..."
                      : "Simpan Perubahan"}
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}

        <section className="mt-6">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-slate-900">
              Riwayat Pergerakan Stok
            </h3>

            <p className="text-sm text-slate-500">
              Menampilkan perubahan stok terbaru.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            {inventory.length === 0 ? (
              <div className="p-8 text-center">
                <p className="font-medium text-slate-700">
                  Belum ada riwayat inventory.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {inventory.map((item) => (
                  <div
                    key={item.id}
                    className="px-5 py-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {getProductName(
                            item.product_id
                          )}
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          {item.note ||
                            "Tidak ada catatan"}
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          {formatDateTime(
                            item.created_at
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            item.type === "in"
                              ? "bg-green-50 text-green-700"
                              : item.type === "out"
                              ? "bg-red-50 text-red-700"
                              : "bg-blue-50 text-blue-700"
                          }`}
                        >
                          {item.type === "in"
                            ? "Stok Masuk"
                            : item.type === "out"
                            ? "Stok Keluar"
                            : "Koreksi"}
                        </span>

                        <span
                          className={`font-bold ${
                            item.type === "in"
                              ? "text-green-700"
                              : item.type === "out"
                              ? "text-red-700"
                              : "text-blue-700"
                          }`}
                        >
                          {item.type === "in"
                            ? "+"
                            : item.type === "out"
                            ? "-"
                            : ""}
                          {item.quantity}{" "}
                          {getProductUnit(
                            item.product_id
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}