package com.kafka.pago.Security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;

// Exige un JWT válido en /api/pagos/**. Quedan abiertos solo el retorno desde
// Webpay (commit / anular): ahí el navegador vuelve de Transbank y la prueba
// de identidad es el token_ws, un valor de un solo uso que solo conoce quien
// inició ese pago.
@Component
@RequiredArgsConstructor
public class JwtFiltro extends OncePerRequestFilter {

    public static final String ATRIBUTO_CLIENTE = "idCliente";
    public static final String ATRIBUTO_TOKEN = "jwt";

    private final JwtValidador validador;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String ruta = request.getRequestURI();
        return !ruta.startsWith("/api/pagos")
                || ruta.equals("/api/pagos/commit")
                || ruta.equals("/api/pagos/anular")
                || "OPTIONS".equalsIgnoreCase(request.getMethod());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String cabecera = request.getHeader("Authorization");
        if (cabecera == null || !cabecera.startsWith("Bearer ")) {
            responder(response, 401, "Token no proporcionado");
            return;
        }
        String token = cabecera.substring(7);
        try {
            Map<String, Object> claims = validador.validar(token);
            Object cliente = claims.get("sub") != null ? claims.get("sub") : claims.get("oid");
            if (cliente == null) throw new SecurityException("Token sin identificador de usuario");
            request.setAttribute(ATRIBUTO_CLIENTE, cliente.toString());
            request.setAttribute(ATRIBUTO_TOKEN, token);
        } catch (Exception e) {
            responder(response, 403, "Token inválido");
            return;
        }
        chain.doFilter(request, response);
    }

    private void responder(HttpServletResponse response, int estado, String mensaje) throws IOException {
        response.setStatus(estado);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"error\":\"" + mensaje + "\"}");
    }
}
