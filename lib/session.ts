import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  runTransaction,
  writeBatch,
  increment,
  onSnapshot,
  getDocs,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

/**
 * Data model
 * ----------
 * locks/bench            -> singleton "lock" doc. Tells everyone whether a
 *                            session is currently active, who started it,
 *                            and the current rotating QR payload. This is
 *                            the single source of truth used to enforce
 *                            "only one active session at a time."
 *
 * sessions/{sessionId}    -> one doc per bench session (historical record).
 * sessions/{sessionId}/attendees/{uid} -> live attendance for that session.
 *
 * sessionLogs/{sessionId}_{uid} -> one finalized row per person per session,
 *                            written when the session ends. This is the
 *                            "log" the admin/member sees in the app.
 *
 * memberStats/{uid}       -> running lifetime totals per person
 *                            (totalHours, totalTasksCompleted, totalBenchesAttended).
 */

export interface LockData {
  activeSessionId: string | null;
  startedBy?: string;
  startedByName?: string;
  startTime?: { toDate: () => Date } | null;
  qrPayload?: string;
  qrUpdatedAt?: { toDate: () => Date } | null;
}

const lockRef = () => doc(db, "locks", "bench");

/** Live-subscribe to the lock doc (active session pointer + QR payload). */
export function subscribeToLock(
  callback: (lock: LockData | null) => void
): Unsubscribe {
  return onSnapshot(lockRef(), (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    const data = snap.data();
    if (!data.activeSessionId) {
      callback(null);
      return;
    }
    callback(data as LockData);
  });
}

/**
 * Starts a new bench session, atomically refusing to do so if one is
 * already active. Automatically checks in the admin who started it, so
 * they get credit for the hours without needing to scan their own QR code.
 */
export async function startBenchSession(
  uid: string,
  name: string,
  email: string
): Promise<string> {
  const newSessionRef = doc(collection(db, "sessions"));

  await runTransaction(db, async (tx) => {
    const lockSnap = await tx.get(lockRef());

    if (lockSnap.exists() && lockSnap.data().activeSessionId) {
      const startedByName = lockSnap.data().startedByName || "another admin";
      throw new Error(
        `A bench session is already active (started by ${startedByName}). End it before starting a new one.`
      );
    }

    const now = new Date();
    const qrPayload = `bench_secret_${now.getTime()}`;

    tx.set(newSessionRef, {
      id: newSessionRef.id,
      startedBy: uid,
      startedByName: name,
      startTime: now,
      endTime: null,
      isActive: true,
    });

    tx.set(lockRef(), {
      activeSessionId: newSessionRef.id,
      startedBy: uid,
      startedByName: name,
      startTime: now,
      qrPayload,
      qrUpdatedAt: now,
    });

    const attendeeRef = doc(
      db,
      "sessions",
      newSessionRef.id,
      "attendees",
      uid
    );
    tx.set(attendeeRef, {
      uid,
      name,
      email,
      checkInTime: now,
      checkOutTime: null,
      status: "Checked In",
      hoursSpent: 0,
      tasksCompleted: 0,
    });
  });

  return newSessionRef.id;
}

/** Rotates the QR payload for the currently active session. */
export async function rotateQrPayload(sessionId: string): Promise<string> {
  const now = new Date();
  const qrPayload = `bench_secret_${now.getTime()}`;

  // Guard against a stale interval firing after the session already ended.
  const currentLock = await getDoc(lockRef());
  if (!currentLock.exists()) {
    return "";
  }
  if (currentLock.data().activeSessionId !== sessionId) {
    return "";
  }

  await updateDoc(lockRef(), { qrPayload, qrUpdatedAt: now });
  return qrPayload;
}

/**
 * Ends the active session:
 *  - auto checks-out anyone still checked in
 *  - writes one finalized log row per attendee to `sessionLogs`
 *  - rolls each attendee's hours/tasks/attendance into `memberStats`
 *  - releases the lock so a new session can start
 */
