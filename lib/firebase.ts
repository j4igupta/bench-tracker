import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyB8R67nIDt_KpTLkdeCsXD-opX7lRBux34",
  authDomain: "bench-tracker-39b2c.firebaseapp.com",
  projectId: "bench-tracker-39b2c",
  storageBucket: "bench-tracker-39b2c.firebasestorage.app",
  messagingSenderId: "784110645357",
  appId: "1:784110645357:web:837ba3ca3031744a55cf64"
};

// Initialize Firebase (Prevents re-initializing in Next.js during hot reloads)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);