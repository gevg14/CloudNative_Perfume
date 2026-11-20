package com.kafka.pago.Model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

// Registro de cada pago. No se guarda ningún dato sensible de la tarjeta:
// el número y el CVV los ingresa el cliente directamente en Webpay y nunca
// pasan por este microservicio. Solo se guardan los últimos 4 dígitos que
// informa Transbank.
@Entity
@Table(name = "pagos", indexes = @Index(name = "idx_pagos_cliente", columnList = "id_cliente"))
@Data
public class Pago {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "orden_id", nullable = false)
    private Long ordenId;

    @Column(name = "id_cliente", length = 150, nullable = false)
    private String idCliente;

    @Column(name = "monto", nullable = false)
    private Long monto;

    @Column(name = "buy_order", length = 26, nullable = false)
    private String buyOrder;

    @Column(name = "token_ws", length = 100, unique = true)
    private String tokenWs;

    // INICIADO | CONFIRMANDO | APROBADO | RECHAZADO | ERROR
    @Column(name = "estado", length = 20, nullable = false)
    private String estado;

    @Column(name = "codigo_autorizacion", length = 20)
    private String codigoAutorizacion;

    @Column(name = "tarjeta_ultimos4", length = 4)
    private String tarjetaUltimos4;

    @Column(name = "creado_en", nullable = false)
    private LocalDateTime creadoEn;

    @Column(name = "confirmado_en")
    private LocalDateTime confirmadoEn;
}
