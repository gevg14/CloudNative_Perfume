package com.kafka.pago.Config;

// Tópicos Kafka que usa mspago. Los crea kafka-init en docker-compose.
public final class Topicos {
    public static final String INTENTOS = "payment-attempts";
    public static final String RESULTADOS = "payment-results";
    public static final String ALERTAS_FRAUDE = "fraud-alerts";

    private Topicos() {
    }
}
