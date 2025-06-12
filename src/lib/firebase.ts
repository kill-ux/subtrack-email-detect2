import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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