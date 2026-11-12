import { useParams, Link, useLocation } from 'react-router-dom';

export default function OrdenConfirmada() {
  const { id } = useParams();
  const { state } = useLocation();
  const estado = state?.cuponEstado;

  return (
    <div className="p-8 max-w-lg mx-auto text-center">
      <h1 className="text-3xl font-serif mb-4">¡Gracias por tu compra! 🎉</h1>
      <p className="mb-2">Tu orden <strong>#{id}</strong> fue registrada correctamente.</p>

      {state?.total !== undefined && (
        <p className="mb-2">
          Total pagado: <strong>${Number(state.total).toLocaleString('es-CL')}</strong>
        </p>
      )}

      {estado === 'aplicado' && (
        <p className="mb-2 text-green-700">
          Cupón aplicado: -${Number(state.descuento).toLocaleString('es-CL')} ✅
        </p>
      )}
      {state?.cuponPendiente && (
        <p className="mb-2 text-sm bg-yellow-100 text-yellow-800 p-2 rounded">
          Tu cupón seguía pendiente de validación (servicio de cupones no disponible),
          así que esta compra se confirmó sin descuento.
        </p>
      )}
      {(estado === 'servicio_no_disponible' || estado === 'invalido') && (
        <p className="mb-2 text-sm bg-yellow-100 text-yellow-800 p-2 rounded">
          {state.cuponMensaje}
        </p>
      )}

      <p className="text-sm text-gray-500 mb-6">
        Te enviaremos un correo de confirmación (procesado de forma asíncrona vía
        RabbitMQ por el microservicio de Notificaciones).
      </p>
      <Link to="/" className="text-perfume-gold underline">Volver al catálogo</Link>
    </div>
  );
}
