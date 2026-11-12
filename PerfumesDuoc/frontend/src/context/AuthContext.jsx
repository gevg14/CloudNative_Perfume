import { createContext, useContext, useEffect, useState } from 'react';
import { AUTH_MODE } from '../authConfig';

const AuthContext = createContext(null);

// En modo "azure" el token real lo entrega MSAL (ver components/AzureLoginButton).
// En modo "local" se simula el login corporativo pidiendo un correo y
// obteniendo un JWT firmado por el propio backend (api-gateway/tools),
// para poder desarrollar y grabar evidencias sin depender de un tenant.
export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => sessionStorage.getItem('pd_token'));
  const [user, setUser] = useState(() => {
    const raw = sessionStorage.getItem('pd_user');
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    if (token) sessionStorage.setItem('pd_token', token);
    else sessionStorage.removeItem('pd_token');
  }, [token]);

  function login(newToken, newUser) {
    setToken(newToken);
    setUser(newUser);
    sessionStorage.setItem('pd_user', JSON.stringify(newUser));
  }

  function logout() {
    setToken(null);
    setUser(null);
    sessionStorage.removeItem('pd_user');
  }

  return (
    <AuthContext.Provider value={{ token, user, login, logout, authMode: AUTH_MODE }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
