// Configuración de MSAL para el login corporativo con Azure AD (OAuth 2.0 /
// OIDC con PKCE, que MSAL implementa automáticamente en el flujo Authorization
// Code + PKCE para SPAs).
export const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID}`,
    redirectUri: import.meta.env.VITE_AZURE_REDIRECT_URI || window.location.origin,
  },
  cache: { cacheLocation: 'sessionStorage' },
};

export const loginRequest = {
  scopes: [`api://${import.meta.env.VITE_AZURE_CLIENT_ID}/access_as_user`],
};

export const AUTH_MODE = import.meta.env.VITE_AUTH_MODE || 'local';
