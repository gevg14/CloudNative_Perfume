export default function ProductCard({ producto, onAdd }) {
  return (
    <div className="bg-white rounded-xl shadow p-4 flex flex-col gap-2">
      <div className="h-40 bg-perfume-cream rounded-lg flex items-center justify-center text-perfume-gold text-4xl">🧴</div>
      <h3 className="font-semibold">{producto.nombre}</h3>
      <p className="text-sm text-gray-500">{producto.marca} · {producto.ml} ml</p>
      <p className="text-lg font-bold">${Number(producto.precio).toLocaleString('es-CL')}</p>
      <p className="text-xs text-gray-400">Stock: {producto.stock}</p>
      <button
        onClick={() => onAdd(producto)}
        disabled={producto.stock === 0}
        className="mt-auto bg-perfume-dark text-white py-2 rounded-lg disabled:opacity-40"
      >
        {producto.stock === 0 ? 'Sin stock' : 'Agregar al carrito'}
      </button>
    </div>
  );
}
