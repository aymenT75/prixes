// Global auth + UI state (Zustand).
import { signOut } from "firebase/auth";
import { create } from "zustand";

import { api } from "./api";
import { auth } from "./firebase";
import { isNativeApp } from "./platform";
import { tokenStore } from "./tokens";
import type { User } from "./types";

interface AppState {
  user: User | null;
  loading: boolean;
  loginModalOpen: boolean;
  postModalOpen: boolean;
  loadMe: () => Promise<void>;
  setUser: (u: User | null) => void;
  logout: () => void;
  openLogin: (open: boolean) => void;
  openPost: (open: boolean) => void;
}

export const useApp = create<AppState>((set) => ({
  user: null,
  loading: true,
  loginModalOpen: false,
  postModalOpen: false,
  async loadMe() {
    if (!tokenStore.access) {
      set({ loading: false });
      return;
    }
    try {
      const user = await api.me();
      set({ user, loading: false });
    } catch {
      tokenStore.clear();
      set({ user: null, loading: false });
    }
  },
  setUser: (user) => set({ user }),
  logout: () => {
    tokenStore.clear();
    set({ user: null });
    // Also end the Firebase session (best-effort — ignore if not signed in).
    void signOut(auth).catch(() => {});
    // Native shell: end the native Firebase session too.
    if (isNativeApp()) {
      void import("@capacitor-firebase/authentication")
        .then(({ FirebaseAuthentication }) => FirebaseAuthentication.signOut())
        .catch(() => {});
    }
  },
  openLogin: (loginModalOpen) => set({ loginModalOpen }),
  openPost: (postModalOpen) => set({ postModalOpen }),
}));
