package com.kafka.pago.Service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;

// Lee la orden desde orders-service con el token del propio cliente:
// orders-service solo la devuelve si pertenece a ese usuario.
@Component
public class OrdenesCliente {

    private final RestClient restClient;

    public OrdenesCliente(@Value("${pago.orders-url}") String ordersUrl) {
        this.restClient = RestClient.builder().baseUrl(ordersUrl).build();
    }

    public Map<String, Object> obtenerOrden(Long ordenId, String jwt) {
        return restClient.get()
                .uri("/ordenes/{id}", ordenId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + jwt)
                .retrieve()
                .body(new ParameterizedTypeReference<Map<String, Object>>() {
                });
    }
}
