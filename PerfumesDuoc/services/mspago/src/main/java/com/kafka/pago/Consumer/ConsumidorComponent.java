package com.kafka.pago.Consumer;

import com.kafka.pago.Config.Topicos;
import com.kafka.pago.Model.EstadoPagoCliente;
import com.kafka.pago.Repository.EstadoPagoClienteRepositorio;
import com.kafka.pago.dto.AlertaFraudeDTO;
import com.kafka.pago.dto.IntentoPagoDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;

// Detección temprana de fraude (Velocity Check). Consume cada intento de pago
// desde Kafka y, si un cliente acumula demasiados intentos en pocos segundos,
// lo bloquea automáticamente y publica una alerta en "fraud-alerts".
@Slf4j
@Component
@RequiredArgsConstructor
public class ConsumidorComponent {

    private final EstadoPagoClienteRepositorio estadoRepositorio;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    @Value("${pago.fraude.max-intentos}")
    private int maxIntentos;

    @Value("${pago.fraude.ventana-segundos}")
    private int ventanaSegundos;

    @Value("${pago.fraude.bloqueo-minutos}")
    private int bloqueoMinutos;

    @KafkaListener(topics = Topicos.INTENTOS, groupId = "payment-velocity-group")
    @Transactional
    public void consumirIntentoPago(IntentoPagoDTO evento) {
        log.info("Consumidor Kafka: Procesando intento para el cliente: {}", evento.getIdCliente());
        LocalDateTime ahora = LocalDateTime.now();

        // Busca el registro en la base de datos o crea uno nuevo si es su primer intento
        EstadoPagoCliente estado = estadoRepositorio.findById(evento.getIdCliente())
                .orElseGet(() -> {
                    EstadoPagoCliente nuevoEstado = new EstadoPagoCliente();
                    nuevoEstado.setIdCliente(evento.getIdCliente());
                    nuevoEstado.setCantidadIntentos(0);
                    nuevoEstado.setBloqueado(false);
                    return nuevoEstado;
                });

        // 1. Verificar si el cliente se encuentra actualmente bloqueado
        if (estado.isBloqueado() && estado.getBloqueadoHasta() != null) {
            if (ahora.isBefore(estado.getBloqueadoHasta())) {
                log.warn("Consumidor: El cliente {} intentó procesar pago pero sigue bloqueado hasta {}",
                        evento.getIdCliente(), estado.getBloqueadoHasta());
                return;
            } else {
                // Si ya expiró el castigo, se limpia el bloqueo y se reinicia
                estado.setBloqueado(false);
                estado.setCantidadIntentos(0);
                estado.setBloqueadoHasta(null);
            }
        }

        // 2. Ventana de tiempo del Velocity Check
        if (estado.getActualizadoEn() != null) {
            long segundosDesdeUltimoIntento = Duration.between(estado.getActualizadoEn(), ahora).getSeconds();
            if (segundosDesdeUltimoIntento > ventanaSegundos) {
                log.info("Cliente {}: Pasaron {} segundos desde el último intento. Ventana de {}s reseteada.",
                        evento.getIdCliente(), segundosDesdeUltimoIntento, ventanaSegundos);
                estado.setCantidadIntentos(0);
            }
        }

        // 3. Incrementar el contador dentro de la ventana de alta frecuencia
        estado.setCantidadIntentos(estado.getCantidadIntentos() + 1);
        estado.setActualizadoEn(ahora);

        // 4. Regla de Velocity Check: demasiados intentos dentro de la ventana -> bloqueo
        if (estado.getCantidadIntentos() >= maxIntentos) {
            estado.setBloqueado(true);
            estado.setBloqueadoHasta(ahora.plusMinutes(bloqueoMinutos));
            log.error("¡ALERTA FRAUDE DESDE KAFKA! Cliente {} realizó {} intentos en menos de {} segundos. Bloqueado por {} minutos.",
                    evento.getIdCliente(), estado.getCantidadIntentos(), ventanaSegundos, bloqueoMinutos);

            kafkaTemplate.send(Topicos.ALERTAS_FRAUDE, evento.getIdCliente(), new AlertaFraudeDTO(
                    evento.getIdCliente(),
                    estado.getCantidadIntentos(),
                    estado.getCantidadIntentos() + " intentos de pago en menos de " + ventanaSegundos + " segundos",
                    estado.getBloqueadoHasta(),
                    ahora));
        }

        estadoRepositorio.save(estado);
        log.info("Consumidor Kafka: Cliente {} actualizado. Intentos en la ráfaga actual: {}",
                evento.getIdCliente(), estado.getCantidadIntentos());
    }
}
