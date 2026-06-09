"use client";

import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { doc, setDoc, deleteDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";

export default function AdminView() {
  const [isActive, setIsActive] = useState(false);
  const [qrPayload, setQrPayload] = useState("");

  const startBench = async () => setIsActive(true);

  const stopBench = async () => {
    setIsActive(false);
    setQrPayload("");
    await deleteDoc(doc(db, "benches", "active"));
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    const updateQRCode = async () => {
      const newPayload = `bench_secret_${new Date().getTime()}`;
      setQrPayload(newPayload);
      await setDoc(doc(db, "benches", "active"), {
        currentQrPayload: newPayload,
        updatedAt: new Date(),
        isActive: true
      });
    };

    if (isActive) {
      updateQRCode();
      interval = setInterval(updateQRCode, 60000);
    }
    return () => clearInterval(interval);
  }, [isActive]);

// --- NEW: Advanced Google Sheets Sync Function ---
  const [isSyncing, setIsSyncing] = useState(false);
  // PASTE YOUR NEW APP SCRIPT URL HERE:
  const GOOGLE_SHEETS_WEBHOOK = "YOUR_WEB_APP_URL_HERE";

  const handleSyncToSheets = async () => {
    setIsSyncing(true);
    try {
      const querySnapshot = await getDocs(collection(db, "attendance"));
      const summaryPayload: Record<string, string | number>[] = [];
      const logsPayload: Record<string, string | null>[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();

        // 1. Build Summary Data
        summaryPayload.push({
          name: data.name || "Unknown",
          email: data.email || "No Email",
          benchesAttended: data.benchesAttended || 1,
          totalHours: data.totalHours ? parseFloat(data.totalHours).toFixed(2) : "0.00",
          lastUpdated: new Date().toLocaleString()
        });

        // 2. Build Detailed Logs Data
        if (data.checkInTime) {
          const checkInDate = data.checkInTime.toDate();
          // If they forgot to check out, we note it. Otherwise, use their checkout time.
          const checkOutDate = data.checkOutTime ? data.checkOutTime.toDate() : null;

          logsPayload.push({
            date: checkInDate.toLocaleDateString(),
            name: data.name || "Unknown",
            arrivalTime: checkInDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            departureTime: checkOutDate ? checkOutDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Forgot to Check Out"
          });
        }
      });

      // Send the split payload to our Apps Script
      await fetch(GOOGLE_SHEETS_WEBHOOK, {
        method: "POST",
        body: JSON.stringify({ summary: summaryPayload, logs: logsPayload }),
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        }
      });

      alert("✅ Successfully synced all data and logs to Google Sheets!");
    } catch (error) {
      console.error("Error syncing data:", error);
      alert("❌ Failed to sync data to Google Sheets.");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center text-center mt-6">
      <div className="flex justify-between w-full items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Host Dashboard</h2>
        <button 
          onClick={handleSyncToSheets}
          disabled={isSyncing}
          className="bg-blue-600/90 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-xl transition-all shadow-md backdrop-blur-sm border border-blue-400 disabled:opacity-50"
        >
          {isSyncing ? "Syncing..." : "🔄 Sync to Google Sheets"}
        </button>
      </div>

      {!isActive ? (
        <button
          onClick={startBench}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors shadow-sm"
        >
          Start Bench Session
        </button>
      ) : (
        <div className="flex flex-col items-center w-full space-y-6">
          <div className="p-4 bg-white border-4 border-gray-50 rounded-2xl shadow-sm">
            <QRCodeSVG value={qrPayload} size={256} />
          </div>
          <p className="text-sm font-medium text-blue-600 animate-pulse bg-blue-50 px-4 py-2 rounded-full">
            QR Code updates automatically every 60 seconds
          </p>
          <button
            onClick={stopBench}
            className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-semibold py-3 px-8 rounded-lg transition-colors"
          >
            End Bench Session
          </button>
        </div>
      )}
    </div>
  );
}