import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAxTkK4mt_IpPoHlgflnzGkX6kiCpqpy_U",
  authDomain: "subscription-tracker-3febe.firebaseapp.com",
  projectId: "subscription-tracker-3febe",
  storageBucket: "subscription-tracker-3febe.firebasestorage.app",
  messagingSenderId: "882378817707",
  appId: "1:882378817707:web:a769d24c6867d44e6db7ee"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Configure auth settings for better popup handling
auth.settings = {
  appVerificationDisabledForTesting: false
};

// Set custom domain for auth if needed
if (typeof window !== 'undefined') {
  // Ensure proper domain configuration
  console.log('🔧 Firebase initialized with domain:', window.location.hostname);
}