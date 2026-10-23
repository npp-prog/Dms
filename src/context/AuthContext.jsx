import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail,
  signInWithEmailAndPassword, signOut, updateProfile,
} from 'firebase/auth';
import { auth } from '../firebase.js';
import { ensureUserProfile, getSettings } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Registration details waiting for the auth listener to create the profile.
  const pendingProfile = useRef(null);

  const loadProfile = useCallback(async (firebaseUser) => {
    const p = await ensureUserProfile(firebaseUser, pendingProfile.current || {});
    pendingProfile.current = null;
    setProfile(p);
    if (p.active) setSettings(await getSettings().catch(() => ({})));
    return p;
  }, []);

  useEffect(() => onAuthStateChanged(auth, async (firebaseUser) => {
    setLoading(true);
    setUser(firebaseUser);
    setError('');
    if (!firebaseUser) {
      setProfile(null);
      setLoading(false);
      return;
    }
    try {
      await loadProfile(firebaseUser);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }), [loadProfile]);

  const value = {
    user,
    profile,
    settings,
    setSettings,
    loading,
    error,
    isAdmin: profile?.active && ['admin', 'superadmin'].includes(profile.role),
    isSuper: profile?.active && profile.role === 'superadmin',
    // Combined identity used when stamping documents.
    actor: user && profile ? { uid: user.uid, email: user.email, displayName: profile.displayName, office: profile.office } : null,
    login: (email, password) => signInWithEmailAndPassword(auth, email, password),
    register: async ({ email, password, displayName, office }) => {
      pendingProfile.current = { displayName, office };
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName });
    },
    resetPassword: (email) => sendPasswordResetEmail(auth, email),
    logout: () => signOut(auth),
    refreshProfile: async () => {
      if (!user) return;
      setError('');
      try { await loadProfile(user); } catch (e) { setError(e.message); }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
