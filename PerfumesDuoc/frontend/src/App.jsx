import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Navbar from './components/Navbar';
import Catalogo from './pages/Catalogo';
import Carrito from './pages/Carrito';
import Login from './pages/Login';
import MisOrdenes from './pages/MisOrdenes';
import Pago from './pages/Pago';
import Callback from './pages/Callback';
import Perfil from './pages/Perfil';
import PrivateRoute from './components/PrivateRoute';
import { useAuth } from './context/AuthContext';
import { attachAuthInterceptor } from './lib/api';

export default function App() {
  const { token } = useAuth();

  useEffect(() => {
    attachAuthInterceptor(() => sessionStorage.getItem('pd_token'));
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar />
      <Routes>
        <Route path="/" element={<Catalogo />} />
        <Route path="/login" element={<Login />} />
        <Route path="/carrito" element={<PrivateRoute><Carrito /></PrivateRoute>} />
        <Route path="/mis-ordenes" element={<PrivateRoute><MisOrdenes /></PrivateRoute>} />
        <Route path="/perfil" element={<PrivateRoute><Perfil /></PrivateRoute>} />
        <Route path="/pago/:id" element={<PrivateRoute><Pago /></PrivateRoute>} />
        {/* Retorno desde Webpay */}
        <Route path="/callback" element={<Callback />} />
      </Routes>
    </div>
  );
}
