import { useEffect, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';

// Con sesión: recomendaciones personales (historial de compras + categoría
// preferida del perfil). Sin sesión: los más vendidos.
export default function Recomendaciones({ onAdd }) {
  const { token } = useAuth();
  const [recomendaciones, setRecomendaciones] = useState([]);

  useEffect(() => {
    let vigente = true;
    async function cargar() {
      try {
        if (!token) {
          const { data } = await api.get('/api/recomendaciones/populares');
          if (vigente) setRecomendaciones(data);
          return;
        }
        const categoria = await api
          .get('/api/perfil')
          .then((r) => r.data.categoria_preferida)
          .catch(() => null);
        const { data } = await api.get('/api/recomendaciones', { params: categoria ? { categoria } : {} });
        if (vigente) setRecomendaciones(data);
      } catch {
        // Las recomendaciones son opcionales: si el servicio no responde, el catálogo sigue funcionando.
        if (vigente) setRecomendaciones([]);
      }
    }
    cargar();
    return () => { vigente = false; };
  }, [token]);

  if (!recomendaciones.length) return null;

  return (
    <section className="mb-10">
      <h2 className="text-xl font-serif mb-3">{token ? 'Recomendados para ti' : 'Los más vendidos'}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {recomendaciones.map(({ producto, motivo }) => (
          <div key={producto.id} className="bg-white rounded-xl shadow p-4 flex flex-col gap-1 border border-perfume-gold/40">
            <p className="text-xs text-perfume-gold">{motivo}</p>
            <h3 className="font-semibold">{producto.nombre}</h3>
            <p className="text-sm text-gray-500">{producto.marca} · {producto.ml} ml</p>
            <p className="font-bold">${Number(producto.precio).toLocaleString('es-CL')}</p>
            <button
              onClick={() => onAdd(producto)}
              disabled={producto.stock === 0}
              className="mt-auto border border-perfume-dark py-1 rounded-lg text-sm disabled:opacity-40"
            >
              {producto.stock === 0 ? 'Sin stock' : 'Agregar al carrito'}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
