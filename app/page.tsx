"use client";

import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  const handleSignIn = async () => {
    try {
      // This pops up the Google login window
      await signInWithPopup(auth, googleProvider);
      
      // If successful, send them to the dashboard!
      router.push("/dashboard");
    } catch (error) {
      console.error("Login failed:", error);
      alert("Failed to log in. Please try again.");
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="bg-white p-10 rounded-2xl shadow-xl max-w-md w-full text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Bench Tracker
        </h1>
        <p className="text-gray-500 mb-8">
          Class Council Attendance & Task Verification.
        </p>
        
        <button 
          onClick={handleSignIn}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
        >
          Sign in with Google
        </button>
      </div>
    </main>
  );
}