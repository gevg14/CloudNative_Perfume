# PerfumesDuoc — Arquitectura de Microservicios

Proyecto de tienda online de perfumes construido siguiendo el encargo
**"Pedidos360 – Arquitectura de Microservicios"** (`Enunciado_2.docx`), adaptado
al rubro de perfumería. Usa como base de estilo/convenciones el proyecto de
referencia entregado (`CodigoFuenteB.zip`), pero con una arquitectura de
microservicios independiente en vez de un monolito.

## 1. Arquitectura

```
                         ┌─────────────────────┐
                         │  Azure AD / Entra ID │  (OAuth2 / OIDC + PKCE)
                         │   IDaaS - Login      │
                         └──────────┬───────────┘
                                    │ JWT
                         ┌──────────▼───────────┐
   Frontend (React) ────▶│   AWS API Gateway     │  Single Entrypoint
                         │  + JWT Authorizer     │  (401 / 403)
                         └──────────┬───────────┘
              ┌─────────────┬───────┼───────────┬─────────────┐
              ▼             ▼       ▼           ▼             ▼
        products-svc   cart-svc  orders-svc  notifications  coupons-svc
                                                svc          (a elección)
              │             │       │           ▲             ▲
              └──────HTTP───┘       │           │             │
                                    └──RabbitMQ──┴─────────────┘
```

- **Frontend**: React + Vite + Tailwind. Login corporativo con Azure AD
  mediante MSAL (`@azure/msal-react`), interceptor Axios que adjunta el JWT a
  cada request.
- **AWS API Gateway (`gateway/`)**: punto de entrada único. En local se simula
  con Express + JWT Authorizer; para producción real, `gateway/aws/` trae
  `serverless.yml` + Lambda Authorizer para desplegar en AWS de verdad.
- **RabbitMQ**: exchange `perfumesduoc.events` (topic). Eventos usados:
  - `orden.creada` → `orders-service` lo publica, `products-service` lo
    consume para descontar stock.
  - `orden.confirmada` → `orders-service` lo publica, `notifications-service`
    lo consume para enviar el correo de confirmación.
  - `cupon.usado` → `orders-service` lo publica, `coupons-service` lo
    consume para registrar el uso/auditoría del cupón.
- **Microservicio nuevo a elección**: **Cupones de descuento**
  (`coupons-service`), valida cupones síncronamente al pagar y audita su uso
  de forma asíncrona por RabbitMQ.

## 2. Cómo levantar todo en local (modo simulado, sin cuentas cloud)

```bash
cp .env.example .env
docker compose up --build
```

- Frontend: http://localhost:5173
- API Gateway: http://localhost:8080
- RabbitMQ panel: http://localhost:15672 (guest/guest)

Por defecto `JWT_MODE=local` y `VITE_AUTH_MODE=local`: el login usa un
endpoint de desarrollo (`POST /dev/login-local`) que firma un JWT igual en
forma al que emitiría Azure AD, para poder probar **todo el flujo end-to-end**
sin depender de un tenant real. Cuando tengas tu tenant, basta con cambiar las
variables de entorno (ver sección 3) — el código de negocio no cambia.

## 3. Cómo conectar Azure AD real (login corporativo)

1. Portal de Azure → **Microsoft Entra ID** → **Registros de aplicaciones** →
   Nuevo registro (tipo SPA), redirect URI `http://localhost:5173`.
2. Copia el **Application (client) ID** y el **Directory (tenant) ID**.
3. Expón un scope de API (`api://<client-id>/access_as_user`) si vas a
   proteger tus propios endpoints con un access token de esa API.
4. En `frontend/.env`:
   ```
   VITE_AUTH_MODE=azure
   VITE_AZURE_CLIENT_ID=<client-id>
   VITE_AZURE_TENANT_ID=<tenant-id>
   ```
5. En `docker-compose.yml` (o `.env` raíz) cambia `JWT_MODE=azure` y define
   `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` iguales a los anteriores, para que el
   gateway y los microservicios validen el JWT contra las llaves públicas
   (JWKS) reales de tu tenant.

## 4. Cómo desplegar el AWS API Gateway real

Ver `gateway/aws/README.md`. Resumen: `serverless deploy` crea el API Gateway
con un Lambda Authorizer que valida el JWT de Azure AD; las rutas reenvían
hacia donde tengas corriendo los contenedores (ECS/EKS/EC2/Load Balancer).

## 5. Probar notificaciones desde Postman

Importa `postman/PerfumesDuoc.postman_collection.json`. Incluye:

- `POST {{gateway}}/dev/login-local` → obtiene un JWT de prueba.
- `POST {{notifications}}/notificaciones/correo` → dispara un correo directo
  (cumple el requisito "debe permitir ser probado enviando una petición
  directa desde Postman"). Por defecto corre en modo `EMAIL_SIMULATION=true`
  y deja el correo "enviado" en los logs del contenedor
  (`docker logs perfumesduoc-notifications`) — sirve como evidencia si no
  tienes un SMTP real; si tienes uno, configura `SMTP_*` en `.env` y pon
  `EMAIL_SIMULATION=false`.
- Endpoints de catálogo, carrito, cupones y órdenes con y sin token, para
  evidenciar los 401/403 del JWT Authorizer.

## 6. Checklist de entregables (según Enunciado_2.docx)

- [ ] Repos de GitHub separados por componente (frontend, cada microservicio,
      gateway). Sugerencia: sube cada carpeta como su propio repo o usa
      submódulos/mono-repo con carpetas claramente separadas (como ya está).
- [ ] Evidencia del login en el Frontend obteniendo el token de Azure AD
      (captura del DevTools mostrando el `id_token`/`access_token`).
- [ ] Capturas del API Gateway (o del gateway simulado) mostrando 401/403 sin
      token vs 200 con token válido (colección de Postman incluida).
- [ ] Evidencia de RabbitMQ: panel de management mostrando la cola
      `products.orden-creada` consumida tras una compra, y el stock
      actualizado en la tabla `productos`.
- [ ] Evidencia de `notifications-service`: log del correo simulado o correo
      real recibido, probado desde Postman.
- [ ] Evidencia de `coupons-service`: aplicar un cupón (`BIENVENIDO10`) en el
      checkout y mostrar el registro en `cupones_uso_log` tras el evento
      `cupon.usado`.

## 7. Estructura del repositorio

```
PerfumesDuoc/
├── docker-compose.yml
├── gateway/                 # AWS API Gateway (simulado) + artefactos AWS reales
├── services/
│   ├── products-service/
│   ├── cart-service/
│   ├── orders-service/
│   ├── notifications-service/
│   └── coupons-service/     # microservicio nuevo a elección
├── frontend/                # React + Vite + Tailwind + MSAL (Azure AD)
└── postman/
```
