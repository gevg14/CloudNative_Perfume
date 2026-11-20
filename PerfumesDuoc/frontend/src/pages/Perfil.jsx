import { useEffect, useState } from 'react';
import api from '../lib/api';

const CAMPOS = [
  { nombre: 'nombre', etiqueta: 'Nombre' },
  { nombre: 'telefono', etiqueta: 'Teléfono', placeholder: '+56 9 1234 5678' },
  { nombre: 'direccion', etiqueta: 'Dirección de despacho' },
  { nombre: 'comuna', etiqueta: 'Comuna' },
  { nombre: 'ciudad', etiqueta: 'Ciudad' },
];

export default function Perfil() {
  const [perfil, setPerfil] = useState(null);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    api
      .get('/api/perfil')
      .then((r) => setPerfil(r.data))
      .catch(() => setAviso({ ok: false, texto: 'No se pudo cargar tu perfil.' }));
  }, []);

  async function guardar(e) {
    e.preventDefault();
    setAviso(null);
    try {
      const { data } = await api.put('/api/perfil', perfil);
      setPerfil(data);
      setAviso({ ok: true, texto: 'Perfil guardado.' });
    } catch (err) {
      setAviso({ ok: false, texto: err.response?.data?.error || 'No se pudo guardar el perfil.' });
    }
  }

  const cambiar = (campo) => (e) => setPerfil({ ...perfil, [campo]: e.target.value });

  return (
    <div className="p-8 max-w-lg mx-auto">
      <h1 className="text-3xl font-serif mb-6">Mi perfil</h1>
      {aviso && (
        <p className={`text-sm mb-4 p-2 rounded ${aviso.ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {aviso.texto}
        </p>
      )}
      {perfil && (
        <form onSubmit={guardar} className="bg-white p-6 rounded-lg shadow flex flex-col gap-4">
          <label className="text-sm">
            Correo
            <input value={perfil.email || ''} disabled className="border rounded-lg px-3 py-2 w-full bg-gray-100" />
          </label>
          {CAMPOS.map(({ nombre, etiqueta, placeholder }) => (
            <label key={nombre} className="text-sm">
              {etiqueta}
              <input
                value={perfil[nombre] || ''}
                onChange={cambiar(nombre)}
                placeholder={placeholder}
                className="border rounded-lg px-3 py-2 w-full"
              />
            </label>
          ))}
          <label className="text-sm">
            Categoría preferida (se usa para tus recomendaciones)
            <select
              value={perfil.categoria_preferida || ''}
              onChange={cambiar('categoria_preferida')}
              className="border rounded-lg px-3 py-2 w-full"
            >
              <option value="">Sin preferencia</option>
              <option value="hombre">Hombre</option>
              <option value="mujer">Mujer</option>
              <option value="unisex">Unisex</option>
            </select>
          </label>
          <button className="bg-perfume-dark text-white py-3 rounded-lg">Guardar</button>
        </form>
      )}
    </div>
  );
}
