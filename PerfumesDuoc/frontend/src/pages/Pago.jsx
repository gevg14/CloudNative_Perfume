import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../lib/api';

// Botón de pago: inicia la transacción en mspago y redirige a Webpay Plus.
// mspago registra cada intento en Kafka; si detecta demasiados intentos
// seguidos bloquea al cliente y responde 429.
export default function Pago() {
  const { id } = useParams();
  const [orden, setOrden] = useState(null);
  const [bloqueadoHasta, setBloqueadoHasta] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  function consultarBloqueo() {
    return api
      .get('/api/pagos/estado')
      .then((r) => setBloqueadoHasta(r.data.bloqueado ? r.data.bloqueadoHasta : null))
      .catch(() => {});
  }

  useEffect(() => {
    api
      .get(`/api/ordenes/${id}`)
      .then((r) => setOrden(r.data))
      .catch(() => setMensaje('No se encontró la orden.'));
    consultarBloqueo();
  }, [id]);

  // Webpay exige llegar a su formulario con un POST que lleve el token_ws
  function redirigirAWebpay(url, tokenWs) {
    const form = document.createElement('form');
    form.action = url;
    form.method = 'POST';
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'token_ws';
    input.value = tokenWs;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
  }

  async function pagar() {
    setCargando(true);
    setMensaje('');
    try {
      const { data } = await api.post('/api/pagos/iniciar', { ordenId: Number(id) });
      redirigirAWebpay(data.url, data.token);
    } catch (err) {
      setMensaje(err.response?.data?.message || 'No se pudo iniciar el pago. Intenta nuevamente.');
      if (err.response?.status === 429) await consultarBloqueo();
      setCargando(false);
    }
  }

  const bloqueado = Boolean(bloqueadoHasta);
  const pendiente = orden?.estado === 'pendiente_pago';

  return (
    <div className="p-8 max-w-lg mx-auto">
      <h1 className="text-3xl font-serif mb-6">Pago de tu orden</h1>

      {orden && (
        <div className="bg-white p-4 rounded-lg shadow mb-4">
          <p className="font-semibold mb-2">Orden #{orden.id}</p>
          {orden.items.map((i) => (
            <p key={i.productoId} className="text-sm text-gray-500">
              {i.cantidad} × {i.nombre}
            </p>
          ))}
          <div className="flex justify-between text-lg font-bold mt-3">
            <span>Total a pagar</span>
            <span>${Number(orden.total).toLocaleString('es-CL')}</span>
          </div>
        </div>
      )}

      {bloqueado && (
        <p className="text-sm mb-4 p-3 rounded bg-red-100 text-red-800">
          Detectamos demasiados intentos de pago seguidos. Por seguridad tu cuenta quedó bloqueada
          para pagar hasta las {new Date(bloqueadoHasta).toLocaleTimeString('es-CL')}.
        </p>
      )}
      {mensaje && !bloqueado && (
        <p className="text-sm mb-4 p-3 rounded bg-yellow-100 text-yellow-800">{mensaje}</p>
      )}

      {orden && pendiente && (
        <button
          onClick={pagar}
          disabled={bloqueado || cargando}
          className="w-full bg-perfume-dark text-white py-3 rounded-lg disabled:opacity-40"
        >
          {cargando ? 'Conectando con Webpay...' : bloqueado ? 'Bloqueado temporalmente' : 'Pagar con Webpay'}
        </button>
      )}
      {orden && !pendiente && (
        <p className="text-sm p-3 rounded bg-green-100 text-green-800">
          Esta orden ya está {orden.estado}. <Link to="/mis-ordenes" className="underline">Ver mis órdenes</Link>
        </p>
      )}

      <p className="text-xs text-gray-400 mt-4">
        El pago se realiza en Webpay Plus (Transbank). PerfumesDuoc no recibe ni guarda los datos de tu tarjeta.
      </p>
    </div>
  );
}
