import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_GATEWAY_URL });

// Interceptor: adjunta el JWT (de Azure AD o del login local simulado) en
// cada petición HTTP, tal como pide el enunciado ("Interceptores para
// adjuntar el token en las peticiones HTTP").
export function attachAuthInterceptor(getToken) {
  api.interceptors.request.use((config) => {
    const token = getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
}

export default api;
