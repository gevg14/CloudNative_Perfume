package com.kafka.pago;

import com.kafka.pago.Config.Topicos;
import com.kafka.pago.Consumer.ConsumidorComponent;
import com.kafka.pago.Model.EstadoPagoCliente;
import com.kafka.pago.Repository.EstadoPagoClienteRepositorio;
import com.kafka.pago.dto.AlertaFraudeDTO;
import com.kafka.pago.dto.IntentoPagoDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class ConsumidorComponentTest {

    private final Map<String, EstadoPagoCliente> tabla = new HashMap<>();
    private KafkaTemplate<String, Object> kafkaTemplate;
    private ConsumidorComponent consumidor;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void preparar() {
        EstadoPagoClienteRepositorio repositorio = mock(EstadoPagoClienteRepositorio.class);
        when(repositorio.findById(any())).thenAnswer(i -> Optional.ofNullable(tabla.get(i.<String>getArgument(0))));
        when(repositorio.save(any())).thenAnswer(i -> {
            EstadoPagoCliente estado = i.getArgument(0);
            tabla.put(estado.getIdCliente(), estado);
            return estado;
        });
        kafkaTemplate = mock(KafkaTemplate.class);
        consumidor = new ConsumidorComponent(repositorio, kafkaTemplate);
        ReflectionTestUtils.setField(consumidor, "maxIntentos", 3);
        ReflectionTestUtils.setField(consumidor, "ventanaSegundos", 10);
        ReflectionTestUtils.setField(consumidor, "bloqueoMinutos", 30);
    }

    private void intento(String cliente) {
        consumidor.consumirIntentoPago(new IntentoPagoDTO(cliente, 1000L, "ORD-1", LocalDateTime.now()));
    }

    @Test
    void tresIntentosSeguidosBloqueanAlClienteYPublicanAlerta() {
        intento("cliente-1");
        intento("cliente-1");
        assertFalse(tabla.get("cliente-1").isBloqueado());

        intento("cliente-1");

        EstadoPagoCliente estado = tabla.get("cliente-1");
        assertTrue(estado.isBloqueado());
        assertTrue(estado.getBloqueadoHasta().isAfter(LocalDateTime.now().plusMinutes(29)));
        verify(kafkaTemplate).send(eq(Topicos.ALERTAS_FRAUDE), eq("cliente-1"), any(AlertaFraudeDTO.class));
    }

    @Test
    void intentosEspaciadosNoBloquean() {
        intento("cliente-2");
        intento("cliente-2");
        // El último intento fue hace más de 10 segundos: la ventana se reinicia
        tabla.get("cliente-2").setActualizadoEn(LocalDateTime.now().minusSeconds(11));

        intento("cliente-2");

        assertFalse(tabla.get("cliente-2").isBloqueado());
        assertEquals(1, tabla.get("cliente-2").getCantidadIntentos());
        verifyNoInteractions(kafkaTemplate);
    }

    @Test
    void elBloqueoDeUnClienteNoAfectaAOtro() {
        intento("cliente-3");
        intento("cliente-3");
        intento("cliente-3");
        intento("cliente-4");

        assertTrue(tabla.get("cliente-3").isBloqueado());
        assertFalse(tabla.get("cliente-4").isBloqueado());
    }

    @Test
    void bloqueoExpiradoSeLevantaConElSiguienteIntento() {
        intento("cliente-5");
        intento("cliente-5");
        intento("cliente-5");
        tabla.get("cliente-5").setBloqueadoHasta(LocalDateTime.now().minusMinutes(1));
        tabla.get("cliente-5").setActualizadoEn(LocalDateTime.now().minusMinutes(31));

        intento("cliente-5");

        assertFalse(tabla.get("cliente-5").isBloqueado());
        assertEquals(1, tabla.get("cliente-5").getCantidadIntentos());
    }
}
