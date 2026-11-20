import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

export default function Carrito() {
  const [carrito, setCarrito] = useState({ items: [], cupon: null });
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  function cargar() {
    api
      .get('/api/carrito')
      .then((r) => setCarrito(r.data))
      .catch((err) => {
        // Sesión inactiva (401) o expirada (403): carrito vacío sin romper la página.
        console.warn('No se pudo cargar el carrito:', err.response?.data?.error || err.message);
        setCarrito({ items: [], cupon: null });
      });
  }

  useEffect(cargar, []);

  const cupon = carrito.cupon;

  // Mientras el cupón está 'pendiente' (validándose por la cola de RabbitMQ,
  // o esperando a que coupons-service vuelva a levantarse), se consulta el
  // carrito cada 2 s para reflejar la respuesta apenas llegue.
  useEffect(() => {
    if (cupon?.estado !== 'pendiente') return;
    const t = setInterval(cargar, 2000);
    return () => clearInterval(t);
  }, [cupon?.estado]);

  const subtotal = carrito.items.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
  const descuento = cupon?.estado === 'aplicado' ? cupon.descuento : 0;
  const total = Math.max(subtotal - descuento, 0);

  async function quitar(productoId) {
    const { data } = await api.delete(`/api/carrito/items/${productoId}`);
    setCarrito(data);
  }

  async function aplicarCupon() {
    if (!codigo.trim()) return;
    setError('');
    try {
      const { data } = await api.post('/api/carrito/cupon', { codigo: codigo.trim() });
      setCarrito(data); // vuelve de inmediato con estado 'pendiente'
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo enviar el cupón');
    }
  }

  async function quitarCupon() {
    const { data } = await api.delete('/api/carrito/cupon');
    setCarrito(data);
    setCodigo('');
  }

  // Crea la orden (queda "pendiente_pago") y lleva al cliente a pagarla.
  // El cupón solo se usa si ya fue validado ('aplicado'); si sigue
  // 'pendiente' o es inválido, la orden se crea igual, sin descuento.
  async function irAPagar() {
    setError('');
    try {
      const { data: orden } = await api.post('/api/ordenes', {
        items: carrito.items,
        cuponCodigo: cupon?.estado === 'aplicado' ? cupon.codigo : undefined,
      });
      await api.delete('/api/carrito');
      navigate(`/pago/${orden.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear la orden');
    }
  }

  const colorCupon =
    cupon?.estado === 'aplicado'
      ? 'bg-green-100 text-green-800'
      : cupon?.estado === 'pendiente'
      ? 'bg-yellow-100 text-yellow-800'
      : 'bg-red-100 text-red-800';

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-serif mb-6">Tu Carrito</h1>
      {carrito.items.length === 0 && <p className="text-gray-500">Tu carrito está vacío.</p>}

      {carrito.items.map((i) => (
        <div key={i.productoId} className="flex justify-between items-center bg-white p-4 rounded-lg shadow mb-3">
          <div>
            <p className="font-semibold">{i.nombre}</p>
            <p className="text-sm text-gray-500">Cantidad: {i.cantidad}</p>
          </div>
          <div className="flex items-center gap-4">
            <span>${(i.precio * i.cantidad).toLocaleString('es-CL')}</span>
            <button onClick={() => quitar(i.productoId)} className="text-red-500 text-sm">Quitar</button>
          </div>
        </div>
      ))}

      {carrito.items.length > 0 && (
        <>
          {!cupon ? (
            <div className="flex gap-2 mb-2">
              <input
                placeholder="Código de cupón (opcional, ej: BIENVENIDO10)"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                className="border rounded-lg px-3 py-2 flex-1"
              />
              <button onClick={aplicarCupon} className="border border-perfume-dark px-4 rounded-lg">
                Aplicar
              </button>
            </div>
          ) : (
            <div className={`flex justify-between items-start gap-3 text-sm mb-4 p-3 rounded ${colorCupon}`}>
              <div>
                <p className="font-semibold">Cupón {cupon.codigo}</p>
                <p>{cupon.mensaje}</p>
              </div>
              <button onClick={quitarCupon} className="underline whitespace-nowrap">Quitar cupón</button>
            </div>
          )}
          {error && <p className="text-sm mb-4 p-2 rounded bg-red-100 text-red-800">{error}</p>}

          <div className="flex justify-between mb-1">
            <span>Subtotal</span>
            <span>${subtotal.toLocaleString('es-CL')}</span>
          </div>
          {descuento > 0 && (
            <div className="flex justify-between mb-1 text-green-700">
              <span>Descuento</span>
              <span>-${descuento.toLocaleString('es-CL')}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold mb-4">
            <span>Total</span>
            <span>${total.toLocaleString('es-CL')}</span>
          </div>
          <button onClick={irAPagar} className="w-full bg-perfume-dark text-white py-3 rounded-lg">
            Ir a pagar
          </button>
        </>
      )}
    </div>
  );
}
