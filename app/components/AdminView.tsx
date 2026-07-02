"use client";

import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { auth } from "../../lib/firebase";
import {
  subscribeToLock,
  startBenchSession,
  endBenchSession,
  rotateQrPayload,
} from "../../lib/session";
import type { LockData } from "../../lib/session";

export default function AdminView() {
  const [lock, setLock] = useState<LockData | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  // Keep the true state of "is there an active session" synced live from
  // Firestore, instead of local-only state. This means a page refresh (or
  // a second admin opening the dashboard) always shows the real status.
  useEffect(() => {
    const unsubscribe = subscribeToLock((lockData) => setLock(lockData));
    return () => unsubscribe();
  }, []);

  // Rotate the QR code every 60 seconds while a session is active. Any
  // admin with this view open will keep the code fresh, so it survives
  // the original admin closing their tab.
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = lock?.activeSessionId ?? null;

  useEffect(() => {
    if (!lock?.activeSessionId) return;

    const interval = setInterval(() => {
      if (sessionIdRef.current) {
        rotateQrPayload(sessionIdRef.current);
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [lock?.activeSessionId]);

  const startBench = async () => {
    const user = auth.currentUser;
    if (!user) return;

    setError("");
    setIsBusy(true);
    try {
      await startBenchSession(
        user.uid,
        user.displayName || "Unknown",
        user.email || ""
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start session.");
    } finally {
      setIsBusy(false);
    }
  };

  const stopBench = async () => {
    if (!lock?.activeSessionId) return;

    setError("");
    setIsBusy(true);
    try {
      await endBenchSession(lock.activeSessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end session.");
    } finally {
      setIsBusy(false);
    }
  };

  const isActive = !!lock?.activeSessionId;

  return (
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center text-center mt-6">
      <div className="w-full mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Host Dashboard</h2>
      </div>

      {error && (
        <div className="w-full mb-4 bg-red-50 border border-red-200 text-red-700 text-sm font-medium rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {!isActive ? (
        <button
          onClick={startBench}
          disabled={isBusy}
          className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 px-8 rounded-lg transition-colors shadow-sm"
        >
          {isBusy ? "Starting..." : "Start Bench Session"}
        </button>
      ) : (
        <div className="flex flex-col items-center w-full space-y-6">
          <p className="text-sm text-gray-500">
            Started by <span className="font-semibold text-gray-800">{lock?.startedByName}</span>
          </p>
          <div className="p-4 bg-white border-4 border-gray-50 rounded-2xl shadow-sm">
            <QRCodeSVG value={lock?.qrPayload || ""} size={256} />
          </div>
          <p className="text-sm font-medium text-blue-600 animate-pulse bg-blue-50 px-4 py-2 rounded-full">
            QR Code updates automatically every 60 seconds
          </p>
          <button
            onClick={stopBench}
            disabled={isBusy}
            className="w-full bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-600 font-semibold py-3 px-8 rounded-lg transition-colors"
          >
            {isBusy ? "Ending..." : "End Bench Session"}
          </button>
        </div>
      )}
    </div>
  );
}
