# PerfumesDuoc — Evaluación 3

Tienda de perfumes con arquitectura de microservicios.

```
Navegador (React)
      │  HTTPS + JWT de Microsoft Entra ID
      ▼
API Gateway  ── CORS + rutas /api/*      (local: Kong · nube: AWS API Gateway + JWT Authorizer)
      │
      ├─ products-service        :4001  Node + Postgres
      ├─ cart-service            :4002  Node
      ├─ orders-service          :4003  Node + Postgres
      ├─ notifications-service   :4004  Node
      ├─ coupons-service         :4005  Node + Postgres
      ├─ profile-service         :4006  Node + Postgres   (perfil de usuario)
      ├─ recommendations-service :4007  Node + Postgres   (recomendaciones)
      └─ mspago                  :8083  Spring Boot + Kafka + Webpay Plus (pagos y fraude)

RabbitMQ (colas de la Evaluación 2)      Kafka (4 tópicos, Evaluación 3)
```

## 1. Qué se corrigió y agregó en la Evaluación 3

| Punto del profesor | Dónde está |
|---|---|
| Tenant de Microsoft Azure | Sección 3 (pasos) · `JWT_MODE=azure` |
| API Gateway para el frontend | `gateway/kong/kong.yml` (local) y `gateway/aws/api-gateway.yml` (AWS) |
| CORS en el API Gateway | Plugin `cors` de Kong / `CorsConfiguration` de AWS. Los microservicios ya no tienen CORS |
| No usar proxy en backend | Se eliminó el gateway Express con `http-proxy-middleware` y las Lambdas proxy |
| Microservicio perfil de usuario | `services/profile-service` + página **Mi perfil** |
| Kafka, mínimo 2 tópicos | 4 tópicos, ver sección 5 |
| mspago con detección de fraude + botón de pago | `services/mspago` + páginas **Pago** y **Callback** |
| Microservicio de recomendaciones | `services/recommendations-service` + bloque "Recomendados para ti" |
| Pago seguro y registrado | Webpay Plus (integración), tabla `pagos`, sección 6 |

## 2. Levantar el proyecto en tu máquina

Requisito: Docker Desktop.

```bash
cd PerfumesDuoc
cp .env.example .env        # opcional: sin .env se usa el login local simulado
docker compose up -d --build
```

La primera vez tarda varios minutos (mspago descarga las dependencias de Maven).

| Qué | URL |
|---|---|
| Frontend | http://localhost:5173 |
| API Gateway | http://localhost:8080 |
| Kafka UI (tópicos y mensajes) | http://localhost:8085 |
| RabbitMQ | http://localhost:15672 (guest / guest) |

## 3. Microsoft Entra ID (Azure AD): crear el tenant y conectar el login

