package com.kafka.pago.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

// Evento del tópico "payment-results" (lo consume orders-service)
@Data
@AllArgsConstructor
@NoArgsConstructor
public class ResultadoPagoDTO {
    private Long pagoId;
    private Long ordenId;
    private String idCliente;
    private Long monto;
    private String estado; // APROBADO | RECHAZADO
    private String codigoAutorizacion;
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private LocalDateTime timestamp;
}
