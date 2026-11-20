import { useEffect, useState } from 'react';
import api from '../lib/api';
import ProductCard from '../components/ProductCard';
import Recomendaciones from '../components/Recomendaciones';

export default function Catalogo() {
  const [productos, setProductos] = useState([]);
  const [categoria, setCategoria] = useState('');
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    api.get('/api/productos', { params: categoria ? { categoria } : {} }).then((r) => setProductos(r.data));
  }, [categoria]);

  async function agregarAlCarrito(producto) {
    try {
      await api.post('/api/carrito/items', { productoId: producto.id, cantidad: 1 });
      setMensaje(`${producto.nombre} agregado al carrito ✅`);
    } catch (err) {
      setMensaje(err.response?.data?.error || 'No se pudo agregar (¿iniciaste sesión?)');
    }
    setTimeout(() => setMensaje(''), 3000);
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-serif mb-2">Catálogo de Perfumes</h1>
      <p className="text-sm text-gray-500 mb-6">Fragancias premium para cada ocasión</p>

      <div className="flex gap-2 mb-6">
        {['', 'hombre', 'mujer', 'unisex'].map((c) => (
          <button
            key={c}
            onClick={() => setCategoria(c)}
            className={`px-4 py-1 rounded-full border ${categoria === c ? 'bg-perfume-dark text-white' : ''}`}
          >
            {c || 'Todos'}
          </button>
        ))}
      </div>

      {mensaje && <div className="mb-4 text-sm bg-perfume-gold/20 border border-perfume-gold rounded p-2">{mensaje}</div>}

      <Recomendaciones onAdd={agregarAlCarrito} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {productos.map((p) => (
          <ProductCard key={p.id} producto={p} onAdd={agregarAlCarrito} />
        ))}
      </div>
    </div>
  );
}
