import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { AUTH_MODE } from '../authConfig';
import { useMsal } from '@azure/msal-react';
import { loginRequest } from '../authConfig';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('cliente@duoc.cl');

  // --- Login corporativo real con Azure AD (OAuth2/OIDC + PKCE vía MSAL) ---
  const { instance } = AUTH_MODE === 'azure' ? useMsal() : { instance: null };

  async function loginConAzure() {
    const result = await instance.loginPopup(loginRequest);
    login(result.accessToken, {
      name: result.account.name,
      preferred_username: result.account.username,
    });
    navigate('/');
  }

  // --- Login simulado (sin tenant real) para desarrollo local ---
  async function loginLocal(e) {
    e.preventDefault();
    // El backend expone un endpoint de desarrollo que firma un JWT igual
    // al que emitiría Azure AD, para poder probar todo el flujo end-to-end.
    const { data } = await api.post('/dev/login-local', { email });
    login(data.token, { name: email.split('@')[0], preferred_username: email });
    navigate('/');
  }

  return (
    <div className="max-w-md mx-auto mt-16 bg-white p-8 rounded-xl shadow">
      <h1 className="text-2xl font-serif mb-6 text-center">Ingresar a PerfumesDuoc</h1>

      {AUTH_MODE === 'azure' ? (
        <button onClick={loginConAzure} className="w-full bg-perfume-dark text-white py-3 rounded-lg">
          Iniciar sesión con Microsoft (Azure AD)
        </button>
      ) : (
        <form onSubmit={loginLocal} className="flex flex-col gap-4">
          <p className="text-xs text-gray-500">
            Modo desarrollo (VITE_AUTH_MODE=local): simula el login corporativo sin
            requerir un tenant de Azure AD real.
          </p>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border rounded-lg px-3 py-2"
            placeholder="correo@duoc.cl"
          />
          <button className="bg-perfume-dark text-white py-3 rounded-lg">Ingresar</button>
        </form>
      )}
    </div>
  );
}
