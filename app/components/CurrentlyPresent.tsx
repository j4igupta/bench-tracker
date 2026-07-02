"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, Timestamp, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { subscribeToLock } from "../../lib/session";

interface Attendee {
  uid: string;
  name: string;
  checkInTime: Timestamp;
}

export default function CurrentlyPresent() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [present, setPresent] = useState<Attendee[]>([]);

  // Track whether there's an active session at all.
  useEffect(() => {
    const unsubscribe = subscribeToLock((lock) => {
      setSessionId(lock?.activeSessionId ?? null);
    });
    return () => unsubscribe();
  }, []);

  // Live list of everyone currently checked in to that session.
  useEffect(() => {
    if (!sessionId) {
      // FIX: Tell the linter to allow this specific state update
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPresent([]);
      return;
    }

    const q = query(
      collection(db, "sessions", sessionId, "attendees"),
      where("status", "==", "Checked In")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const attendees = snapshot.docs.map((d) => ({
        uid: d.id,
        ...d.data(),
      })) as Attendee[];
      // Most recently checked-in first.
      attendees.sort(
        (a, b) => b.checkInTime.toMillis() - a.checkInTime.toMillis()
      );
      setPresent(attendees);
    });

    return () => unsubscribe();
  }, [sessionId]);

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mt-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">
        🟢 Currently at the Bench{present.length > 0 ? ` (${present.length})` : ""}
      </h2>

      {!sessionId ? (
        <p className="text-gray-500 text-sm">No active bench session right now.</p>
      ) : present.length === 0 ? (
        <p className="text-gray-500 text-sm">No one is currently checked in.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {present.map((p) => (
            <li
              key={p.uid}
              className="flex items-center justify-between bg-green-50 border border-green-100 rounded-lg px-4 py-2"
            >
              <span className="font-medium text-gray-800">{p.name}</span>
              <span className="text-xs text-green-700">
                since{" "}
                {p.checkInTime?.toDate
                  ? p.checkInTime.toDate().toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "--"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}