"use client";

import { useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

import { saveOfflineTransaction } from "@/lib/offline/db";

import { syncOfflineTransactions } from "@/lib/offline/db";

import {
  cacheProducts,
  getCachedProducts,
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

type CartItem = {
  product: Product;
  quantity: number;
};

type PaymentMethod = "cash" | "qris";

export default function CashierPOSPage() {
  const router = useRouter();
  const supabase = createClient();

  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isOnline, setIsOnline] = useState(true);

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

    const { data, error } = await supabase
      .from("products")
      .select(
        "id, name, category_id, price, stock, unit, is_active"
      )
      .eq("is_active", true)
      .order("name");

    // INTERNET TERSEDIA
    if (!error && data) {
      setProducts(data);

      await cacheProducts(data);

      setLoading(false);
      return;
    }

    // INTERNET TIDAK TERSEDIA
    const cachedProducts = await getCachedProducts();

    if (cachedProducts.length > 0) {
      setProducts(cachedProducts);
      setMessage(
        "Offline: menggunakan data produk yang tersimpan di perangkat."
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
    async function syncPendingTransactions() {
      if (!navigator.onLine) {
        return;
      }

      try {
        const result = await syncOfflineTransactions();

        console.log("Offline sync result:", result);

        if (result.synced > 0) {
          await loadProducts();
        }
      } catch (error) {
        console.error(
          "Gagal menjalankan sinkronisasi offline:",
          error
        );
      }
    }

    // Coba sync ketika halaman pertama kali dibuka
    syncPendingTransactions();

    // Coba sync ketika koneksi internet kembali
    function handleOnline() {
      syncPendingTransactions();
    }

    window.addEventListener("online", handleOnline);

    return () => {
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
      setError(`${product.name} sedang habis.`);
      return;
    }

    setCart((currentCart) => {
      const existingItem = currentCart.find(
        (item) => item.product.id === product.id
      );

      if (!existingItem) {
        return [
          ...currentCart,
          {
            product,
            quantity: 1,
          },
        ];
      }

      if (existingItem.quantity >= product.stock) {
        setError(
          `Stok ${product.name} hanya ${product.stock} ${product.unit}.`
        );

        return currentCart;
      }

      return currentCart.map((item) =>
        item.product.id === product.id
          ? {
              ...item,
              quantity: item.quantity + 1,
            }
          : item
      );
    });
  }

  function increaseQuantity(productId: number) {
    setError("");
    setMessage("");

    setCart((currentCart) =>
      currentCart.map((item) => {
        if (item.product.id !== productId) {
          return item;
        }

        if (item.quantity >= item.product.stock) {
          setError(
            `Stok ${item.product.name} hanya ${item.product.stock} ${item.product.unit}.`
          );

          return item;
        }

        return {
          ...item,
          quantity: item.quantity + 1,
        };
      })
    );
  }

  function decreaseQuantity(productId: number) {
    setError("");
    setMessage("");

    setCart((currentCart) =>
      currentCart
        .map((item) =>
          item.product.id === productId
            ? {
                ...item,
                quantity: item.quantity - 1,
              }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function removeFromCart(productId: number) {
    setError("");
    setMessage("");

    setCart((currentCart) =>
      currentCart.filter(
        (item) => item.product.id !== productId
      )
    );
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

        setTransactionSuccess({
          transactionId: 0,
          transactionCode,
          createdAt,
          totalAmount,
          paymentAmount: finalPaymentAmount,
          changeAmount: finalChangeAmount,
          paymentMethod,
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
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <span className="text-3xl text-green-600">
                ✓
              </span>
            </div>

            <div className="mt-5 text-center">
              <h2 className="text-2xl font-bold text-slate-900">
                Transaksi Berhasil
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Transaksi telah berhasil disimpan.
              </p>
            </div>

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
                ) : (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {products.map((product) => {
                      const isOutOfStock =
                        product.stock <= 0;

                      return (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() =>
                            addToCart(product)
                          }
                          disabled={isOutOfStock}
                          className={`rounded-2xl border p-4 text-left transition ${
                            isOutOfStock
                              ? "cursor-not-allowed border-slate-200 bg-slate-100 opacity-60"
                              : "cursor-pointer border-slate-200 bg-white hover:border-slate-400 hover:shadow-md"
                          }`}
                        >
                          <div className="flex min-h-28 flex-col justify-between">
                            <div>
                              <h4 className="font-semibold text-slate-900">
                                {product.name}
                              </h4>

                              <p className="mt-1 text-lg font-bold text-slate-900">
                                {formatRupiah(
                                  product.price
                                )}
                              </p>
                            </div>

                            <div className="mt-4 flex items-center justify-between text-xs">
                              <span className="text-slate-500">
                                Stok: {product.stock}{" "}
                                {product.unit}
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
                      {totalItems} item
                    </p>
                  </div>

                  {cart.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setCart([]);
                        setError("");
                        setMessage("");
                      }}
                      className="cursor-pointer text-sm font-medium text-red-500 hover:text-red-600"
                    >
                      Kosongkan
                    </button>
                  )}
                </div>

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
                              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
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
                              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
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
                        className="mt-5 w-full cursor-pointer rounded-xl bg-slate-900 px-4 py-4 font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
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
                  className="cursor-pointer rounded-xl bg-slate-900 px-4 py-4 font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {processingPayment
                    ? "Menyimpan..."
                    : paymentMethod === "qris"
                      ? "Konfirmasi QRIS"
                      : "Bayar"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}