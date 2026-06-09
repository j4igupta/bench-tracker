"use client";

import { useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { doc, getDoc, setDoc, collection, addDoc, increment } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import imageCompression from "browser-image-compression";
import { db, auth, storage } from "../../lib/firebase";

export default function MemberView() {
  // Scanner State
  const [isScanning, setIsScanning] = useState(false);
  const [status, setStatus] = useState("Ready to scan.");
  
  // Task State
  const [taskDesc, setTaskDesc] = useState("");
  const [taskFile, setTaskFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // --- 1. QR SCANNER & ATTENDANCE LOGIC ---
  const handleScan = async (scannedText: string) => {
    setIsScanning(false);
    setStatus("Verifying QR code...");

    try {
      const benchDoc = await getDoc(doc(db, "benches", "active"));
      if (!benchDoc.exists()) {
        setStatus("❌ No active Bench session right now.");
        return;
      }

      if (scannedText === benchDoc.data().currentQrPayload) {
        const user = auth.currentUser;
        if (!user) return;

        const attendanceRef = doc(db, "attendance", user.uid);
        const attendanceSnap = await getDoc(attendanceRef);

        // SCENARIO A: They are currently checked in, so they are trying to Check Out.
        if (attendanceSnap.exists() && attendanceSnap.data().status === "Checked In") {
          const checkInTime = attendanceSnap.data().checkInTime.toDate();
          const checkOutTime = new Date();
          const hoursSpent = (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);

          await setDoc(attendanceRef, {
            checkOutTime: checkOutTime,
            status: "Checked Out",
            totalHours: increment(hoursSpent), 
            benchesAttended: increment(1) // <-- ADD THIS LINE to count the benches!
          }, { merge: true });
          
          setStatus(`✅ Checked Out! You logged ${hoursSpent.toFixed(2)} hours.`);
        } 
        
        // SCENARIO B: They exist in the system, but are checked out. Time to Check In!
        else if (attendanceSnap.exists()) {
          await setDoc(attendanceRef, {
            checkInTime: new Date(),
            status: "Checked In"
            // We specifically DO NOT touch totalHours here so we don't overwrite it!
          }, { merge: true });
          
          setStatus("✅ Successfully Checked In! Don't forget to scan out later.");
        } 
        
        // SCENARIO C: First time ever checking in.
        else {
          await setDoc(attendanceRef, {
            userId: user.uid,
            name: user.displayName,
            email: user.email,
            checkInTime: new Date(),
            status: "Checked In",
            totalHours: 0 // Initialize their total hours tracker
          });
          
          setStatus("✅ Successfully Checked In! Don't forget to scan out later.");
        }
      } else {
        setStatus("❌ Invalid or expired QR Code.");
      }
    } catch (error) {
      console.error(error);
      setStatus("❌ Error connecting to database.");
    }
  };

  // --- 2. TASK PHOTO UPLOAD LOGIC ---
  const handleTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskFile || !taskDesc) return;

    const user = auth.currentUser;
    if (!user) return;

    setIsUploading(true);
    setStatus("Compressing photo...");

    try {
      // Compress the image before uploading to save data and speed
      const options = {
        maxSizeMB: 0.5, // 500KB limit
        maxWidthOrHeight: 1024,
        useWebWorker: true,
      };
      const compressedFile = await imageCompression(taskFile, options);

      // Upload to Firebase Storage
      setStatus("Uploading task proof...");
      const fileRef = ref(storage, `tasks/${user.uid}_${Date.now()}`);
      await uploadBytes(fileRef, compressedFile);
      
      // Get the URL and save to Firestore
      const photoUrl = await getDownloadURL(fileRef);
      await addDoc(collection(db, "tasks"), {
        userId: user.uid,
        name: user.displayName,
        description: taskDesc,
        photoUrl: photoUrl,
        status: "Pending Approval",
        submittedAt: new Date()
      });

      setStatus("✅ Task submitted for approval!");
      setTaskDesc("");
      setTaskFile(null);
    } catch (error) {
      console.error("Upload failed", error);
      setStatus("❌ Failed to upload task.");
    } finally {
      setIsUploading(false);
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

          <button 
            type="submit" 
            disabled={isUploading || !taskFile || !taskDesc}
            className="w-full bg-gray-900 disabled:bg-gray-300 hover:bg-gray-800 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            {isUploading ? "Uploading..." : "Submit Task for Approval"}
          </button>
        </form>
      </div>
    </div>
  );
}