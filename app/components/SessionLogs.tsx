"use client";

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";

interface LogRow {
  id: string;
  name: string;
  email: string;
  date: string;
  hoursSpent: number;
  tasksCompleted: number;
  createdAt?: { toMillis: () => number };
}

interface StatRow {
  uid: string;
  name: string;
  totalHours: number;
  totalTasksCompleted: number;
  totalBenchesAttended: number;
}

export default function SessionLogs({ role }: { role: string }) {
  const [tab, setTab] = useState<"logs" | "summary">("logs");
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [stats, setStats] = useState<StatRow[]>([]);

  const user = auth.currentUser;
  const isAdmin = role === "admin";

  // Detailed per-session log rows.
  useEffect(() => {
    if (!user) return;

    const logsCol = collection(db, "sessionLogs");
    const q = isAdmin ? query(logsCol) : query(logsCol, where("uid", "==", user.uid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rows = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as LogRow[];
      // Newest first — sorted client-side to avoid needing a composite index.
      rows.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setLogs(rows);
    });

    return () => unsubscribe();
  }, [user, isAdmin]);

  // Lifetime summary stats.
  useEffect(() => {
    if (!user) return;

    if (isAdmin) {
      const unsubscribe = onSnapshot(collection(db, "memberStats"), (snapshot) => {
        const rows = snapshot.docs.map((d) => ({
          uid: d.id,
          ...d.data(),
        })) as StatRow[];
        rows.sort((a, b) => (b.totalHours || 0) - (a.totalHours || 0));
        setStats(rows);
      });
      return () => unsubscribe();
    } else {
      const unsubscribe = onSnapshot(doc(db, "memberStats", user.uid), (snapshot) => {
        setStats(snapshot.exists() ? [{ uid: snapshot.id, ...snapshot.data() } as StatRow] : []);
      });
      return () => unsubscribe();
    }
  }, [user, isAdmin]);

  const myStats = stats[0];

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mt-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">
          {isAdmin ? "Bench Logs" : "My Bench Logs"}
        </h2>
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setTab("logs")}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${
              tab === "logs" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
            }`}
          >
            Logs
          </button>
          <button
            onClick={() => setTab("summary")}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${
              tab === "summary" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
            }`}
          >
            Summary
          </button>
        </div>
      </div>

      {tab === "logs" ? (
        logs.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No session logs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500 uppercase text-xs tracking-wide">
                  <th className="py-2 pr-4">Date</th>
                  {isAdmin && <th className="py-2 pr-4">Name</th>}
                  <th className="py-2 pr-4">Hours</th>
                  <th className="py-2 pr-4">Tasks Completed</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((row) => (
                  <tr key={row.id} className="border-b border-gray-50">
                    <td className="py-2 pr-4 text-gray-700">{row.date}</td>
                    {isAdmin && <td className="py-2 pr-4 font-medium text-gray-900">{row.name}</td>}
                    <td className="py-2 pr-4 text-gray-700">{(row.hoursSpent || 0).toFixed(2)}</td>
                    <td className="py-2 pr-4 text-gray-700">{row.tasksCompleted || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : isAdmin ? (
        stats.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No summary data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500 uppercase text-xs tracking-wide">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Total Hours</th>
                  <th className="py-2 pr-4">Total Tasks</th>
                  <th className="py-2 pr-4">Benches Attended</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((row) => (
                  <tr key={row.uid} className="border-b border-gray-50">
                    <td className="py-2 pr-4 font-medium text-gray-900">{row.name}</td>
                    <td className="py-2 pr-4 text-gray-700">{(row.totalHours || 0).toFixed(2)}</td>
                    <td className="py-2 pr-4 text-gray-700">{row.totalTasksCompleted || 0}</td>
                    <td className="py-2 pr-4 text-gray-700">{row.totalBenchesAttended || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : !myStats ? (
        <p className="text-gray-500 text-sm text-center py-8">No summary data yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-blue-50 rounded-xl p-4 text-center">
            <p className="text-2xl font-extrabold text-blue-700">
              {(myStats.totalHours || 0).toFixed(2)}
            </p>
            <p className="text-xs font-medium text-blue-600 mt-1">Total Hours</p>
          </div>
          <div className="bg-purple-50 rounded-xl p-4 text-center">
            <p className="text-2xl font-extrabold text-purple-700">
              {myStats.totalTasksCompleted || 0}
            </p>
            <p className="text-xs font-medium text-purple-600 mt-1">Tasks Completed</p>
          </div>
          <div className="bg-cyan-50 rounded-xl p-4 text-center">
            <p className="text-2xl font-extrabold text-cyan-700">
              {myStats.totalBenchesAttended || 0}
            </p>
            <p className="text-xs font-medium text-cyan-600 mt-1">Benches Attended</p>
          </div>
        </div>
      )}
    </div>
  );
}
