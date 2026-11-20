package com.kafka.pago.Controller;

import com.kafka.pago.Model.EstadoPagoCliente;
import com.kafka.pago.Model.Pago;
import com.kafka.pago.Security.JwtFiltro;
import com.kafka.pago.Service.OrdenesCliente;
import com.kafka.pago.Service.PagosServices;
import com.kafka.pago.dto.PeticionPagoDTO;
import com.kafka.pago.dto.TransaccionRespuestaDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.HttpClientErrorException;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// Sin @CrossOrigin: el navegador solo habla con el API Gateway, que es
// quien responde las cabeceras CORS.
@Slf4j
@RestController
@RequiredArgsConstructor
public class PagosController {

    private final PagosServices pagosServices;
    private final OrdenesCliente ordenesCliente;

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", "mspago");
    }

    @PostMapping("/api/pagos/iniciar")
    public ResponseEntity<?> iniciarPago(@RequestBody PeticionPagoDTO peticion,
                                         @RequestAttribute(JwtFiltro.ATRIBUTO_CLIENTE) String idCliente,
                                         @RequestAttribute(JwtFiltro.ATRIBUTO_TOKEN) String jwt) {
        if (peticion.getOrdenId() == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "ordenId es requerido"));
        }

        // 1. Bloqueo preventivo: si el cliente está penalizado no se llega a Webpay
        if (pagosServices.verificarSiUsuarioEstaBloqueado(idCliente)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of("message", "Demasiados intentos detectados. Estás bloqueado temporalmente. Por favor, espera."));
        }

        // 2. El monto se lee de orders-service, nunca del navegador
        Long monto = null;
        ResponseEntity<?> error = null;
        try {
            Map<String, Object> orden = ordenesCliente.obtenerOrden(peticion.getOrdenId(), jwt);
            if ("pendiente_pago".equals(orden.get("estado"))) {
                monto = new BigDecimal(String.valueOf(orden.get("total"))).longValueExact();
            } else {
                error = ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("message", "La orden ya no está pendiente de pago"));
            }
        } catch (HttpClientErrorException.NotFound e) {
            error = ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "Orden no encontrada"));
        } catch (Exception e) {
            log.error("No se pudo consultar la orden {}: {}", peticion.getOrdenId(), e.getMessage());
            error = ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("message", "No se pudo consultar la orden, intenta nuevamente"));
        }

        // 3. Todo intento (válido o no) se publica en Kafka para el Velocity Check
        pagosServices.producirIntentoPago(idCliente, monto, "ORD-" + peticion.getOrdenId());
        if (error != null) return error;

        // 4. Webpay Plus
        try {
            TransaccionRespuestaDTO transaccion = pagosServices.iniciarTransaccionWebpay(peticion.getOrdenId(), idCliente, monto);
            return ResponseEntity.ok(Map.of(
                    "url", transaccion.getUrlWebpay(),
                    "token", transaccion.getToken()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("message", "No se pudo conectar con la pasarela de pagos"));
        }
    }

    // Retorno desde Webpay (CallbackPage). Público: ver JwtFiltro.
    @PostMapping("/api/pagos/commit")
    public ResponseEntity<?> confirmarPagoWebpay(@RequestParam("token_ws") String tokenWs) {
        return responderResultado(pagosServices.confirmarTransaccionWebpay(tokenWs));
    }

    // El cliente anuló el pago en Webpay (vuelve con TBK_TOKEN)
    @PostMapping("/api/pagos/anular")
    public ResponseEntity<?> anularPagoWebpay(@RequestParam("tbk_token") String tbkToken) {
        return responderResultado(pagosServices.anularTransaccion(tbkToken));
    }

    // Estado antifraude del cliente: el frontend lo usa para deshabilitar el botón de pago
    @GetMapping("/api/pagos/estado")
    public Map<String, Object> estadoCliente(@RequestAttribute(JwtFiltro.ATRIBUTO_CLIENTE) String idCliente) {
        EstadoPagoCliente estado = pagosServices.obtenerEstadoCliente(idCliente);
        Map<String, Object> respuesta = new LinkedHashMap<>();
        respuesta.put("bloqueado", estado != null && estado.isBloqueado());
        respuesta.put("bloqueadoHasta", estado == null ? null : estado.getBloqueadoHasta());
        return respuesta;
    }

    // Historial de pagos del cliente autenticado
    @GetMapping("/api/pagos")
    public List<Map<String, Object>> misPagos(@RequestAttribute(JwtFiltro.ATRIBUTO_CLIENTE) String idCliente) {
        return pagosServices.listarPagos(idCliente).stream().map(this::resumen).toList();
    }

    private ResponseEntity<?> responderResultado(Pago pago) {
        if (pago == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "Transacción no encontrada"));
        }
        Map<String, Object> cuerpo = resumen(pago);
        cuerpo.put("status", "APROBADO".equals(pago.getEstado()) ? "AUTHORIZED" : "FAILED");
        if ("CONFIRMANDO".equals(pago.getEstado())) {
            cuerpo.put("status", "PENDING");
            return ResponseEntity.status(HttpStatus.ACCEPTED).body(cuerpo);
        }
        if (!"APROBADO".equals(pago.getEstado())) {
            cuerpo.put("message", "El pago fue rechazado o anulado");
            return ResponseEntity.badRequest().body(cuerpo);
        }
        return ResponseEntity.ok(cuerpo);
    }

    // Nunca se expone el token_ws ni datos completos de la tarjeta
    private Map<String, Object> resumen(Pago pago) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("pagoId", pago.getId());
        m.put("ordenId", pago.getOrdenId());
        m.put("amount", pago.getMonto());
        m.put("estado", pago.getEstado());
        m.put("codigoAutorizacion", pago.getCodigoAutorizacion());
        m.put("tarjetaUltimos4", pago.getTarjetaUltimos4());
        m.put("creadoEn", pago.getCreadoEn());
        m.put("confirmadoEn", pago.getConfirmadoEn());
        return m;
    }
}
