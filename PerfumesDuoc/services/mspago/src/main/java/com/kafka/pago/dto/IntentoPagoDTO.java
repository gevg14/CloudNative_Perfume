package com.kafka.pago.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

// Evento del tópico "payment-attempts"
@Data
@AllArgsConstructor
@NoArgsConstructor
public class IntentoPagoDTO {
    private String idCliente;
    private Long monto;
    private String idTransaccion;
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private LocalDateTime timestamp;
}
