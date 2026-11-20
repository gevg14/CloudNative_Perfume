package com.kafka.pago.Repository;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.stereotype.Repository;
import com.kafka.pago.Model.Pago;

@Repository
public interface PagoRepositorio extends JpaRepository<Pago, Long> {
    Optional<Pago> findByTokenWs(String tokenWs);
    List<Pago> findByIdClienteOrderByCreadoEnDesc(String idCliente);

    // Toma el pago para confirmarlo. Solo una petición puede pasar de
    // INICIADO a CONFIRMANDO, aunque el retorno de Webpay llegue duplicado.
    @Modifying
    @Transactional
    @Query("UPDATE Pago p SET p.estado = 'CONFIRMANDO' WHERE p.tokenWs = :token AND p.estado = 'INICIADO'")
    int tomarParaConfirmar(@Param("token") String token);
}
