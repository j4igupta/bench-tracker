"use client";

import { useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { collection, addDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import imageCompression from "browser-image-compression";
import { db, auth, storage } from "../../lib/firebase";
import { processScan, attributeTaskToActiveSession } from "../../lib/session";

// Photos under this size aren't worth spending time compressing.
const SKIP_COMPRESSION_UNDER_BYTES = 300 * 1024; // 300KB
// Reject absurdly large captures before we even try to touch them.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

export default function MemberView() {
  // Scanner State
  const [isScanning, setIsScanning] = useState(false);
  const [status, setStatus] = useState("Ready to scan.");

  // Task State
  const [taskDesc, setTaskDesc] = useState("");
  const [taskFile, setTaskFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // --- 1. QR SCANNER & ATTENDANCE LOGIC ---
  const handleScan = async (scannedText: string) => {
    setIsScanning(false);
    setStatus("Verifying QR code...");

    const user = auth.currentUser;
    if (!user) return;

    try {
      const result = await processScan(
        scannedText,
        user.uid,
        user.displayName || "Unknown",
        user.email || ""
      );
      setStatus(result.message);
    } catch (error) {
      console.error(error);
      setStatus("❌ Error connecting to database.");
    }
  };

  // --- 2. TASK PHOTO UPLOAD LOGIC (optimized for speed & reliability) ---
  const handleTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskFile || !taskDesc) return;

    const user = auth.currentUser;
    if (!user) return;

    if (taskFile.size > MAX_UPLOAD_BYTES) {
      setStatus("❌ That photo is too large. Please choose a smaller one.");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Skip compression for files that are already small — this alone
      // saves several seconds on a lot of phones, since the compression
      // worker doesn't need to spin up at all.
      let fileToUpload: File | Blob = taskFile;
      if (taskFile.size > SKIP_COMPRESSION_UNDER_BYTES) {
        setStatus("Compressing photo...");
        fileToUpload = await imageCompression(taskFile, {
          maxSizeMB: 0.3,
          maxWidthOrHeight: 800,
          useWebWorker: true,
          // Skip the slow iterative high-quality passes — proof photos
          // don't need to be pixel-perfect, just legible.
          initialQuality: 0.7,
        });
      }

      setStatus("Uploading task proof...");
      const fileRef = ref(storage, `tasks/${user.uid}_${Date.now()}`);
      const uploadTask = uploadBytesResumable(fileRef, fileToUpload);

      // uploadBytesResumable (vs. the old uploadBytes) auto-retries on
      // flaky connections and gives us real progress, instead of the UI
      // just sitting frozen on "Uploading..." with no feedback.
      await new Promise<void>((resolve, reject) => {
        uploadTask.on(
          "state_changed",
          (snapshot) => {
            const pct = Math.round(
              (snapshot.bytesTransferred / snapshot.totalBytes) * 100
            );
            setUploadProgress(pct);
          },
          (error) => reject(error),
          () => resolve()
        );
      });

      const photoUrl = await getDownloadURL(uploadTask.snapshot.ref);

      // Attribute this task to whatever session the member is currently
      // checked into (if any), so it shows up in that session's log.
      const sessionId = await attributeTaskToActiveSession(user.uid);

      await addDoc(collection(db, "tasks"), {
        userId: user.uid,
        name: user.displayName,
        description: taskDesc,
        photoUrl: photoUrl,
        status: "Pending Approval",
        submittedAt: new Date(),
        sessionId,
      });

      setStatus("✅ Task submitted for approval!");
      setTaskDesc("");
      setTaskFile(null);
    } catch (error) {
      console.error("Upload failed", error);
      setStatus("❌ Failed to upload task. Check your connection and try again.");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center text-center mt-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Member Dashboard</h2>
      <p className="text-gray-500 mb-6">{status}</p>

      {/* Check In / Out Section */}
      {!isScanning ? (
        <button
          onClick={() => setIsScanning(true)}
          className="w-full mb-8 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors shadow-sm"
        >
          Open Camera to Scan
        </button>
      ) : (
        <div className="w-full mb-8 max-w-sm overflow-hidden rounded-2xl border-4 border-blue-50">
          <Scanner onScan={(result) => handleScan(result[0].rawValue)} formats={['qr_code']} />
          <button
            onClick={() => setIsScanning(false)}
            className="mt-4 w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2 rounded-lg"
          >
            Cancel Scan
          </button>
        </div>
      )}

      <hr className="w-full border-gray-100 mb-8" />

      {/* Task Submission Section */}
      <div className="w-full text-left">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Submit a Task</h3>
        <form onSubmit={handleTaskSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">What did you finish?</label>
            <input 
              type="text" 
              required
              value={taskDesc}
              onChange={(e) => setTaskDesc(e.target.value)}
              placeholder="e.g., Painted 3 posters"
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Photo Proof</label>
            <input 
              type="file" 
              accept="image/*"
              capture="environment"
              required
              onChange={(e) => setTaskFile(e.target.files ? e.target.files[0] : null)}
              className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          {isUploading && (
            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-150"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}

          <button 
            type="submit" 
            disabled={isUploading || !taskFile || !taskDesc}
            className="w-full bg-gray-900 disabled:bg-gray-300 hover:bg-gray-800 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            {isUploading ? `Uploading... ${uploadProgress}%` : "Submit Task for Approval"}
          </button>
        </form>
      </div>
    </div>
  );
}