**A. Crear el tenant**
1. [portal.azure.com](https://portal.azure.com) → **Microsoft Entra ID** → **Administrar inquilinos** → **Crear**.
2. Tipo **Microsoft Entra ID** → organización `PerfumesDuoc`, dominio inicial (ej. `perfumesduoc2026.onmicrosoft.com`), país Chile → **Revisar y crear**.
3. Engranaje → **Directorios + suscripciones** → **Cambiar** al tenant nuevo.

**B. Registrar la aplicación**
4. **Registros de aplicaciones** → **Nuevo registro**: nombre `perfumesduoc-frontend`, **Solo las cuentas de este directorio**, URI de redirección tipo **Aplicación de página única (SPA)** = `http://localhost:5173`.
5. Copia el **Id. de aplicación (cliente)** y el **Id. de directorio (inquilino)**.

**C. Exponer la API**
6. **Exponer una API** → **Agregar** URI de id. de aplicación → deja `api://<client-id>` → **Guardar**.
7. **Agregar un ámbito**: nombre `access_as_user`, consentimiento **Administradores y usuarios**, **Habilitado**.
8. **Permisos de API** → **Agregar un permiso** → **Mis API** → `access_as_user` → **Conceder consentimiento de administrador**.
9. No cambies la versión del token en el Manifiesto (`requestedAccessTokenVersion` en `null`): los servicios validan la audiencia `api://<client-id>`.

**D. Usuario de prueba**
10. **Usuarios** → **Nuevo usuario** → **Crear usuario**.

**E. Configurar el proyecto** — en `PerfumesDuoc/.env`:
```
JWT_MODE=azure
AZURE_TENANT_ID=<tenant-id>
AZURE_CLIENT_ID=<client-id>
```
Luego `docker compose up -d --build` (el frontend se recompila con esos valores).

**F. Evidencia** — inicia sesión, copia el token de la cabecera `Authorization` (pestaña Network) y pégalo en [jwt.ms](https://jwt.ms): `aud = api://<client-id>`, `scp = access_as_user`, `tid` = tu tenant.

## 4. API Gateway y CORS

El navegador solo conoce una URL: la del gateway. Ningún microservicio tiene CORS ni se expone al frontend.

**Local (Kong, declarativo):** `gateway/kong/kong.yml` define las rutas `/api/*` y el plugin `cors` con el origen del frontend. No hay código de proxy en el backend.

**AWS API Gateway (HTTP API):** `gateway/aws/api-gateway.yml` crea el gateway con CORS, un **JWT Authorizer** nativo de Entra ID e integraciones HTTP directas a cada microservicio.

1. Levanta el backend en una EC2 (`docker compose up -d --build`) y abre en su Security Group los puertos 4001-4007 y 8083.
2. Despliega la plantilla (consola de CloudFormation → *Create stack* → subir archivo, o por CLI):
   ```bash
   aws cloudformation deploy --stack-name perfumesduoc-gateway \
     --template-file gateway/aws/api-gateway.yml \
     --parameter-overrides BackendHost=<dns-publico-ec2> FrontendOrigin=<url-del-frontend> \
       AzureTenantId=<tenant-id> AzureClientId=<client-id>
   ```
3. Copia la salida `ApiGatewayUrl` a `VITE_API_GATEWAY_URL` en `.env`, ajusta `WEBPAY_RETURN_URL=<url-del-frontend>/callback` y reconstruye el frontend.
4. Evidencia: sin token → `401`; con token → `200`; el preflight `OPTIONS` devuelve `access-control-allow-origin`.

> La plantilla pasa `cfn-lint`, pero no fue desplegada en una cuenta AWS real.

## 5. Kafka: tópicos

| Tópico | Produce | Consume (consumer group) | Para qué |
|---|---|---|---|
| `payment-attempts` | mspago | mspago (`payment-velocity-group`) | Cada intento de pago; alimenta la detección de fraude |
| `fraud-alerts` | mspago | notifications-service (`notifications-fraude-group`) | Aviso al equipo de seguridad cuando se bloquea un cliente |
| `payment-results` | mspago | orders-service (`orders-pagos-group`) | Resultado del pago; marca la orden como pagada |
| `orders-paid` | orders-service | recommendations-service (`recommendations-group`) | Historial de compras para recomendar |

## 6. Pago con Webpay y detección temprana de fraude (mspago)

Flujo del botón **Pagar con Webpay**:

1. El carrito crea la orden (`pendiente_pago`). El precio se vuelve a leer del catálogo, no del navegador.
2. `POST /api/pagos/iniciar {ordenId}`: mspago toma el cliente del JWT y el monto desde orders-service.
3. Si el cliente está bloqueado responde **429** y no llega a Webpay.
4. Publica el intento en `payment-attempts` y crea la transacción en Webpay Plus.
5. El cliente paga en Transbank y vuelve a `/callback`; mspago hace el `commit` y publica en `payment-results`.
6. orders-service marca la orden `pagada`, descuenta stock y envía el correo (RabbitMQ) y publica `orders-paid`.

**Regla de fraude (velocity check):** 3 intentos del mismo cliente en menos de 10 segundos → bloqueo automático de 30 minutos y alerta en `fraud-alerts`. Configurable con `FRAUDE_MAX_INTENTOS`, `FRAUDE_VENTANA_SEGUNDOS`, `FRAUDE_BLOQUEO_MINUTOS`. La clave del mensaje es el id del cliente, así sus intentos se procesan en orden.

**Seguridad del pago:** la tarjeta se ingresa solo en Transbank; mspago guarda en la tabla `pagos` la orden, cliente, monto, estado, código de autorización y los últimos 4 dígitos. Un token de Webpay solo se confirma una vez y el monto confirmado debe coincidir con el de la orden.

**Tarjetas de prueba** (RUT `11.111.111-1`, clave `123`):

| Tarjeta | Número | CVV | Resultado |
|---|---|---|---|
| VISA | 4051 8856 0044 6623 | 123 | Aprobada |
| MASTERCARD | 5186 0595 5959 0568 | 123 | Rechazada |

**Probar el fraude** (colección Postman o terminal):
```bash
TOKEN=$(curl -s -X POST localhost:8080/dev/login-local -H 'Content-Type: application/json' \
  -d '{"email":"bot@duoc.cl"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')
for i in 1 2 3 4 5; do curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:8080/api/pagos/iniciar \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"ordenId":1}'; done
```
Los últimos intentos responden `429`. Evidencia: `docker logs perfumesduoc-mspago | grep FRAUDE`, el mensaje en `fraud-alerts` (Kafka UI) y el correo simulado en `docker logs perfumesduoc-notifications`.

## 7. ¿Las colas de la Evaluación 2 se mantienen o se migran a Kafka?

**Se mantienen en RabbitMQ.** Kafka se agrega para los flujos nuevos; no reemplaza a las colas.

| | RabbitMQ (colas) | Kafka (tópicos) |
|---|---|---|
| Modelo | El mensaje es una **tarea**: se entrega a un consumidor y se borra al confirmarse | El mensaje es un **hecho** que queda en un log y puede releerse |
| Consumidores | Uno procesa cada mensaje | Varios grupos leen el mismo flujo, cada uno a su ritmo |
| Fortaleza | Ruteo flexible, reintentos y confirmación por mensaje | Alto volumen, orden por clave, historial y relectura |

- `orden.creada` (descontar stock), `orden.confirmada` (enviar correo) y los eventos de cupones son **tareas** que deben ejecutarse una sola vez por un único servicio. Eso es exactamente una cola; migrarlas no aporta nada y agrega riesgo.
- Los intentos de pago son un **flujo de eventos** de alto volumen que hay que analizar en orden por cliente y en milisegundos, y que conviene conservar para auditoría: eso es Kafka.
- `payment-results` y `orders-paid` los pueden leer varios servicios distintos (órdenes, recomendaciones, a futuro analítica) sin quitarse mensajes entre sí.

## 8. Evidencias para la defensa

- Login con Entra ID y token en jwt.ms (sección 3).
- `401` sin token y `200` con token a través del gateway; cabeceras CORS del gateway.
- Compra completa con tarjeta VISA de prueba y orden en estado **Pagada**.
- Kafka UI con los 4 tópicos y sus mensajes.
- Bloqueo por fraude (`429`) y alerta.
- **Mi perfil** guardado y recomendaciones que cambian después de comprar.

## 9. Estructura

```
PerfumesDuoc/
├── docker-compose.yml   .env.example
├── gateway/kong/kong.yml          # API Gateway local
├── gateway/aws/api-gateway.yml    # AWS API Gateway (CloudFormation)
├── frontend/                      # React + Vite + Tailwind + MSAL
├── services/                      # 7 microservicios Node + mspago (Spring Boot)
└── postman/
```
