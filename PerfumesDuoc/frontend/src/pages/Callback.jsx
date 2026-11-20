import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../lib/api';

// Página a la que Webpay devuelve al cliente. Envía el token a mspago, que
// confirma la transacción con Transbank y publica el resultado en Kafka.
export default function Callback() {
  const [searchParams] = useSearchParams();
  const [resultado, setResultado] = useState({ cargando: true });
  const enviado = useRef(false);

  useEffect(() => {
    if (enviado.current) return;
    enviado.current = true;

    const tokenWs = searchParams.get('token_ws');
    const tbkToken = searchParams.get('TBK_TOKEN'); // el cliente anuló el pago en Webpay
    if (!tokenWs && !tbkToken) {
      setResultado({ ok: false, mensaje: 'No se recibió respuesta de Webpay.' });
      return;
    }

    const peticion = tokenWs
      ? api.post('/api/pagos/commit', null, { params: { token_ws: tokenWs } })
      : api.post('/api/pagos/anular', null, { params: { tbk_token: tbkToken } });

    peticion
      .then((r) => setResultado({ ok: r.data.status === 'AUTHORIZED', pago: r.data }))
      .catch((err) =>
        setResultado({
          ok: false,
          pago: err.response?.data,
          mensaje: err.response?.data?.message || 'No se pudo confirmar el pago con el servidor.',
        })
      );
  }, [searchParams]);

  const { cargando, ok, pago, mensaje } = resultado;

  return (
    <div className="p-8 max-w-lg mx-auto text-center">
      {cargando && <h1 className="text-2xl font-serif">Validando tu pago con Transbank...</h1>}

      {!cargando && ok && (
        <>
          <h1 className="text-3xl font-serif mb-4 text-green-700">¡Pago aprobado!</h1>
          <p className="mb-2">
            Tu orden <strong>#{pago.ordenId}</strong> fue pagada correctamente.
          </p>
          <p className="mb-2">
            Total pagado: <strong>${Number(pago.amount).toLocaleString('es-CL')}</strong>
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Código de autorización {pago.codigoAutorizacion}
            {pago.tarjetaUltimos4 && ` · tarjeta terminada en ${pago.tarjetaUltimos4}`}. Te enviaremos un correo de
            confirmación.
          </p>
          <Link to="/mis-ordenes" className="text-perfume-gold underline">Ver mis órdenes</Link>
        </>
      )}

      {!cargando && !ok && (
        <>
          <h1 className="text-3xl font-serif mb-4 text-red-700">Pago rechazado</h1>
          <p className="mb-6">{mensaje || 'El pago fue rechazado o anulado.'} No se realizó ningún cobro.</p>
          {pago?.ordenId ? (
            <Link to={`/pago/${pago.ordenId}`} className="text-perfume-gold underline">Reintentar el pago</Link>
          ) : (
            <Link to="/mis-ordenes" className="text-perfume-gold underline">Ver mis órdenes</Link>
          )}
        </>
      )}
    </div>
  );
}
