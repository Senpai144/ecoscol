import { createContext, useContext, useState, useCallback } from 'react';
import {
  recupererSession,
  sauvegarderSession,
  effacerSession,
  seConnecter,
  seDeconnecter,
} from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => recupererSession());

  const login = useCallback(async (identifiant, motDePasse) => {
    const user = await seConnecter(identifiant, motDePasse);
    setSession({
      token: localStorage.getItem('ecoscol_token'),
      user,
    });
    return user;
  }, []);

  const logout = useCallback(async () => {
    if (session) {
      await seDeconnecter(session.token);
    }
    setSession(null);
  }, [session]);

  const aRole = useCallback(
    (role) => session?.user?.roles?.includes(role) ?? false,
    [session]
  );

  return (
    <AuthContext.Provider value={{ session, login, logout, aRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}