package com.kafka.pago.Service;

import cl.transbank.webpay.webpayplus.WebpayPlus;
import com.kafka.pago.Config.Topicos;
import com.kafka.pago.Model.EstadoPagoCliente;
import com.kafka.pago.Model.Pago;
import com.kafka.pago.Repository.EstadoPagoClienteRepositorio;
import com.kafka.pago.Repository.PagoRepositorio;
import com.kafka.pago.dto.IntentoPagoDTO;
import com.kafka.pago.dto.ResultadoPagoDTO;
import com.kafka.pago.dto.TransaccionRespuestaDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class PagosServices {

    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final EstadoPagoClienteRepositorio estadoRepositorio;
    private final PagoRepositorio pagoRepositorio;
    private final WebpayPlus.Transaction webpay;

    @Value("${pago.return-url}")
    private String returnUrl;

    @Value("${pago.fraude.bloqueo-minutos}")
    private int bloqueoMinutos;

    // --- Bloqueo preventivo (consulta síncrona antes de ir a Webpay) ---
    public boolean verificarSiUsuarioEstaBloqueado(String idCliente) {
        EstadoPagoCliente estado = estadoRepositorio.findById(idCliente).orElse(null);

        if (estado == null || !estado.isBloqueado()) {
            return false; // No existe o no está bloqueado
        }

        // Si está bloqueado, verificamos si ya pasó el tiempo de castigo
        if (estado.getBloqueadoHasta() != null) {
            LocalDateTime ahora = LocalDateTime.now();

            if (ahora.isAfter(estado.getBloqueadoHasta())) {
                estado.setBloqueado(false);
                estado.setCantidadIntentos(0);
                estado.setBloqueadoHasta(null);
                estado.setActualizadoEn(ahora);
                estadoRepositorio.save(estado);

                log.info("El bloqueo de {} minutos expiró para el cliente {}. Usuario desbloqueado automáticamente.",
                        bloqueoMinutos, idCliente);
                return false; // Permitir el pago
            }
        }
        return true; // Sigue bloqueado
    }

    public EstadoPagoCliente obtenerEstadoCliente(String idCliente) {
        verificarSiUsuarioEstaBloqueado(idCliente); // libera el bloqueo si ya expiró
        return estadoRepositorio.findById(idCliente).orElse(null);
    }

    // --- Kafka: cada intento de pago se publica en "payment-attempts" ---
    // La clave es el id del cliente: todos sus intentos caen en la misma
    // partición y el consumidor los procesa en orden.
    public void producirIntentoPago(String idCliente, Long monto, String idTransaccion) {
        IntentoPagoDTO evento = new IntentoPagoDTO(idCliente, monto, idTransaccion, LocalDateTime.now());
        kafkaTemplate.send(Topicos.INTENTOS, idCliente, evento);
        log.info("Evento de intento enviado a Kafka para el cliente: {}", idCliente);
    }

    // --- Webpay Plus: crea la transacción y registra el pago como INICIADO ---
    public TransaccionRespuestaDTO iniciarTransaccionWebpay(Long ordenId, String idCliente, Long monto) {
        Pago pago = new Pago();
        pago.setOrdenId(ordenId);
        pago.setIdCliente(idCliente);
        pago.setMonto(monto);
        // Transbank acepta máximo 26 caracteres en buy_order
        pago.setBuyOrder("ORD-" + ordenId + "-" + (System.currentTimeMillis() / 1000));
        pago.setEstado("INICIADO");
        pago.setCreadoEn(LocalDateTime.now());
        pago = pagoRepositorio.save(pago);

        try {
            var response = webpay.create(pago.getBuyOrder(), "PAGO-" + pago.getId(), monto.doubleValue(), returnUrl);

            pago.setTokenWs(response.getToken());
            pagoRepositorio.save(pago);

            log.info("Transacción Webpay creada para la orden {} (pago {})", ordenId, pago.getId());
            return new TransaccionRespuestaDTO(response.getToken(), response.getUrl());

        } catch (Exception e) {
            pago.setEstado("ERROR");
            pagoRepositorio.save(pago);
            log.error("Error al conectar con Transbank: {}", e.getMessage());
            throw new RuntimeException("Error al iniciar pago en Webpay");
        }
    }

    // --- Retorno desde Webpay: confirma (commit) y registra el resultado ---
    // Es idempotente: un token solo se confirma una vez.
    public Pago confirmarTransaccionWebpay(String tokenWs) {
        if (pagoRepositorio.tomarParaConfirmar(tokenWs) == 0) return esperarResultado(tokenWs);
        Pago pago = pagoRepositorio.findByTokenWs(tokenWs).orElseThrow();

        boolean aprobado = false;
        try {
            var response = webpay.commit(tokenWs);
            aprobado = "AUTHORIZED".equals(response.getStatus())
                    && response.getResponseCode() == 0
                    && Math.round(response.getAmount()) == pago.getMonto();
            if (aprobado) {
                pago.setCodigoAutorizacion(response.getAuthorizationCode());
                if (response.getCardDetail() != null) {
                    pago.setTarjetaUltimos4(response.getCardDetail().getCardNumber());
                }
            }
        } catch (Exception e) {
            log.error("Error al hacer commit en Transbank: {}", e.getMessage());
        }
        return registrarResultado(pago, aprobado);
    }

    // El cliente anuló el pago en el formulario de Webpay (vuelve con TBK_TOKEN)
    public Pago anularTransaccion(String tbkToken) {
        if (pagoRepositorio.tomarParaConfirmar(tbkToken) == 0) return esperarResultado(tbkToken);
        return registrarResultado(pagoRepositorio.findByTokenWs(tbkToken).orElseThrow(), false);
    }

    // Otra petición ya está confirmando (o ya confirmó) este pago: se devuelve
    // su resultado sin volver a llamar a Transbank ni a publicar en Kafka.
    private Pago esperarResultado(String token) {
        for (int i = 0; i < 20; i++) {
            Pago pago = pagoRepositorio.findByTokenWs(token).orElse(null);
            if (pago == null || !"CONFIRMANDO".equals(pago.getEstado())) return pago;
            try {
                Thread.sleep(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        return pagoRepositorio.findByTokenWs(token).orElse(null);
    }

    private Pago registrarResultado(Pago pago, boolean aprobado) {
        pago.setEstado(aprobado ? "APROBADO" : "RECHAZADO");
        pago.setConfirmadoEn(LocalDateTime.now());
        pago = pagoRepositorio.save(pago);

        // Kafka: orders-service consume "payment-results" y marca la orden como pagada
        kafkaTemplate.send(Topicos.RESULTADOS, String.valueOf(pago.getOrdenId()), new ResultadoPagoDTO(
                pago.getId(), pago.getOrdenId(), pago.getIdCliente(), pago.getMonto(),
                pago.getEstado(), pago.getCodigoAutorizacion(), pago.getConfirmadoEn()));

        gestionarResultadoCallbackPago(pago.getIdCliente(), aprobado);
        log.info("Pago {} de la orden {}: {}", pago.getId(), pago.getOrdenId(), pago.getEstado());
        return pago;
    }

    // --- Gestión del Callback (Éxito / Fallo o rechazo) ---
    // Un pago terminado reinicia el contador de intentos. Un bloqueo vigente
    // NO se levanta: solo expira por tiempo.
    @Transactional
    public void gestionarResultadoCallbackPago(String idCliente, boolean esExitoso) {
        EstadoPagoCliente estado = estadoRepositorio.findById(idCliente).orElse(null);
        if (estado == null || estado.isBloqueado()) return;

        estado.setCantidadIntentos(0);
        estadoRepositorio.save(estado);
        log.info("Transacción {} para {}. Contador de intentos reiniciado a 0.",
                esExitoso ? "exitosa" : "rechazada/fallida", idCliente);
    }

    public List<Pago> listarPagos(String idCliente) {
        return pagoRepositorio.findByIdClienteOrderByCreadoEnDesc(idCliente);
    }
}
