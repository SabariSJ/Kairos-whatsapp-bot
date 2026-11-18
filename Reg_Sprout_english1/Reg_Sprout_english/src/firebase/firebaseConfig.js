/**
 * Firebase Modular SDK Configuration
 * 
 * Strict Spark Plan Compliance:
 * - Uses only Firebase Cloud Firestore and Firebase Hosting
 * - NO Firebase Cloud Functions
 * - NO Blaze plan or Billing account required
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyD9XZELF-znH3TPzejVXrK6NLBZk3Hl4XQ",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "reg-fe-and-sme-sprout.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://reg-fe-and-sme-sprout-default-rtdb.firebaseio.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "reg-fe-and-sme-sprout",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "reg-fe-and-sme-sprout.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "893604688981",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:893604688981:web:fe3cfa2fb2065f854e10dc",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-79W12XJRTT",
};

// Helpful console notice for development if variables are missing
if (!firebaseConfig.projectId) {
  console.warn(
    '[Firebase] Configuration manquante ou incomplète. Veuillez configurer le fichier .env en vous basant sur .env.example.'
  );
}

// Initialize Firebase App as a singleton
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Cloud Firestore
export const db = getFirestore(app);

// Initialize Firebase Auth
export const auth = getAuth(app);

export default app;