export async function endBenchSession(sessionId: string): Promise<void> {
  const sessionRef = doc(db, "sessions", sessionId);
  const attendeesSnap = await getDocs(
    collection(db, "sessions", sessionId, "attendees")
  );

  const now = new Date();
  const sessionDateStr = now.toLocaleDateString();
  const batch = writeBatch(db);

  attendeesSnap.forEach((attendeeDoc) => {
    const data = attendeeDoc.data();
    const uid = attendeeDoc.id;

    let hoursSpent: number = data.hoursSpent || 0;
    let checkOutTime = data.checkOutTime;

    if (data.status === "Checked In") {
      const checkInTime: Date = data.checkInTime.toDate();
      checkOutTime = now;
      hoursSpent =
        (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);

      batch.update(attendeeDoc.ref, {
        checkOutTime,
        status: "Checked Out",
        hoursSpent,
      });
    }

    const tasksCompleted: number = data.tasksCompleted || 0;

    // One log row for this person, for this session.
    const logRef = doc(db, "sessionLogs", `${sessionId}_${uid}`);
    batch.set(logRef, {
      sessionId,
      uid,
      name: data.name || "Unknown",
      email: data.email || "",
      date: sessionDateStr,
      checkInTime: data.checkInTime,
      checkOutTime,
      hoursSpent,
      tasksCompleted,
      createdAt: now,
    });

    // Lifetime running totals for the summary tab.
    const statsRef = doc(db, "memberStats", uid);
    batch.set(
      statsRef,
      {
        uid,
        name: data.name || "Unknown",
        email: data.email || "",
        totalHours: increment(hoursSpent),
        totalTasksCompleted: increment(tasksCompleted),
        totalBenchesAttended: increment(1),
      },
      { merge: true }
    );
  });

  batch.update(sessionRef, { endTime: now, isActive: false });
  batch.set(lockRef(), { activeSessionId: null }, { merge: true });

  await batch.commit();
}

/** Result of a QR scan attempt, used by the member check-in/out flow. */
export interface ScanResult {
  ok: boolean;
  message: string;
}

/**
 * Handles a member scanning the bench QR code: verifies it against the
 * live payload in Firestore, then toggles the scanner's own check-in state
 * for the active session (check in if they were out, check out if in).
 */
export async function processScan(
  scannedText: string,
  uid: string,
  name: string,
  email: string
): Promise<ScanResult> {
  const lockSnap = await getDoc(lockRef());

  if (!lockSnap.exists()) {
    return { ok: false, message: "❌ No active Bench session right now." };
  }

  const lock = lockSnap.data();
  if (!lock.activeSessionId) {
    return { ok: false, message: "❌ No active Bench session right now." };
  }

  if (scannedText !== lock.qrPayload) {
    return { ok: false, message: "❌ Invalid or expired QR Code." };
  }

  const sessionId = lock.activeSessionId as string;
  const attendeeRef = doc(db, "sessions", sessionId, "attendees", uid);
  const attendeeSnap = await getDoc(attendeeRef);

  if (attendeeSnap.exists() && attendeeSnap.data().status === "Checked In") {
    // They're in already -> this scan checks them out.
    const checkInTime: Date = attendeeSnap.data().checkInTime.toDate();
    const checkOutTime = new Date();
    const hoursSpent =
      (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);

    await updateDoc(attendeeRef, {
      checkOutTime,
      status: "Checked Out",
      hoursSpent,
    });

    return {
      ok: true,
      message: `✅ Checked Out! You logged ${hoursSpent.toFixed(2)} hours.`,
    };
  }

  // Not currently checked in (either brand new this session, or re-entering) -> check in.
  const prev = attendeeSnap.exists() ? attendeeSnap.data() : null;
  await setDoc(
    attendeeRef,
    {
      uid,
      name,
      email,
      checkInTime: new Date(),
      checkOutTime: null,
      status: "Checked In",
      hoursSpent: prev?.hoursSpent || 0,
      tasksCompleted: prev?.tasksCompleted || 0,
    },
    { merge: true }
  );

  return {
    ok: true,
    message: "✅ Successfully Checked In! Don't forget to scan out later.",
  };
}

/**
 * Attributes a just-submitted task to the member's current session (if
 * they're checked in to one right now), bumping that session's task count.
 * Returns the sessionId to store on the task doc, or null if not in a
 * session.
 */
export async function attributeTaskToActiveSession(
  uid: string
): Promise<string | null> {
  const lockSnap = await getDoc(lockRef());
  if (!lockSnap.exists()) return null;
  if (!lockSnap.data().activeSessionId) return null;

  const sessionId = lockSnap.data().activeSessionId as string;
  const attendeeRef = doc(db, "sessions", sessionId, "attendees", uid);
  const attendeeSnap = await getDoc(attendeeRef);

  if (attendeeSnap.exists() && attendeeSnap.data().status === "Checked In") {
    await updateDoc(attendeeRef, { tasksCompleted: increment(1) });
    return sessionId;
  }

  return null;
}
