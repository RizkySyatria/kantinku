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

export async function saveOfflineTransaction(
  transaction: OfflineTransaction,
  items: OfflineTransactionItem[]
) {
  await offlineDb.transaction(
    "rw",
    offlineDb.transactions,
    offlineDb.transactionItems,
    offlineDb.products,
    async () => {
      // Pastikan stok lokal cukup untuk semua item
      for (const item of items) {
        const product = await offlineDb.products.get(
          item.product_id
        );

        if (!product) {
          throw new Error(
            `Produk ${item.product_name} tidak ditemukan di cache offline.`
          );
        }

        if (product.stock < item.quantity) {
          throw new Error(
            `Stok ${product.name} tidak mencukupi. Stok tersedia ${product.stock} ${product.unit}.`
          );
        }
      }

      // Simpan transaksi offline
      await offlineDb.transactions.add(transaction);

      // Simpan detail transaksi
      await offlineDb.transactionItems.bulkAdd(items);

      // Kurangi stok lokal
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

let syncInProgress = false;

export async function syncOfflineTransactions() {
  // Jangan melakukan sync jika perangkat masih offline
  if (!navigator.onLine) {
    return {
      synced: 0,
      failed: 0,
      skipped: true,
    };
  }

  // Jangan izinkan dua proses sync berjalan bersamaan
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

    // Ambil transaksi yang belum berhasil disinkronkan
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
        // Ambil detail item transaksi
        const items = await offlineDb.transactionItems
          .where("transaction_local_id")
          .equals(transaction.local_id)
          .toArray();

        if (items.length === 0) {
          throw new Error(
            "Detail transaksi offline tidak ditemukan."
          );
        }

        // Format item untuk RPC
        const rpcItems = items.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
        }));

        // Kirim transaksi ke Supabase
        const { data, error } = await supabase.rpc(
          "sync_offline_transaction",
          {
            p_transaction_code:
              transaction.transaction_code,
            p_created_at: transaction.created_at,
            p_payment_method:
              transaction.payment_method,
            p_payment_amount:
              transaction.payment_amount,
            p_change_amount:
              transaction.change_amount,
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

        // Berhasil:
        // pending/failed → synced
        await offlineDb.transactions.update(
          transaction.id!,
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

        await offlineDb.transactions.update(
          transaction.id!,
          {
            status: "failed",
            sync_error:
              error instanceof Error
                ? error.message
                : "Gagal melakukan sinkronisasi.",
          }
        );

        failedCount++;
      }
    }

    return {
      synced: syncedCount,
      failed: failedCount,
      skipped: false,
    };
  } finally {
    // Pastikan lock dilepas walaupun terjadi error
    syncInProgress = false;
  }
}