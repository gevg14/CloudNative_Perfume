Implementa aquí un handler liviano por servicio que reenvíe (fetch/axios) la
petición hacia la URL interna del microservicio correspondiente (por ejemplo,
el DNS del servicio en ECS o el Load Balancer). Ejemplo base:

```js
const axios = require('axios');
module.exports.handler = async (event) => {
  const resp = await axios.request({
    method: event.httpMethod,
    url: `${process.env.PRODUCTS_SERVICE_URL}${event.path.replace('/productos', '/productos')}`,
    data: event.body && JSON.parse(event.body),
    headers: event.headers,
  });
  return { statusCode: resp.status, body: JSON.stringify(resp.data) };
};
```
