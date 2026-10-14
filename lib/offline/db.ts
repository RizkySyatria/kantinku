import Dexie, { Table } from "dexie";
import { createClient } from "@/lib/supabase/client";

export type OfflineTransactionStatus =
  | "pending"
  | "synced"
  | "failed";

export interface OfflineTransaction {
  id?: number;
  local_id: string;
  transaction_code: string;
  cashier_id: string;
  total_amount: number;
  payment_amount: number;
  change_amount: number;
  payment_method: "cash" | "qris";
  status: OfflineTransactionStatus;
  created_at: string;
  sync_error?: string;
}

export interface OfflineTransactionItem {
  id?: number;
  transaction_local_id: string;
  product_id: number;
  product_name: string;
  quantity: number;
  price: number;
  subtotal: number;
}

export interface OfflineProduct {
  id: number;
  name: string;
  category_id: number | null;
  price: number;
  stock: number;
  unit: string;
  is_active: boolean;
  cached_at: string;
}

class OfflineDatabase extends Dexie {
  products!: Table<OfflineProduct, number>;
  transactions!: Table<OfflineTransaction, number>;
  transactionItems!: Table<OfflineTransactionItem, number>;

  constructor() {
    super("KantinKuOfflineDB");

    this.version(2).stores({
      products:
        "id, name, category_id, is_active, cached_at",
      transactions:
        "++id, local_id, transaction_code, status, created_at",
      transactionItems:
        "++id, transaction_local_id, product_id",
    });
  }
}

export const offlineDb = new OfflineDatabase();

/* =========================================================
   CACHE PRODUK
   ========================================================= */

export async function cacheProducts(
  products: Omit<OfflineProduct, "cached_at">[]
) {
  const productsWithCacheTime = products.map((product) => ({
    ...product,
    cached_at: new Date().toISOString(),
  }));

  await offlineDb.products.clear();
  await offlineDb.products.bulkPut(productsWithCacheTime);
}

export async function getCachedProducts() {
  const products = await offlineDb.products.toArray();

  return products
    .filter((product) => product.is_active)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* =========================================================
   HITUNG TRANSAKSI YANG BELUM TERSINKRON
   ========================================================= */

export async function getPendingTransactionCount() {
  return offlineDb.transactions
    .where("status")
    .anyOf(["pending", "failed"])
    .count();
}

/* =========================================================
   SIMPAN TRANSAKSI OFFLINE
   ========================================================= */

export async function saveOfflineTransaction(
  transaction: OfflineTransaction,
  items: OfflineTransactionItem[]
) {
  if (items.length === 0) {
    throw new Error("Detail transaksi offline masih kosong.");
  }

  await offlineDb.transaction(
    "rw",
    offlineDb.transactions,
    offlineDb.transactionItems,
    offlineDb.products,
    async () => {
      // Validasi stok seluruh item sebelum menyimpan transaksi.
      for (const item of items) {
        const product = await offlineDb.products.get(
          item.product_id
        );

        if (!product) {
          throw new Error(
            `Produk ${item.product_name} tidak ditemukan di cache offline.`
          );
        }

        if (item.quantity <= 0) {
          throw new Error(
            `Jumlah produk ${item.product_name} tidak valid.`
          );
        }

        if (product.stock < item.quantity) {
          throw new Error(
            `Stok ${product.name} tidak mencukupi. Stok tersedia ${product.stock} ${product.unit}.`
          );
        }
      }

      // Simpan transaksi utama.
      await offlineDb.transactions.add(transaction);

      // Simpan seluruh detail transaksi.
      await offlineDb.transactionItems.bulkAdd(items);

      // Kurangi stok lokal setelah semua item tervalidasi.
      for (const item of items) {
        const product = await offlineDb.products.get(
          item.product_id
        );

        if (!product) {
          throw new Error(
            `Produk ${item.product_name} tidak ditemukan.`
          );
        }

        await offlineDb.products.put({
          ...product,
          stock: product.stock - item.quantity,
        });
      }
    }
  );
}

/* =========================================================
   SINKRONISASI TRANSAKSI OFFLINE
   ========================================================= */

// Mencegah dua proses sync berjalan bersamaan
// dalam instance aplikasi yang sama.
let syncInProgress = false;

export async function syncOfflineTransactions() {
  if (typeof navigator === "undefined" || !navigator.onLine) {
    return {
      synced: 0,
      failed: 0,
      skipped: true,
    };
  }

  if (syncInProgress) {
    console.log(
      "Offline sync sedang berjalan. Proses kedua dilewati."
    );

    return {
      synced: 0,
      failed: 0,
      skipped: true,
    };
  }

  syncInProgress = true;

  try {
    const supabase = createClient();

    const transactions = await offlineDb.transactions
      .where("status")
      .anyOf(["pending", "failed"])
      .toArray();

    if (transactions.length === 0) {
      return {
        synced: 0,
        failed: 0,
        skipped: false,
      };
    }

    let syncedCount = 0;
    let failedCount = 0;

    for (const transaction of transactions) {
      try {
        if (transaction.id === undefined) {
          throw new Error(
            "ID transaksi lokal tidak ditemukan."
          );
        }

        const items = await offlineDb.transactionItems
          .where("transaction_local_id")
          .equals(transaction.local_id)
          .toArray();

        if (items.length === 0) {
          throw new Error(
            "Detail transaksi offline tidak ditemukan."
          );
        }

        const rpcItems = items.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
        }));

        const { data, error } = await supabase.rpc(
          "sync_offline_transaction",
          {
            p_transaction_code: transaction.transaction_code,
            p_created_at: transaction.created_at,
            p_payment_method: transaction.payment_method,
            p_payment_amount: transaction.payment_amount,
            p_change_amount: transaction.change_amount,
            p_items: rpcItems,
          }
        );

        if (error) {
          throw new Error(error.message);
        }

        const syncedTransaction = data?.[0];

        if (!syncedTransaction) {
          throw new Error(
            "Supabase tidak mengembalikan data transaksi."
          );
        }

        await offlineDb.transactions.update(
          transaction.id,
          {
            status: "synced",
            sync_error: undefined,
          }
        );

        syncedCount++;

        console.log(
          "Offline transaction synced:",
          transaction.transaction_code
        );
      } catch (error) {
        console.error(
          "Offline transaction sync failed:",
          transaction.transaction_code,
          error
        );

        if (transaction.id !== undefined) {
          await offlineDb.transactions.update(
            transaction.id,
            {
              status: "failed",
              sync_error:
                error instanceof Error
                  ? error.message
                  : "Gagal melakukan sinkronisasi.",
            }
          );
        }

        failedCount++;
      }
    }

    return {
      synced: syncedCount,
      failed: failedCount,
      skipped: false,
    };
  } finally {
    syncInProgress = false;
  }
}


