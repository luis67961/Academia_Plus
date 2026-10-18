package com.plustwenty.academic.repository;

import com.plustwenty.academic.model.Solicitud;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import java.util.List;
import java.util.Optional;

public interface SolicitudRepository extends JpaRepository<Solicitud, Long> {
    List<Solicitud> findAllByOrderByFechaDescIdDesc();
    List<Solicitud> findByCuentaUsuarioOrderByFechaDescIdDesc(String usuario);
    long countByEstado(Solicitud.Estado estado);
    boolean existsByDniAndProgramaIdAndEstado(String dni, Long programaId, Solicitud.Estado estado);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from Solicitud s where s.id = :id")
    Optional<Solicitud> findForUpdateById(Long id);
}
