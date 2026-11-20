package com.kafka.pago.dto;

import lombok.Data;

// El frontend solo envía la orden a pagar. El cliente sale del token JWT
// y el monto se lee de orders-service: ninguno de los dos se confía al navegador.
@Data
public class PeticionPagoDTO {
    private Long ordenId;
}
