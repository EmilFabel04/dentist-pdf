import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

let app: FirebaseApp | undefined;
let auth: Auth | undefined;

function getFirebaseConfig() {
  const raw = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
  if (!raw) throw new Error("NEXT_PUBLIC_FIREBASE_CONFIG not set");
  return JSON.parse(raw);
}

export function getClientApp(): FirebaseApp {
  if (!app) {
    app = getApps().length > 0 ? getApps()[0] : initializeApp(getFirebaseConfig());
  }
  return app;
}

export function getClientAuth(): Auth {
  if (!auth) {
    auth = getAuth(getClientApp());
  }
  return auth;
}
