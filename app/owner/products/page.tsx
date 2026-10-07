"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Category = {
  id: number;
  name: string;
  is_active: boolean;
};

type Product = {
  id: number;
  name: string;
  category_id: number | null;
  price: number;
  stock: number;
  min_stock: number;
  unit: string;
  is_active: boolean;
};

export default function ProductsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // ============================================
  // CATEGORY FORM
  // ============================================

  const [categoryName, setCategoryName] = useState("");

  // ============================================
  // PRODUCT FORM
  // ============================================

  const [productName, setProductName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [minStock, setMinStock] = useState("");
  const [unit, setUnit] = useState("pcs");

  // ============================================
  // EDIT PRODUCT
  // ============================================

  const [editingProduct, setEditingProduct] =
    useState<Product | null>(null);

  // ============================================
  // EDIT CATEGORY
  // ============================================

  const [editingCategory, setEditingCategory] =
    useState<Category | null>(null);

  // ============================================
  // NOTIFICATION
  // ============================================

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // ============================================
  // SUBMITTING
  // ============================================

  const [savingCategory, setSavingCategory] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);

  // ============================================
  // LOAD DATA
  // ============================================

  async function loadData() {
    setLoading(true);

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

    const {
      data: categoryData,
      error: categoryError,
    } = await supabase
      .from("categories")
      .select("id, name, is_active")
      .order("name");

    const {
      data: productData,
      error: productError,
    } = await supabase
      .from("products")
      .select(
        "id, name, category_id, price, stock, min_stock, unit, is_active"
      )
      .order("name");

    if (categoryError) {
      setError(categoryError.message);
    }

    if (productError) {
      setError(productError.message);
    }

    setCategories(categoryData ?? []);
    setProducts(productData ?? []);

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  // ============================================
  // ADD CATEGORY
  // ============================================

  async function handleAddCategory(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (savingCategory) {
      return;
    }

    setMessage("");
    setError("");
    setSavingCategory(true);

    const name = categoryName.trim();

    if (!name) {
      setError("Nama kategori wajib diisi.");
      setSavingCategory(false);
      return;
    }

    // Cek kategori yang sudah ada
    const existingCategory = categories.find(
      (category) =>
        category.name.trim().toLowerCase() ===
        name.toLowerCase()
    );

    if (existingCategory) {
      setError(
        `Kategori "${existingCategory.name}" sudah terdaftar.`
      );
      setSavingCategory(false);
      return;
    }

    const { error } = await supabase
      .from("categories")
      .insert({
        name,
        is_active: true,
      });

    if (error) {
      if (error.code === "23505") {
        setError(
          `Kategori "${name}" sudah terdaftar. Gunakan nama kategori lain.`
        );
      } else {
        setError(
          `Gagal menambahkan kategori: ${error.message}`
        );
      }

      setSavingCategory(false);
      return;
    }

    setCategoryName("");
    setMessage(`Kategori "${name}" berhasil ditambahkan.`);

    setSavingCategory(false);

    await loadData();
  }

  // ============================================
  // START EDIT CATEGORY
  // ============================================

  function startEditCategory(category: Category) {
    setEditingCategory(category);
    setCategoryName(category.name);

    setMessage("");
    setError("");
  }

  // ============================================
  // UPDATE CATEGORY
  // ============================================

  async function handleUpdateCategory(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (savingCategory) {
      return;
    }

    setMessage("");
    setError("");
    setSavingCategory(true);

    if (!editingCategory) {
      setSavingCategory(false);
      return;
    }

    const name = categoryName.trim();

    if (!name) {
      setError("Nama kategori wajib diisi.");
      setSavingCategory(false);
      return;
    }

    const duplicateCategory = categories.find(
      (category) =>
        category.id !== editingCategory.id &&
        category.name.trim().toLowerCase() ===
          name.toLowerCase()
    );

    if (duplicateCategory) {
      setError(
        `Kategori "${duplicateCategory.name}" sudah terdaftar.`
      );
      setSavingCategory(false);
      return;
    }

    const { error } = await supabase
      .from("categories")
      .update({
        name,
      })
      .eq("id", editingCategory.id);

    if (error) {
      if (error.code === "23505") {
        setError(
          `Kategori "${name}" sudah terdaftar. Gunakan nama kategori lain.`
        );
      } else {
        setError(
          `Gagal memperbarui kategori: ${error.message}`
        );
      }

      setSavingCategory(false);
      return;
    }

    setEditingCategory(null);
    setCategoryName("");

    setMessage(`Kategori "${name}" berhasil diperbarui.`);

    setSavingCategory(false);

    await loadData();
  }

  // ============================================
  // CANCEL CATEGORY EDIT
  // ============================================

  function cancelCategoryEdit() {
    setEditingCategory(null);
    setCategoryName("");

    setMessage("");
    setError("");
  }

  // ============================================
  // TOGGLE CATEGORY
  // ============================================

  async function handleToggleCategory(
    category: Category
  ) {
    setMessage("");
    setError("");

    const { error } = await supabase
      .from("categories")
      .update({
        is_active: !category.is_active,
      })
      .eq("id", category.id);

    if (error) {
      setError(error.message);
      return;
    }

    setMessage(
      category.is_active
        ? `Kategori "${category.name}" berhasil dinonaktifkan.`
        : `Kategori "${category.name}" berhasil diaktifkan.`
    );

    await loadData();
  }

  // ============================================
  // ADD PRODUCT
  // ============================================

  async function handleAddProduct(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (savingProduct) {
      return;
    }

    setMessage("");
    setError("");
    setSavingProduct(true);

    const name = productName.trim();

    if (!name) {
      setError("Nama produk wajib diisi.");
      setSavingProduct(false);
      return;
    }

    if (!categoryId) {
      setError("Pilih kategori produk.");
      setSavingProduct(false);
      return;
    }

    if (price === "" || Number(price) < 0) {
      setError("Harga produk tidak valid.");
      setSavingProduct(false);
      return;
    }

    if (stock === "" || Number(stock) < 0) {
      setError("Stok produk tidak valid.");
      setSavingProduct(false);
      return;
    }

    if (minStock === "" || Number(minStock) < 0) {
      setError("Minimum stok tidak valid.");
      setSavingProduct(false);
      return;
    }

    // Cek produk duplikat
    const existingProduct = products.find(
      (product) =>
        product.name.trim().toLowerCase() ===
        name.toLowerCase()
    );

    if (existingProduct) {
      setError(
        `Produk "${existingProduct.name}" sudah terdaftar. Gunakan nama produk lain.`
      );
      setSavingProduct(false);
      return;
    }

    const { error } = await supabase
      .from("products")
      .insert({
        name,
        category_id: Number(categoryId),
        price: Number(price),
        stock: Number(stock),
        min_stock: Number(minStock),
        unit: unit.trim() || "pcs",
        is_active: true,
      });

    if (error) {
      if (error.code === "23505") {
        setError(
          `Produk "${name}" sudah terdaftar. Gunakan nama produk lain.`
        );
      } else {
        setError(
          `Gagal menambahkan produk: ${error.message}`
        );
      }

      setSavingProduct(false);
      return;
    }

    resetProductForm();

    setMessage(`Produk "${name}" berhasil ditambahkan.`);

    setSavingProduct(false);

    await loadData();
  }

  // ============================================
  // START EDIT PRODUCT
  // ============================================

  function startEditProduct(product: Product) {
    setEditingProduct(product);

    setProductName(product.name);
    setCategoryId(product.category_id?.toString() ?? "");
    setPrice(product.price.toString());
    setMinStock(product.min_stock.toString());
    setUnit(product.unit);

    setMessage("");
    setError("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  // ============================================
  // UPDATE PRODUCT
  // ============================================

  async function handleUpdateProduct(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (savingProduct) {
      return;
    }

    setMessage("");
    setError("");
    setSavingProduct(true);

    if (!editingProduct) {
      setSavingProduct(false);
      return;
    }

    const name = productName.trim();

    if (!name) {
      setError("Nama produk wajib diisi.");
      setSavingProduct(false);
      return;
    }

    if (!categoryId) {
      setError("Pilih kategori produk.");
      setSavingProduct(false);
      return;
    }

    if (price === "" || Number(price) < 0) {
      setError("Harga produk tidak valid.");
      setSavingProduct(false);
      return;
    }

    if (minStock === "" || Number(minStock) < 0) {
      setError("Minimum stok tidak valid.");
      setSavingProduct(false);
      return;
    }

    // Cek apakah nama produk dipakai produk lain
    const duplicateProduct = products.find(
      (product) =>
        product.id !== editingProduct.id &&
        product.name.trim().toLowerCase() ===
          name.toLowerCase()
    );

    if (duplicateProduct) {
      setError(
        `Produk "${duplicateProduct.name}" sudah terdaftar.`
      );
      setSavingProduct(false);
      return;
    }

    const { error } = await supabase
      .from("products")
      .update({
        name,
        category_id: Number(categoryId),
        price: Number(price),
        min_stock: Number(minStock),
        unit: unit.trim() || "pcs",
      })
      .eq("id", editingProduct.id);

    if (error) {
      if (error.code === "23505") {
        setError(
          `Produk "${name}" sudah terdaftar. Gunakan nama produk lain.`
        );
      } else {
        setError(
          `Gagal memperbarui produk: ${error.message}`
        );
      }

      setSavingProduct(false);
      return;
    }

    resetProductForm();

    setMessage(`Produk "${name}" berhasil diperbarui.`);

    setSavingProduct(false);

    await loadData();
  }

  // ============================================
  // RESET PRODUCT FORM
  // ============================================

  function resetProductForm() {
    setEditingProduct(null);
    setProductName("");
    setCategoryId("");
    setPrice("");
    setStock("");
    setMinStock("");
    setUnit("pcs");
  }

  // ============================================
  // CANCEL PRODUCT EDIT
  // ============================================

  function cancelEdit() {
    resetProductForm();

    setMessage("");
    setError("");
  }

  // ============================================
  // TOGGLE PRODUCT STATUS
  // ============================================

  async function handleToggleProduct(
    id: number,
    currentStatus: boolean
  ) {
    setMessage("");
    setError("");

    const { error } = await supabase
      .from("products")
      .update({
        is_active: !currentStatus,
      })
      .eq("id", id);

    if (error) {
      setError(error.message);
      return;
    }

    setMessage(
      currentStatus
        ? "Produk berhasil dinonaktifkan."
        : "Produk berhasil diaktifkan."
    );

    await loadData();
  }

  // ============================================
  // GET CATEGORY NAME
  // ============================================

  function getCategoryName(categoryId: number | null) {
    const category = categories.find(
      (item) => item.id === categoryId
    );

    return category?.name ?? "-";
  }

  // ============================================
  // LOADING
  // ============================================

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-500">
          Memuat data produk...
        </p>
      </main>
    );
  }

  // ============================================
  // PAGE
  // ============================================

  return (
    <main className="min-h-screen bg-slate-100">
      {/* HEADER */}
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              KantinKu
            </h1>

            <p className="text-sm text-slate-500">
              Produk & Menu
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
        {/* PAGE TITLE */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900">
            Produk & Menu
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Kelola kategori dan produk yang tersedia di kantin.
          </p>
        </div>

        {/* SUCCESS */}
        {message && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            <span className="font-bold">✓</span>

            <span>{message}</span>
          </div>
        )}

        {/* ERROR */}
        {error && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span className="font-bold">⚠</span>

            <span>{error}</span>
          </div>
        )}

        {/* CATEGORY + PRODUCT FORM */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* CATEGORY */}
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">
              {editingCategory
                ? "Edit Kategori"
                : "Tambah Kategori"}
            </h3>

            <form
              onSubmit={
                editingCategory
                  ? handleUpdateCategory
                  : handleAddCategory
              }
              className="mt-4 flex gap-3"
            >
              <input
                type="text"
                placeholder="Contoh: Makanan"
                value={categoryName}
                onChange={(event) =>
                  setCategoryName(event.target.value)
                }
                className="flex-1 rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
              />

              <button
                type="submit"
                disabled={savingCategory}
                className="cursor-pointer rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingCategory
                  ? "Menyimpan..."
                  : editingCategory
                    ? "Simpan"
                    : "Tambah"}
              </button>
            </form>

            {editingCategory && (
              <button
                type="button"
                onClick={cancelCategoryEdit}
                className="mt-3 w-full cursor-pointer rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50"
              >
                Batal Edit Kategori
              </button>
            )}

            {/* CATEGORY LIST */}
            <div className="mt-5 space-y-2">
              {categories.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Belum ada kategori.
                </p>
              ) : (
                categories.map((category) => (
                  <div
                    key={category.id}
                    className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {category.name}
                      </p>

                      {category.is_active ? (
                        <span className="text-xs text-green-600">
                          Aktif
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">
                          Nonaktif
                        </span>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          startEditCategory(category)
                        }
                        className="cursor-pointer text-sm font-medium text-blue-600 hover:underline"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleToggleCategory(category)
                        }
                        className="cursor-pointer text-sm font-medium text-slate-700 hover:underline"
                      >
                        {category.is_active
                          ? "Nonaktifkan"
                          : "Aktifkan"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* PRODUCT FORM */}
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">
              {editingProduct
                ? "Edit Produk"
                : "Tambah Produk"}
            </h3>

            <form
              onSubmit={
                editingProduct
                  ? handleUpdateProduct
                  : handleAddProduct
              }
              className="mt-4 space-y-4"
            >
              {/* PRODUCT NAME */}
              <input
                type="text"
                placeholder="Nama produk"
                value={productName}
                onChange={(event) =>
                  setProductName(event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
              />

              {/* CATEGORY */}
              <select
                value={categoryId}
                onChange={(event) =>
                  setCategoryId(event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
              >
                <option value="">
                  Pilih kategori
                </option>

                {categories
                  .filter((category) => category.is_active)
                  .map((category) => (
                    <option
                      key={category.id}
                      value={category.id}
                    >
                      {category.name}
                    </option>
                  ))}
              </select>

              {/* PRICE + STOCK */}
              <div
                className={
                  editingProduct
                    ? "grid grid-cols-1 gap-3"
                    : "grid grid-cols-2 gap-3"
                }
              >
                <input
                  type="number"
                  min="0"
                  placeholder="Harga"
                  value={price}
                  onChange={(event) =>
                    setPrice(event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
                />

                {!editingProduct && (
                  <input
                    type="number"
                    min="0"
                    placeholder="Stok"
                    value={stock}
                    onChange={(event) =>
                      setStock(event.target.value)
                    }
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
                  />
                )}
              </div>

              {/* MIN STOCK + UNIT */}
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  min="0"
                  placeholder="Minimum stok"
                  value={minStock}
                  onChange={(event) =>
                    setMinStock(event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
                />

                <input
                  type="text"
                  placeholder="Satuan"
                  value={unit}
                  onChange={(event) =>
                    setUnit(event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
                />
              </div>

              {/* SAVE */}
              <button
                type="submit"
                disabled={savingProduct}
                className="w-full cursor-pointer rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingProduct
                  ? "Menyimpan..."
                  : editingProduct
                    ? "Simpan Perubahan"
                    : "Simpan Produk"}
              </button>

              {/* CANCEL */}
              {editingProduct && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="w-full cursor-pointer rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Batal Edit
                </button>
              )}
            </form>
          </section>
        </div>

        {/* PRODUCT LIST */}
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                Daftar Produk
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                {products.length} produk terdaftar.
              </p>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[750px] text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="px-3 py-3">
                    Produk
                  </th>

                  <th className="px-3 py-3">
                    Kategori
                  </th>

                  <th className="px-3 py-3">
                    Harga
                  </th>

                  <th className="px-3 py-3">
                    Stok
                  </th>

                  <th className="px-3 py-3">
                    Status
                  </th>

                  <th className="px-3 py-3">
                    Aksi
                  </th>
                </tr>
              </thead>

              <tbody>
                {products.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-8 text-center text-slate-500"
                    >
                      Belum ada produk.
                    </td>
                  </tr>
                ) : (
                  products.map((product) => (
                    <tr
                      key={product.id}
                      className="border-b last:border-0"
                    >
                      <td className="px-3 py-4 font-medium text-slate-900">
                        {product.name}
                      </td>

                      <td className="px-3 py-4 text-slate-600">
                        {getCategoryName(
                          product.category_id
                        )}
                      </td>

                      <td className="px-3 py-4 text-slate-600">
                        Rp
                        {product.price.toLocaleString(
                          "id-ID"
                        )}
                      </td>

                      <td className="px-3 py-4 text-slate-600">
                        {product.stock} {product.unit}
                      </td>

                      <td className="px-3 py-4">
                        {product.is_active ? (
                          <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                            Aktif
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                            Nonaktif
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-4">
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              startEditProduct(product)
                            }
                            className="cursor-pointer text-sm font-medium text-blue-600 hover:underline"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleToggleProduct(
                                product.id,
                                product.is_active
                              )
                            }
                            className="cursor-pointer text-sm font-medium text-slate-700 hover:underline"
                          >
                            {product.is_active
                              ? "Nonaktifkan"
                              : "Aktifkan"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}