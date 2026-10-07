"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { createClient } from "@/lib/supabase/client";

type Transaction = {
  id: number;
  transaction_code: string;
  total_amount: number;
  payment_method: string;
  status: string;
  created_at: string;
};

export default function OwnerReportsPage() {
  const supabase = createClient();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    return date.toISOString().split("T")[0];
  });

  const [endDate, setEndDate] = useState(() => {
    const date = new Date();
    return date.toISOString().split("T")[0];
  });

  async function loadTransactions() {
    setLoading(true);
    setError("");

    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T23:59:59.999`);

    if (start > end) {
      setError("Tanggal mulai tidak boleh lebih besar dari tanggal akhir.");
      setTransactions([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("transactions")
      .select(
        "id, transaction_code, total_amount, payment_method, status, created_at"
      )
      .eq("status", "completed")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      setError(`Gagal memuat laporan: ${error.message}`);
      setTransactions([]);
      setLoading(false);
      return;
    }

    setTransactions((data as Transaction[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadTransactions();
  }, []);

  function formatRupiah(value: number) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(value);
  }

  function formatDateTime(value: string) {
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  async function handleExportExcel() {
    if (transactions.length === 0) {
        setError("Tidak ada transaksi untuk diekspor.");
        return;
    }

    setError("");

    const transactionIds = transactions.map(
        (transaction) => transaction.id
    );

    const { data: items, error: itemsError } = await supabase
        .from("transaction_items")
        .select(
        "transaction_id, product_name, quantity, price, subtotal"
        )
        .in("transaction_id", transactionIds);

    if (itemsError) {
        setError(
        `Gagal mengambil detail produk: ${itemsError.message}`
        );
        return;
    }

    const productSalesMap = new Map<
        string,
        {
        product_name: string;
        quantity: number;
        total: number;
        }
    >();

    (items ?? []).forEach((item) => {
        const existing = productSalesMap.get(item.product_name);

        if (existing) {
        existing.quantity += Number(item.quantity);
        existing.total += Number(item.subtotal);
        } else {
        productSalesMap.set(item.product_name, {
            product_name: item.product_name,
            quantity: Number(item.quantity),
            total: Number(item.subtotal),
        });
        }
    });

    const productSales = Array.from(
        productSalesMap.values()
    ).sort((a, b) => b.quantity - a.quantity);

    const summaryData = [
        {
            "Periode Mulai": startDate,
            "Periode Akhir": endDate,
            "Total Penjualan": totalSales,
            "Total Transaksi": transactionCount,
            "Rata-rata Transaksi": averageTransaction,
        },
    ];

    const transactionData = transactions.map(
        (transaction) => ({
        Tanggal: formatDateTime(transaction.created_at),
        "No. Transaksi": transaction.transaction_code,
        "Metode Pembayaran":
            transaction.payment_method === "qris"
            ? "QRIS"
            : "Cash",
        "Total Penjualan": Number(transaction.total_amount),
        Status:
            transaction.status === "completed"
            ? "Selesai"
            : transaction.status,
        })
    );

    const productData = productSales.map((product) => ({
        Produk: product.product_name,
        "Jumlah Terjual": product.quantity,
        "Total Penjualan": product.total,
    }));

    const workbook = XLSX.utils.book_new();

    const summarySheet =
        XLSX.utils.json_to_sheet(summaryData);

    const transactionSheet =
        XLSX.utils.json_to_sheet(transactionData);

    const productSheet =
        XLSX.utils.json_to_sheet(productData);

    summarySheet["!cols"] = [
        { wch: 16 },
        { wch: 16 },
        { wch: 20 },
        { wch: 18 },
        { wch: 22 },
    ];

    transactionSheet["!cols"] = [
        { wch: 22 },
        { wch: 30 },
        { wch: 18 },
        { wch: 20 },
        { wch: 14 },
    ];

    productSheet["!cols"] = [
        { wch: 25 },
        { wch: 18 },
        { wch: 22 },
    ];    

    XLSX.utils.book_append_sheet(
        workbook,
        summarySheet,
        "Ringkasan"
    );

    XLSX.utils.book_append_sheet(
        workbook,
        transactionSheet,
        "Detail Transaksi"
    );

    XLSX.utils.book_append_sheet(
        workbook,
        productSheet,
        "Produk Terjual"
    );

    XLSX.writeFile(
        workbook,
        `Laporan_Penjualan_${startDate}_${endDate}.xlsx`
    );
  }

  async function handleExportPDF() {
    if (transactions.length === 0) {
      setError("Tidak ada transaksi untuk diekspor.");
      return;
    }

    setError("");

    const transactionIds = transactions.map(
      (transaction) => transaction.id
    );

    const { data: items, error: itemsError } = await supabase
      .from("transaction_items")
      .select(
        "transaction_id, product_name, quantity, subtotal"
      )
      .in("transaction_id", transactionIds);

    if (itemsError) {
      setError(
        `Gagal mengambil detail produk: ${itemsError.message}`
      );
      return;
    }

    const productSalesMap = new Map<
      string,
      {
        product_name: string;
        quantity: number;
        total: number;
      }
    >();

    (items ?? []).forEach((item) => {
      const existing = productSalesMap.get(item.product_name);

      if (existing) {
        existing.quantity += Number(item.quantity);
        existing.total += Number(item.subtotal);
      } else {
        productSalesMap.set(item.product_name, {
          product_name: item.product_name,
          quantity: Number(item.quantity),
          total: Number(item.subtotal),
        });
      }
    });

    const productSales = Array.from(
      productSalesMap.values()
    ).sort((a, b) => b.quantity - a.quantity);

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    // JUDUL
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("KANTINKU", 14, 18);

    doc.setFontSize(13);
    doc.text("LAPORAN PENJUALAN", 14, 26);

    // PERIODE
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    doc.text(
      `Periode: ${startDate} - ${endDate}`,
      14,
      34
    );

    // RINGKASAN
    doc.setFont("helvetica", "bold");
    doc.text("Ringkasan", 14, 44);

    doc.setFont("helvetica", "normal");

    doc.text(
      `Total Penjualan: ${formatRupiah(totalSales)}`,
      14,
      51
    );

    doc.text(
      `Total Transaksi: ${transactionCount}`,
      14,
      57
    );

    doc.text(
      `Rata-rata Transaksi: ${formatRupiah(averageTransaction)}`,
      14,
      63
    );

    // DETAIL TRANSAKSI
    doc.setFont("helvetica", "bold");
    doc.text("Detail Transaksi", 14, 73);

    autoTable(doc, {
      startY: 77,
      head: [
        [
          "Tanggal",
          "No. Transaksi",
          "Metode",
          "Total",
          "Status",
        ],
      ],
      body: transactions.map((transaction) => [
        formatDateTime(transaction.created_at),
        transaction.transaction_code,
        transaction.payment_method === "qris"
          ? "QRIS"
          : "Cash",
        formatRupiah(Number(transaction.total_amount)),
        transaction.status === "completed"
          ? "Selesai"
          : transaction.status,
      ]),
      styles: {
        fontSize: 8,
        cellPadding: 3,
      },
      headStyles: {
        fontStyle: "bold",
      },
    });

    // HALAMAN PRODUK
    doc.addPage();

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Produk Terjual", 14, 18);

    autoTable(doc, {
      startY: 24,
      head: [
        [
          "Produk",
          "Jumlah Terjual",
          "Total Penjualan",
        ],
      ],
      body: productSales.map((product) => [
        product.product_name,
        product.quantity.toString(),
        formatRupiah(product.total),
      ]),
      styles: {
        fontSize: 9,
        cellPadding: 3,
      },
      headStyles: {
        fontStyle: "bold",
      },
    });

    doc.save(
      `Laporan_Penjualan_${startDate}_${endDate}.pdf`
    );
  }

  const totalSales = transactions.reduce(
    (total, transaction) =>
      total + Number(transaction.total_amount),
    0
  );

  const transactionCount = transactions.length;

  const averageTransaction =
    transactionCount > 0
      ? totalSales / transactionCount
      : 0;

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              KantinKu
            </h1>

            <p className="text-sm text-slate-500">
              Laporan Penjualan
            </p>
          </div>

          <button
            onClick={() => window.history.back()}
            className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Kembali
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <section className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900">
            Laporan Penjualan
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Lihat data transaksi berdasarkan periode.
          </p>
        </section>

        {/* FILTER PERIODE */}
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">
            Periode Laporan
          </h3>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor="startDate"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Dari Tanggal
              </label>

              <input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(event) =>
                  setStartDate(event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div>
              <label
                htmlFor="endDate"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Sampai Tanggal
              </label>

              <input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(event) =>
                  setEndDate(event.target.value)
                }
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={loadTransactions}
            disabled={loading}
            className="cursor-pointer rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Memuat..." : "Tampilkan Laporan"}
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            disabled={loading || transactions.length === 0}
            className="cursor-pointer rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
            Export Excel
          </button>

          <button
            type="button"
            onClick={handleExportPDF}
            disabled={loading || transactions.length === 0}
            className="cursor-pointer rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export PDF
          </button>
        </section>

        {/* ERROR */}
        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* RINGKASAN */}
        <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Total Penjualan
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {formatRupiah(totalSales)}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Total Transaksi
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {transactionCount}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Rata-rata Transaksi
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-900">
              {formatRupiah(averageTransaction)}
            </p>
          </div>
        </section>

        {/* DETAIL TRANSAKSI */}
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h3 className="text-lg font-semibold text-slate-900">
              Detail Transaksi
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Transaksi selesai pada periode yang dipilih.
            </p>
          </div>

          {loading ? (
            <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
              Memuat data transaksi...
            </div>
          ) : transactions.length === 0 ? (
            <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
              Tidak ada transaksi pada periode ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="px-4 py-3 font-semibold text-slate-700">
                      Tanggal
                    </th>

                    <th className="px-4 py-3 font-semibold text-slate-700">
                      No. Transaksi
                    </th>

                    <th className="px-4 py-3 font-semibold text-slate-700">
                      Metode
                    </th>

                    <th className="px-4 py-3 text-right font-semibold text-slate-700">
                      Total
                    </th>

                    <th className="px-4 py-3 text-center font-semibold text-slate-700">
                      Status
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {transactions.map((transaction) => (
                    <tr
                      key={transaction.id}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="px-4 py-3 text-slate-600">
                        {formatDateTime(transaction.created_at)}
                      </td>

                      <td className="px-4 py-3 font-medium text-slate-900">
                        {transaction.transaction_code}
                      </td>

                      <td className="px-4 py-3 capitalize text-slate-600">
                        {transaction.payment_method === "qris"
                          ? "QRIS"
                          : "Cash"}
                      </td>

                      <td className="px-4 py-3 text-right font-semibold text-slate-900">
                        {formatRupiah(
                          Number(transaction.total_amount)
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                          Selesai
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}