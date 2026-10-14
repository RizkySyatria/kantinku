
"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      console.warn(
        "Browser ini tidak mendukung Service Worker."
      );
      return;
    }

    async function registerServiceWorker() {
      try {
        const registration =
          await navigator.serviceWorker.register("/sw.js", {
            scope: "/",
          });

        console.log(
          "KantinKu Service Worker terdaftar:",
          registration.scope
        );
      } catch (error) {
        console.error(
          "Gagal mendaftarkan Service Worker KantinKu:",
          error
        );
      }
    }

    void registerServiceWorker();
  }, []);

  return null;
}
