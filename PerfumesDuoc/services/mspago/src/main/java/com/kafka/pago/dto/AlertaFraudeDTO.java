package com.kafka.pago.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

// Evento del tópico "fraud-alerts" (lo consume notifications-service)
@Data
@AllArgsConstructor
@NoArgsConstructor
public class AlertaFraudeDTO {
    private String idCliente;
    private int cantidadIntentos;
    private String motivo;
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private LocalDateTime bloqueadoHasta;
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private LocalDateTime timestamp;
}
