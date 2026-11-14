"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode, FC} from "react";
import { auth } from "./firebase";
import type { User } from "firebase/auth";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { fetchUserProfile, type UserProfile } from "./profileService";
import * as Sentry from "@sentry/react";
import { toast } from "react-toastify";
import { clearCodeDrafts } from "./contestStorage";

const clearLocalCodeDrafts = () => {
  if (!clearCodeDrafts()) {
    toast.error("Local code drafts could not be cleared. Clear this site's browser data before leaving this computer.", {
      toastId: "code-draft-cleanup-failed",
    });
  }
};

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  logout: async () => {},
  refreshProfile: async () => {},
});

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUserProfile = async (userId: string) => {
    try {
      const profile = await fetchUserProfile(userId);
      setUserProfile(profile);
    } catch (error) {
      console.error("Failed to load user profile:", error);
      setUserProfile(null);
    }
  };

  useEffect(() => {
    let previousUserId = auth.currentUser?.uid;
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser || (previousUserId && previousUserId !== firebaseUser.uid)) {
        clearLocalCodeDrafts();
      }
      previousUserId = firebaseUser?.uid;
      setUser(firebaseUser);
      if (firebaseUser) {
        Sentry.setUser({
          id: firebaseUser.uid,
        });
        await loadUserProfile(firebaseUser.uid);
      } else {
        Sentry.setUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    await signOut(auth);
    clearLocalCodeDrafts();
    Sentry.setUser(null);
    setUser(null);
    setUserProfile(null);
  };

  const refreshProfile = async () => {
    if (user) {
      await loadUserProfile(user.uid);
    }
  };

  return <AuthContext.Provider value={{ user, userProfile, loading, logout, refreshProfile }}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => useContext(AuthContext);
