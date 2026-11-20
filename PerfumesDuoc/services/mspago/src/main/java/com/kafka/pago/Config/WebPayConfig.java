package com.kafka.pago.Config;

import cl.transbank.common.IntegrationApiKeys;
import cl.transbank.common.IntegrationCommerceCodes;
import cl.transbank.webpay.webpayplus.WebpayPlus;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

// Webpay Plus en ambiente de INTEGRACIÓN (credenciales públicas de prueba
// de Transbank). Para producción se reemplaza por buildForProduction(...)
// con el código de comercio y la API key propios, leídos de variables de entorno.
@Configuration
public class WebPayConfig {

    @Bean
    public WebpayPlus.Transaction webpayTransaction() {
        return WebpayPlus.Transaction.buildForIntegration(
                IntegrationCommerceCodes.WEBPAY_PLUS,
                IntegrationApiKeys.WEBPAY);
    }
}
