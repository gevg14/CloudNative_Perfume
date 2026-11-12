import { useEffect, useState } from 'react';
import api from '../lib/api';

export default function MisOrdenes() {
  const [ordenes, setOrdenes] = useState([]);
  useEffect(() => { api.get('/api/ordenes').then((r) => setOrdenes(r.data)); }, []);

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-serif mb-6">Mis Órdenes</h1>
      {ordenes.map((o) => (
        <div key={o.id} className="bg-white p-4 rounded-lg shadow mb-3">
          <p className="font-semibold">Orden #{o.id} — {o.estado}</p>
          <p className="text-sm text-gray-500">Total: ${Number(o.total).toLocaleString('es-CL')}</p>
        </div>
      ))}
      {ordenes.length === 0 && <p className="text-gray-500">Aún no tienes órdenes.</p>}
    </div>
  );
}
