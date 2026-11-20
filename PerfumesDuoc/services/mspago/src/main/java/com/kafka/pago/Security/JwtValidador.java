package com.kafka.pago.Security;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.jwk.source.JWKSourceBuilder;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jose.util.Base64URL;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.proc.ConfigurableJWTProcessor;
import com.nimbusds.jwt.proc.DefaultJWTClaimsVerifier;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Date;
import java.util.Map;
import java.util.Set;

// Valida el JWT igual que el resto de los microservicios:
//  - azure: firma RS256 contra las llaves públicas (JWKS) del tenant y audiencia api://<client-id>
//  - local: firma HS256 con el secreto compartido de desarrollo
@Component
public class JwtValidador {

    private final String modo;
    private final byte[] secretoLocal;
    private ConfigurableJWTProcessor<SecurityContext> procesadorAzure;

    public JwtValidador(@Value("${pago.jwt.mode}") String modo,
                        @Value("${pago.jwt.local-secret}") String secretoLocal,
                        @Value("${pago.jwt.azure-tenant-id}") String tenantId,
                        @Value("${pago.jwt.azure-client-id}") String clientId) throws Exception {
        this.modo = modo;
        this.secretoLocal = secretoLocal.getBytes(StandardCharsets.UTF_8);
        if ("azure".equals(modo)) {
            JWKSource<SecurityContext> llaves = JWKSourceBuilder
                    .create(URI.create("https://login.microsoftonline.com/" + tenantId + "/discovery/v2.0/keys").toURL())
                    .build();
            DefaultJWTProcessor<SecurityContext> procesador = new DefaultJWTProcessor<>();
            procesador.setJWSKeySelector(new JWSVerificationKeySelector<>(JWSAlgorithm.RS256, llaves));
            procesador.setJWTClaimsSetVerifier(
                    new DefaultJWTClaimsVerifier<>("api://" + clientId, null, Set.of("exp")));
            this.procesadorAzure = procesador;
        }
    }

    // Devuelve los claims si el token es válido; lanza excepción si no lo es.
    public Map<String, Object> validar(String token) throws Exception {
        if (procesadorAzure != null) {
            return procesadorAzure.process(token, null).getClaims();
        }
        String[] partes = token.split("\\.");
        if (partes.length != 3) throw new SecurityException("Token mal formado");

        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secretoLocal, "HmacSHA256"));
        byte[] firmaEsperada = mac.doFinal((partes[0] + "." + partes[1]).getBytes(StandardCharsets.US_ASCII));
        if (!MessageDigest.isEqual(firmaEsperada, new Base64URL(partes[2]).decode())) {
            throw new SecurityException("Firma inválida");
        }
        JWTClaimsSet claims = JWTClaimsSet.parse(new Base64URL(partes[1]).decodeToString());
        if (claims.getExpirationTime() == null || claims.getExpirationTime().before(new Date())) {
            throw new SecurityException("Token expirado");
        }
        return claims.getClaims();
    }

    public String getModo() {
        return modo;
    }
}
