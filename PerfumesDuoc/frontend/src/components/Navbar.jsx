import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <nav className="flex items-center justify-between px-6 py-4 bg-perfume-dark text-perfume-cream">
      <Link to="/" className="text-xl font-serif tracking-widest">PERFUMES<span className="text-perfume-gold">DUOC</span></Link>
      <div className="flex gap-6 items-center text-sm">
        <Link to="/">Catálogo</Link>
        <Link to="/carrito">Carrito</Link>
        {user ? (
          <>
            <Link to="/mis-ordenes">Mis Órdenes</Link>
            <Link to="/perfil">Mi perfil</Link>
            <span className="text-perfume-gold">{user.name || user.preferred_username}</span>
            <button onClick={() => { logout(); navigate('/'); }} className="underline">Salir</button>
          </>
        ) : (
          <Link to="/login" className="bg-perfume-gold text-perfume-dark px-3 py-1 rounded">Iniciar sesión</Link>
        )}
      </div>
    </nav>
  );
}
