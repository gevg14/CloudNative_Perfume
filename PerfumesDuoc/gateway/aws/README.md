# Despliegue real en AWS API Gateway

Esta carpeta contiene lo necesario para reemplazar el gateway simulado por un
**AWS API Gateway real** con un **Lambda Authorizer** que valida los JWT
emitidos por Azure AD, tal como pide el enunciado.

## Pasos

1. Instala Serverless Framework: `npm install -g serverless`
2. Configura tus credenciales de AWS: `aws configure`
3. Completa las variables en `serverless.yml` (o usa variables de entorno):
   - `AZURE_TENANT_ID`: ID del tenant de Azure AD / Entra ID
   - `AZURE_CLIENT_ID`: Client ID (Application ID) de la app registrada
4. Despliega: `cd gateway/aws && serverless deploy`
5. El comando entrega la URL del API Gateway (Single Entrypoint). Reemplaza
   `VITE_API_GATEWAY_URL` en el frontend por esa URL.
6. Para la evidencia pedida ("bloqueo de peticiones sin token frente al éxito
   de peticiones autorizadas"):
   - Prueba sin header `Authorization` -> debe responder 401.
   - Prueba con un JWT inválido/expirado -> debe responder 403.
   - Prueba con un JWT válido obtenido tras el login en el Frontend -> 200.
