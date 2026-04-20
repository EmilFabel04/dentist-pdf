"use client";

import { useEffect, useState, useCallback } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { getClientAuth } from "./firebase-client";

type AuthState = {
  user: User | null;
  loading: boolean;
};

export function useAuth(): AuthState & {
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
} {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    const auth = getClientAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setState({ user, loading: false });
    });
    return unsubscribe;
  }, []);

  async function signIn(email: string, password: string) {
    const auth = getClientAuth();
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function signOut() {
    const auth = getClientAuth();
    await fbSignOut(auth);
  }

  const getToken = useCallback(async () => {
    return state.user ? state.user.getIdToken() : null;
  }, [state.user]);

  return { ...state, signIn, signOut, getToken };
}
