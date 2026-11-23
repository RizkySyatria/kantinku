"use client";

import { useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

import { saveOfflineTransaction } from "@/lib/offline/db";

import {
  syncOfflineTransactions,
  getPendingTransactionCount,
  cacheProducts,
  getCachedProducts,
  cacheCategories,
  getCachedCategories,
} from "@/lib/offline/db";

type Product = {
  id: number;
  name: string;
  category_id: number | null;
  price: number;
  stock: number;
  unit: string;
  is_active: boolean;
};

type Category = {
  id: number;
  name: string;
  is_active: boolean;
};

type CartItem = {
  product: Product;
  quantity: number;
};

type PaymentMethod = "cash" | "qris";

export default function CashierPOSPage() {
  const router = useRouter();
  const supabase = createClient();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [searchProduct, setSearchProduct] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cartFeedback, setCartFeedback] = useState("");
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  const [showPayment, setShowPayment] = useState(false);

  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("cash");

  const [paymentAmount, setPaymentAmount] = useState("");

  const [transactionSuccess, setTransactionSuccess] = useState<{
    transactionId: number;
    transactionCode: string;
    createdAt: string;
    totalAmount: number;
    paymentAmount: number;
    changeAmount: number;
    paymentMethod: PaymentMethod;
    isOffline: boolean;
  } | null>(null);

  const [processingPayment, setProcessingPayment] = useState(false);

  async function loadProducts() {
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

    const [productResult, categoryResult] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, category_id, price, stock, unit, is_active")
        .eq("is_active", true)
        .order("name"),

      supabase
        .from("categories")
        .select("id, name, is_active")
        .eq("is_active", true)
        .order("name"),
    ]);

    if (!productResult.error && productResult.data) {
      setProducts(productResult.data);

      await cacheProducts(productResult.data);

      if (!categoryResult.error && categoryResult.data) {
        setCategories(categoryResult.data);
        await cacheCategories(categoryResult.data);
      } else {
        const cachedCategories = await getCachedCategories();
        setCategories(cachedCategories);
      }

      setLoading(false);
      return;
    }

    const [cachedProducts, cachedCategories] = await Promise.all([
      getCachedProducts(),
      getCachedCategories(),
    ]);

    if (cachedProducts.length > 0) {
      setProducts(cachedProducts);
      setCategories(cachedCategories);

      setMessage(
        "Offline: menggunakan data produk dan kategori yang tersimpan di perangkat."
      );
    } else {
      setError(
        "Tidak dapat memuat produk. Belum ada data produk yang tersimpan di perangkat."
      );
    }

    setLoading(false);
  }

  useEffect(() => {
    loadProducts();
  }, []);

  
  useEffect(() => {
    let isMounted = true;

    async function syncPendingTransactions() {
      try {
        // Jika offline, cukup perbarui jumlah pending.
        if (!navigator.onLine) {
          if (isMounted) {
            await refreshPendingCount();
          }
          return;
        }

        // Jalankan sinkronisasi transaksi offline.
        const result = await syncOfflineTransactions();

        console.log("Offline sync result:", result);

        // Perbarui stok produk jika transaksi berhasil disinkronkan.
        if (result.synced > 0) {
          await loadProducts();
        }

        // Hitung ulang pending setelah proses sync selesai.
        if (isMounted) {
          await refreshPendingCount();
        }
      } catch (error) {
        console.error(
          "Gagal menjalankan sinkronisasi offline:",
          error
        );

        // Jika sync gagal, tetap tampilkan jumlah pending terbaru.
        if (isMounted) {
          await refreshPendingCount();
        }
      }
    }

    // Periksa status pending saat halaman pertama kali dibuka.
    void syncPendingTransactions();

    // Coba sinkronisasi kembali ketika internet tersedia.
    function handleOnline() {
      void syncPendingTransactions();
    }

    window.addEventListener("online", handleOnline);

    return () => {
      isMounted = false;
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  useEffect(() => {
    function updateOnlineStatus() {
      setIsOnline(navigator.onLine);
    }

    updateOnlineStatus();

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    return () => {
      window.removeEventListener(
        "online",
        updateOnlineStatus
      );

      window.removeEventListener(
        "offline",
        updateOnlineStatus
      );
    };
  }, []);

  function addToCart(product: Product) {
    setError("");
    setMessage("");

    if (product.stock <= 0) {
      setCartFeedback("");
      setError(`${product.name} sedang habis.`);
      return;
    }

    const existingItem = cart.find(
      (item) => item.product.id === product.id
    );

    if (existingItem && existingItem.quantity >= product.stock) {
      setCartFeedback("");
      setError(
        `Stok ${product.name} hanya ${product.stock} ${product.unit}.`
      );
      return;
    }

    setCart((currentCart) => {
      const currentItem = currentCart.find(
        (item) => item.product.id === product.id
      );

      if (!currentItem) {
        return [...currentCart, { product, quantity: 1 }];
      }

      return currentCart.map((item) =>
        item.product.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      );
    });

    const nextQuantity = (existingItem?.quantity ?? 0) + 1;
    setCartFeedback(
      `${product.name} ditambahkan · ${nextQuantity} di keranjang`
    );
  }

  function increaseQuantity(productId: number) {
    setError("");
    setMessage("");

    const selectedItem = cart.find(
      (item) => item.product.id === productId
    );

    if (!selectedItem) return;

    if (selectedItem.quantity >= selectedItem.product.stock) {
      setError(
        `Stok ${selectedItem.product.name} hanya ${selectedItem.product.stock} ${selectedItem.product.unit}.`
      );
      return;
    }

    setCart((currentCart) =>
      currentCart.map((item) =>
        item.product.id === productId
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    );
    setCartFeedback(
      `Jumlah ${selectedItem.product.name} menjadi ${selectedItem.quantity + 1}`
    );
  }

  function decreaseQuantity(productId: number) {
    setError("");
    setMessage("");

    const selectedItem = cart.find(
      (item) => item.product.id === productId
    );

    if (!selectedItem) return;

    setCart((currentCart) =>
      currentCart
        .map((item) =>
          item.product.id === productId
            ? { ...item, quantity: item.quantity - 1 }
            : item
        )
        .filter((item) => item.quantity > 0)
    );

    setCartFeedback(
      selectedItem.quantity === 1
        ? `${selectedItem.product.name} dihapus dari keranjang`
        : `Jumlah ${selectedItem.product.name} menjadi ${selectedItem.quantity - 1}`
    );
  }

  function removeFromCart(productId: number) {
    setError("");
    setMessage("");

    const selectedItem = cart.find(
      (item) => item.product.id === productId
    );

    setCart((currentCart) =>
      currentCart.filter((item) => item.product.id !== productId)
    );

    if (selectedItem) {
      setCartFeedback(`${selectedItem.product.name} dihapus dari keranjang`);
    }
  }

  const totalItems = useMemo(() => {
    return cart.reduce(
      (total, item) => total + item.quantity,
      0
    );
  }, [cart]);

  const totalAmount = useMemo(() => {
    return cart.reduce(
      (total, item) =>
        total + item.product.price * item.quantity,
      0
    );
  }, [cart]);

  const paymentValue = Number(paymentAmount) || 0;

  const changeAmount =
    paymentValue >= totalAmount
      ? paymentValue - totalAmount
      : 0;

  const remainingAmount =
    paymentValue < totalAmount
      ? totalAmount - paymentValue
      : 0;

  const isCashPaymentEnough =
    paymentValue >= totalAmount && totalAmount > 0;

  const isPaymentReady =
    paymentMethod === "qris"
      ? totalAmount > 0
      : isCashPaymentEnough;

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesCategory =
        selectedCategory === null ||
        product.category_id === selectedCategory;

      const matchesSearch = product.name
        .toLowerCase()
        .includes(searchProduct.trim().toLowerCase());

      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchProduct]);
      
  function formatRupiah(value: number) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(value);
  }

  function openPayment() {
    if (cart.length === 0) {
      setError("Keranjang masih kosong.");
      return;
    }

    setError("");
    setMessage("");
    setPaymentMethod("cash");
    setPaymentAmount("");
    setShowPayment(true);
  }

  function backToCart() {
    setShowPayment(false);
    setPaymentAmount("");
    setPaymentMethod("cash");
    setError("");
    setMessage("");
  }

  function handlePaymentInput(value: string) {
    const numericValue = value.replace(/\D/g, "");

    setPaymentAmount(numericValue);
    setError("");
    setMessage("");
  }

  function handlePaymentMethodChange(
    method: PaymentMethod
  ) {
    setPaymentMethod(method);
    setPaymentAmount("");
    setError("");
    setMessage("");
  }

  async function handleConfirmPayment() {
    if (processingPayment) return;

    setError("");
    setMessage("");

    if (cart.length === 0) {
      setError("Keranjang masih kosong.");
      return;
    }

    let finalPaymentAmount = 0;
    let finalChangeAmount = 0;

    if (paymentMethod === "cash") {
      if (paymentValue < totalAmount) {
        setError(
          `Uang yang diterima masih kurang ${formatRupiah(
            remainingAmount
          )}.`
        );
        return;
      }

      finalPaymentAmount = paymentValue;
      finalChangeAmount = changeAmount;
    }

    if (paymentMethod === "qris") {
      finalPaymentAmount = totalAmount;
      finalChangeAmount = 0;
    }

    setProcessingPayment(true);

    try {
      const items = cart.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
      }));

      // ==========================================
      // OFFLINE
      // ==========================================
      if (!navigator.onLine) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const user = session?.user;

        if (!user) {
          setError(
            "Sesi pengguna tidak tersedia di perangkat. Silakan login kembali saat online."
          );
          setProcessingPayment(false);
          return;
        }

        const localId = crypto.randomUUID();
        const transactionCode = `OFF-${Date.now()}`;
        const createdAt = new Date().toISOString();

        const offlineTransaction = {
          local_id: localId,
          transaction_code: transactionCode,
          cashier_id: user.id,
          total_amount: totalAmount,
          payment_amount: finalPaymentAmount,
          change_amount: finalChangeAmount,
          payment_method: paymentMethod,
          status: "pending" as const,
          created_at: createdAt,
        };

        const offlineItems = cart.map((item) => ({
          transaction_local_id: localId,
          product_id: item.product.id,
          product_name: item.product.name,
          quantity: item.quantity,
          price: item.product.price,
          subtotal: item.product.price * item.quantity,
        }));

        await saveOfflineTransaction(
          offlineTransaction,
          offlineItems
        );

        // Perbarui indikator jumlah transaksi pending
        await refreshPendingCount();

        setTransactionSuccess({
          transactionId: 0,
          transactionCode,
          createdAt,
          totalAmount,
          paymentAmount: finalPaymentAmount,
          changeAmount: finalChangeAmount,
          paymentMethod,
          isOffline: true,
        });

        setCart([]);
        setPaymentAmount("");
        setShowPayment(false);

        setMessage(
          "Transaksi tersimpan secara offline dan akan disinkronkan ketika internet kembali."
        );

        setProcessingPayment(false);
        return;
      }

      // ==========================================
      // ONLINE
      // ==========================================

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Sesi pengguna tidak ditemukan.");
        setProcessingPayment(false);
        return;
      }

      const { data, error } = await supabase.rpc(
        "create_cashier_transaction",
        {
          p_payment_method: paymentMethod,
          p_payment_amount: finalPaymentAmount,
          p_change_amount: finalChangeAmount,
          p_items: items,
        }
      );

      if (error) {
        setError(
          `Transaksi gagal disimpan: ${error.message}`
        );
        setProcessingPayment(false);
        return;
      }

      const transaction = data?.[0];

      if (!transaction) {
        setError(
          "Transaksi tidak berhasil dibuat. Silakan coba lagi."
        );
        setProcessingPayment(false);
        return;
      }

      setTransactionSuccess({
        transactionId: transaction.transaction_id,
        transactionCode: transaction.transaction_code,
        createdAt: transaction.created_at,
        totalAmount,
        paymentAmount: finalPaymentAmount,
        changeAmount: finalChangeAmount,
        paymentMethod,
        isOffline: false,
      });

      setCart([]);
      setPaymentAmount("");
      setShowPayment(false);

      await loadProducts();

      setProcessingPayment(false);
    } catch (error) {
      console.error("Payment error:", error);

      setError(
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat memproses transaksi."
      );

      setProcessingPayment(false);
    }
  }

  function formatDateTime(value: string) {
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date(value));
  }

  async function refreshPendingCount() {
    try {
      const count = await getPendingTransactionCount();
      setPendingCount(count);
    } catch (error) {
      console.error(
        "Gagal memuat jumlah transaksi pending:",
        error
      );
    }
  }

  useEffect(() => {
    refreshPendingCount();

    function handlePendingUpdate() {
      refreshPendingCount();
    }

    window.addEventListener(
      "online",
      handlePendingUpdate
    );

    window.addEventListener(
      "offline",
      handlePendingUpdate
    );

    return () => {
      window.removeEventListener(
        "online",
        handlePendingUpdate
      );

      window.removeEventListener(
        "offline",
        handlePendingUpdate
      );
    };
  }, []);

  if (transactionSuccess) {
    return (
      <main className="min-h-screen bg-slate-100">
        <header className="border-b bg-white">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                KantinKu
              </h1>

              <p className="text-sm text-slate-500">
                Point of Sale
              </p>

              <div className="mt-2">
                {isOnline ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    Online
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    Offline
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={() => router.push("/cashier")}
              className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Dashboard
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-xl px-4 py-8">
          <div className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
            <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
              transactionSuccess.isOffline ? "bg-amber-100" : "bg-green-100"
            }`}>
              <span className={`text-3xl ${
                transactionSuccess.isOffline ? "text-amber-600" : "text-green-600"
              }`}>
                {transactionSuccess.isOffline ? "↻" : "✓"}
              </span>
            </div>

            <div className="mt-5 text-center">
              <h2 className="text-2xl font-bold text-slate-900">
                {transactionSuccess.isOffline
                  ? "Transaksi Tersimpan Offline"
                  : "Transaksi Berhasil"}
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                {transactionSuccess.isOffline
                  ? "Transaksi tersimpan di perangkat dan menunggu koneksi internet untuk disinkronkan."
                  : "Transaksi telah berhasil disimpan ke sistem."}
              </p>
            </div>

            {transactionSuccess.isOffline && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-800">
                <p className="font-semibold">Menunggu sinkronisasi</p>
                <p className="mt-1">
                  Jangan ulangi transaksi ini. Data akan dikirim ke server saat internet kembali tersedia.
                </p>
              </div>
            )}

            <div className="mt-6 rounded-xl bg-slate-50 p-5 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Nomor Transaksi
              </p>

              <p className="mt-2 text-lg font-bold text-slate-900">
                {transactionSuccess.transactionCode}
              </p>

              <p className="mt-2 text-sm text-slate-500">
                {formatDateTime(transactionSuccess.createdAt)}
              </p>
            </div>

            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">
                  Total
                </span>

                <span className="font-semibold text-slate-900">
                  {formatRupiah(transactionSuccess.totalAmount)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">
                  Metode Pembayaran
                </span>

                <span className="font-semibold text-slate-900">
                  {transactionSuccess.paymentMethod === "cash"
                    ? "Tunai"
                    : "QRIS"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">
                  Dibayar
                </span>

                <span className="font-semibold text-slate-900">
                  {formatRupiah(transactionSuccess.paymentAmount)}
                </span>
              </div>

              {transactionSuccess.paymentMethod === "cash" && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">
                    Kembalian
                  </span>

                  <span className="font-semibold text-green-600">
                    {formatRupiah(transactionSuccess.changeAmount)}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-8 grid gap-3">
              <button
                type="button"
                onClick={() => {
                  setTransactionSuccess(null);
                  setShowPayment(false);
                  setPaymentMethod("cash");
                  setPaymentAmount("");
                  setError("");
                  setMessage("");
                }}
                className="cursor-pointer rounded-xl bg-slate-900 px-4 py-4 font-semibold text-white hover:bg-slate-800"
              >
                Transaksi Baru
              </button>

              <button
                type="button"
                onClick={() => router.push("/cashier")}
                className="cursor-pointer rounded-xl border border-slate-300 px-4 py-4 font-semibold text-slate-700 hover:bg-slate-50"
              >
                Kembali ke Dashboard
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-500">
          Memuat produk...
        </p>
      </main>
    );
  }

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
              Point of Sale
            </p>

            <div className="mt-2">
              {isOnline ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  Online
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Offline
                </span>
              )}
            </div>
          </div>

          <div className="mt-2">
            {pendingCount > 0 ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                {pendingCount} transaksi menunggu sinkronisasi
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                Semua transaksi sudah tersinkron
              </span>
            )}
          </div>

          <button
            onClick={() => router.push("/cashier")}
            className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Kembali
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* TITLE */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900">
            {showPayment
              ? "Pembayaran"
              : "Transaksi Baru"}
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            {showPayment
              ? "Pilih metode pembayaran pelanggan."
              : "Pilih produk untuk dimasukkan ke keranjang."}
          </p>
        </div>

        {/* ERROR */}
        {error && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span className="font-bold">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* SUCCESS / INFO */}
        {message && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            <span className="font-bold">✓</span>
            <span>{message}</span>
          </div>
        )}

        {!showPayment ? (
          /* ==================================================
             PRODUK + KERANJANG
          ================================================== */
          <div className="grid gap-6 lg:grid-cols-3">
            {/* PRODUK */}
            <section className="lg:col-span-2">
              <div className="rounded-2xl bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      Produk
                    </h3>

                    <p className="text-sm text-slate-500">
                      Produk aktif yang tersedia
                    </p>
                  </div>

                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                    {products.length} produk
                  </span>
                </div>

                {/* PENCARIAN PRODUK */}
                <div className="mb-4">
                  <input
                    type="search"
                    value={searchProduct}
                    onChange={(event) => setSearchProduct(event.target.value)}
                    placeholder="Cari nama produk..."
                    aria-label="Cari produk"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                {/* FILTER KATEGORI */}
                <div className="mb-5 flex gap-2 overflow-x-auto pb-2">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(null)}
                    className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
                      selectedCategory === null
                        ? "bg-slate-900 text-white"
                        : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Semua
                  </button>

                  {categories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setSelectedCategory(category.id)}
                      className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
                        selectedCategory === category.id
                          ? "bg-slate-900 text-white"
                          : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
                
                {products.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
                    <p className="font-medium text-slate-700">
                      Belum ada produk aktif.
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      Tambahkan produk melalui menu Produk
                      & Menu.
                    </p>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
                    <p className="font-medium text-slate-700">
                      Produk tidak ditemukan.
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      Coba gunakan kata kunci lain atau pilih kategori berbeda.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {filteredProducts.map((product) => {
                      const isOutOfStock = product.stock <= 0;
                      const cartItem = cart.find(
                        (item) => item.product.id === product.id
                      );

                      return (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => addToCart(product)}
                          disabled={isOutOfStock}
                          aria-label={`Tambahkan ${product.name} ke keranjang`}
                          className={`group relative min-h-36 rounded-2xl border p-4 text-left transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 active:scale-[0.98] ${
                            isOutOfStock
                              ? "cursor-not-allowed border-slate-200 bg-slate-100 opacity-60"
                              : cartItem
                                ? "cursor-pointer border-slate-900 bg-slate-50 shadow-sm"
                                : "cursor-pointer border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md"
                          }`}
                        >
                          <div className="flex min-h-28 flex-col justify-between">
                            <div>
                              {cartItem && (
                                <span className="mb-2 inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                                  {cartItem.quantity} di keranjang
                                </span>
                              )}

                              <h4 className="font-semibold text-slate-900">
                                {product.name}
                              </h4>

                              <p className="mt-1 text-lg font-bold text-slate-900">
                                {formatRupiah(product.price)}
                              </p>
                            </div>

                            <div className="mt-4 flex items-center justify-between text-xs">
                              <span className="text-slate-500">
                                Stok: {product.stock} {product.unit}
                              </span>

                              {isOutOfStock && (
                                <span className="font-semibold text-red-500">
                                  Habis
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            {/* KERANJANG */}
            <section>
              <div className="sticky top-4 rounded-2xl bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      Keranjang
                    </h3>

                    <p className="text-sm text-slate-500">
                      {totalItems} item · {cart.length} jenis produk
                    </p>
                  </div>

                  <span className="flex h-10 min-w-10 items-center justify-center rounded-full bg-slate-900 px-3 text-sm font-bold text-white" aria-live="polite">
                    {totalItems}
                  </span>

                  {cart.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setCart([]);
                        setError("");
                        setMessage("");
                        setCartFeedback("Keranjang berhasil dikosongkan");
                      }}
                      className="cursor-pointer text-sm font-medium text-red-500 hover:text-red-600"
                    >
                      Kosongkan
                    </button>
                  )}
                </div>

                {cartFeedback && (
                  <div
                    className="mb-4 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 text-sm font-medium text-green-800"
                    role="status"
                    aria-live="polite"
                  >
                    <span aria-hidden="true">✓</span>
                    <span>{cartFeedback}</span>
                  </div>
                )}

                {cart.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
                    <p className="text-sm text-slate-500">
                      Keranjang masih kosong.
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      Pilih produk untuk memulai transaksi.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {cart.map((item) => (
                      <div
                        key={item.product.id}
                        className="border-b border-slate-100 pb-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900">
                              {item.product.name}
                            </p>

                            <p className="mt-1 text-sm text-slate-500">
                              {formatRupiah(
                                item.product.price
                              )}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              removeFromCart(
                                item.product.id
                              )
                            }
                            className="cursor-pointer text-xs text-red-500 hover:text-red-600"
                          >
                            Hapus
                          </button>
                        </div>

                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                decreaseQuantity(
                                  item.product.id
                                )
                              }
                              aria-label={`Kurangi jumlah ${item.product.name}`}
                              className="flex h-10 w-10 cursor-pointer touch-manipulation items-center justify-center rounded-lg border border-slate-300 text-lg font-semibold text-slate-700 transition active:scale-95 active:bg-slate-200 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                            >
                              −
                            </button>

                            <span className="w-8 text-center font-semibold text-slate-900">
                              {item.quantity}
                            </span>

                            <button
                              type="button"
                              onClick={() =>
                                increaseQuantity(
                                  item.product.id
                                )
                              }
                              aria-label={`Tambah jumlah ${item.product.name}`}
                              className="flex h-10 w-10 cursor-pointer touch-manipulation items-center justify-center rounded-lg border border-slate-300 text-lg font-semibold text-slate-700 transition active:scale-95 active:bg-slate-200 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                            >
                              +
                            </button>
                          </div>

                          <p className="font-semibold text-slate-900">
                            {formatRupiah(
                              item.product.price *
                                item.quantity
                            )}
                          </p>
                        </div>
                      </div>
                    ))}

                    <div className="border-t border-slate-200 pt-4">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">
                          Total
                        </span>

                        <span className="text-2xl font-bold text-slate-900">
                          {formatRupiah(totalAmount)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={openPayment}
                        disabled={cart.length === 0}
                        className="mt-5 w-full cursor-pointer touch-manipulation rounded-xl bg-slate-900 px-4 py-4 font-semibold text-white transition active:scale-[0.99] hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Lanjut Pembayaran
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : (
          /* ==================================================
             PEMBAYARAN
          ================================================== */
          <div className="mx-auto max-w-2xl">
            <div className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
              {/* RINGKASAN PESANAN */}
              <div className="rounded-xl bg-slate-50 p-5">
                <p className="text-sm text-slate-500">
                  Ringkasan Pesanan
                </p>

                <div className="mt-3 space-y-2">
                  {cart.map((item) => (
                    <div
                      key={item.product.id}
                      className="flex justify-between gap-4 text-sm"
                    >
                      <span className="text-slate-600">
                        {item.product.name} ×{" "}
                        {item.quantity}
                      </span>

                      <span className="font-medium text-slate-900">
                        {formatRupiah(
                          item.product.price *
                            item.quantity
                        )}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-600">
                      Total Pembayaran
                    </span>

                    <span className="text-2xl font-bold text-slate-900">
                      {formatRupiah(totalAmount)}
                    </span>
                  </div>
                </div>
              </div>

              {/* METODE PEMBAYARAN */}
              <div className="mt-6">
                <p className="mb-3 text-sm font-semibold text-slate-700">
                  Metode Pembayaran
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      handlePaymentMethodChange("cash")
                    }
                    className={`cursor-pointer rounded-xl border px-4 py-4 text-left transition ${
                      paymentMethod === "cash"
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <p className="font-semibold">
                      Tunai
                    </p>

                    <p
                      className={`mt-1 text-xs ${
                        paymentMethod === "cash"
                          ? "text-slate-300"
                          : "text-slate-500"
                      }`}
                    >
                      Pembayaran dengan uang tunai
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handlePaymentMethodChange("qris")
                    }
                    className={`cursor-pointer rounded-xl border px-4 py-4 text-left transition ${
                      paymentMethod === "qris"
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <p className="font-semibold">
                      QRIS
                    </p>

                    <p
                      className={`mt-1 text-xs ${
                        paymentMethod === "qris"
                          ? "text-slate-300"
                          : "text-slate-500"
                      }`}
                    >
                      Pembayaran melalui QRIS
                    </p>
                  </button>
                </div>
              </div>

              {/* PEMBAYARAN TUNAI */}
              {paymentMethod === "cash" && (
                <>
                  <div className="mt-6">
                    <label
                      htmlFor="paymentAmount"
                      className="mb-2 block text-sm font-semibold text-slate-700"
                    >
                      Uang Diterima
                    </label>

                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                        Rp
                      </span>

                      <input
                        id="paymentAmount"
                        type="text"
                        inputMode="numeric"
                        value={
                          paymentAmount
                            ? Number(
                                paymentAmount
                              ).toLocaleString("id-ID")
                            : ""
                        }
                        onChange={(event) =>
                          handlePaymentInput(
                            event.target.value
                          )
                        }
                        placeholder="Masukkan uang pelanggan"
                        className="w-full rounded-xl border border-slate-300 py-4 pl-12 pr-4 text-xl font-semibold text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-100"
                      />
                    </div>
                  </div>

                  {/* KEMBALIAN */}
                  <div
                    className={`mt-5 rounded-xl p-5 ${
                      paymentValue === 0
                        ? "bg-slate-50"
                        : isCashPaymentEnough
                          ? "bg-green-50"
                          : "bg-red-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-sm font-medium ${
                          paymentValue === 0
                            ? "text-slate-500"
                            : isCashPaymentEnough
                              ? "text-green-700"
                              : "text-red-700"
                        }`}
                      >
                        {paymentValue === 0
                          ? "Kembalian"
                          : isCashPaymentEnough
                            ? "Kembalian"
                            : "Uang Masih Kurang"}
                      </span>

                      <span
                        className={`text-2xl font-bold ${
                          paymentValue === 0
                            ? "text-slate-700"
                            : isCashPaymentEnough
                              ? "text-green-700"
                              : "text-red-700"
                        }`}
                      >
                        {paymentValue === 0
                          ? "Rp0"
                          : isCashPaymentEnough
                            ? formatRupiah(
                                changeAmount
                              )
                            : formatRupiah(
                                remainingAmount
                              )}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {/* PEMBAYARAN QRIS */}
              {paymentMethod === "qris" && (
                <div className="mt-6">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
                    <p className="font-semibold text-slate-900">
                      Pembayaran QRIS
                    </p>

                    <p className="mt-2 text-sm text-slate-500">
                      Minta pelanggan melakukan pembayaran
                      menggunakan QRIS kantin.
                    </p>

                    {/* PLACEHOLDER QRIS */}
                    <div className="mx-auto mt-5 flex h-48 w-48 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white">
                      <div className="text-center">
                        <p className="text-3xl">▦</p>

                        <p className="mt-2 text-xs text-slate-400">
                          QRIS Kantin
                        </p>

                        <p className="text-xs text-slate-400">
                          akan ditampilkan di sini
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 rounded-xl bg-white p-4">
                      <p className="text-sm text-slate-500">
                        Total yang harus dibayar
                      </p>

                      <p className="mt-1 text-2xl font-bold text-slate-900">
                        {formatRupiah(totalAmount)}
                      </p>
                    </div>

                    <p className="mt-4 text-xs text-slate-500">
                      Pastikan pembayaran QRIS sudah diterima
                      sebelum menekan tombol Bayar.
                    </p>
                  </div>
                </div>
              )}

              {/* TOMBOL */}
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={backToCart}
                  className="cursor-pointer rounded-xl border border-slate-300 px-4 py-4 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Kembali ke Keranjang
                </button>

                <button
                  type="button"
                  onClick={handleConfirmPayment}
                  disabled={!isPaymentReady || processingPayment}
                  className="cursor-pointer touch-manipulation rounded-xl bg-slate-900 px-4 py-4 font-semibold text-white transition active:scale-[0.99] hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {processingPayment ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Menyimpan transaksi...
                    </span>
                  ) : paymentMethod === "qris" ? (
                    "Konfirmasi QRIS"
                  ) : (
                    "Bayar"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}