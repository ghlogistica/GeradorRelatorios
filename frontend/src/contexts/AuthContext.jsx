import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, googleProvider, signInWithPopup, signOut } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Check if user is in our backend (invited)
          const res = await fetch(`/api/me?email=${encodeURIComponent(firebaseUser.email)}`);
          const data = await res.json();

          if (!res.ok) {
            // Not invited or no profile
            setError(data.error || 'Acesso negado.');
            await signOut(auth);
            setCurrentUser(null);
            setUserProfile(null);
          } else {
            setCurrentUser(firebaseUser);
            setUserProfile(data.perfil); // { telas_acesso, categorias_modelos, isAdmin }
            setError('');
          }
        } catch (err) {
          console.error(err);
          setError('Erro de conexão ao verificar permissões.');
          await signOut(auth);
          setCurrentUser(null);
          setUserProfile(null);
        }
      } else {
        setCurrentUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const loginWithGoogle = async () => {
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error(err);
      setError('Falha ao fazer login com o Google.');
    }
  };

  const logout = () => {
    return signOut(auth);
  };

  const value = {
    currentUser,
    userProfile,
    loginWithGoogle,
    logout,
    error
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
