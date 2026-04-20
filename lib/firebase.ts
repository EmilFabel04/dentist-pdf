import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const PRACTICE_ID = "default";

function getApp() {
  if (getApps().length > 0) return getApps()[0];

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    } as ServiceAccount),
  });
}

let _db: Firestore | undefined;

function getDb() {
  if (!_db) {
    _db = getFirestore(getApp());
  }
  return _db;
}

export const db = new Proxy({} as Firestore, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export const practiceRef = new Proxy(
  {} as FirebaseFirestore.DocumentReference,
  {
    get(_target, prop, receiver) {
      const real = getDb().collection("practices").doc(PRACTICE_ID);
      const value = Reflect.get(real, prop, receiver);
      return typeof value === "function" ? value.bind(real) : value;
    },
  }
);

export async function verifyAuth(request: Request): Promise<{ uid: string; practiceId: string }> {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }
  const token = header.slice(7);
  const decoded = await getAuth(getApp()).verifyIdToken(token);

  const userDoc = await getDb().collection("users").doc(decoded.uid).get();
  if (!userDoc.exists) {
    throw new Error("User not registered");
  }
  const { practiceId } = userDoc.data() as { practiceId: string };
  return { uid: decoded.uid, practiceId };
}

export function getPracticeRef(practiceId: string) {
  return getDb().collection("practices").doc(practiceId);
}

export function getStorageBucket() {
  return getStorage(getApp()).bucket();
}
