/* eslint-disable @next/next/no-img-element */
"use client";

import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "../../lib/firebase"; // Make sure db is imported!
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import AdminView from "../components/AdminView";
import MemberView from "../components/MemberView";
import TaskApprovals from "../components/TaskApprovals";

export default function Dashboard() {
  const [user, loading] = useAuthState(auth);
  const [role, setRole] = useState<string | null>(null);
  const router = useRouter();

  // 1. Kick them out if not logged in
  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [user, loading, router]);

  // 2. Fetch or Create their User Profile and Role
  useEffect(() => {
    const fetchRole = async () => {
      if (!user) return;
      
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        // They exist! Grab their role.
        setRole(userSnap.data().role);
      } else {
        // First time logging in! Create their profile as a regular member.
        await setDoc(userRef, {
          uid: user.uid,
          name: user.displayName,
          email: user.email,
          role: "member"
        });
        setRole("member");
      }
    };

    fetchRole();
  }, [user]);

  // Show loading screen while we wait for Firebase Auth AND the Role
  if (loading || !role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-xl font-semibold text-gray-500">Loading Dashboard...</p>
      </div>
    );
  }

  if (!user) return null;

 return (
    <main className="min-h-screen p-6 relative overflow-hidden">
      {/* Background Decor: Fish & Bubbles */}
      <div className="absolute top-10 left-10 text-6xl opacity-40 animate-float">🫧</div>
      <div className="absolute top-40 right-20 text-5xl opacity-40 animate-float-delayed">🫧</div>
      <div className="absolute bottom-20 left-1/4 text-7xl opacity-30 animate-float">🫧</div>
      
      {/* Decorative Images from your public folder */}
      <img src="/fish.png" alt="Fish" className="absolute top-32 left-8 w-24 opacity-80 animate-float" />
      <img src="/fish.png" alt="Fish" className="absolute top-64 right-12 w-32 opacity-80 animate-float-delayed" style={{ transform: "scaleX(-1)" }} />
      <img src="/olaf.png" alt="Olaf" className="absolute bottom-0 right-10 w-48 z-0" />

      {/* Main Content Dashboard - Glassmorphism style to see the water behind it */}
      <div className="max-w-4xl mx-auto relative z-10">
        
        <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-white/40 flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-extrabold text-blue-900 drop-shadow-sm">
              Welcome, {user.displayName} 🌊
            </h1>
            <span className={`inline-block mt-2 px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wide shadow-sm ${
              role === "admin" ? "bg-purple-500 text-white" : "bg-cyan-500 text-white"
            }`}>
              {role}
            </span>
          </div>
          <button 
            onClick={() => auth.signOut()}
            className="bg-red-500/10 hover:bg-red-500/20 text-red-700 font-bold py-2 px-4 rounded-lg transition-colors border border-red-200"
          >
            Sign Out
          </button>
        </div>
        
        {role === "admin" ? (
          <div className="space-y-6">
            <AdminView />
            <MemberView />
            <TaskApprovals />
          </div>
        ) : (
          <div className="space-y-6">
            <MemberView />
          </div>
        )}
      </div>
    </main>
  );
}