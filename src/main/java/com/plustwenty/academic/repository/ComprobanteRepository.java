package com.plustwenty.academic.repository;
import com.plustwenty.academic.model.Comprobante;
import org.springframework.data.jpa.repository.*;
import jakarta.persistence.LockModeType;
import java.util.*;
public interface ComprobanteRepository extends JpaRepository<Comprobante,Long>{
 List<Comprobante> findAllByOrderByFechaDesc();
 List<Comprobante> findByCuentaUsuarioOrderByFechaDesc(String usuario);
 @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select c from Comprobante c where c.id = :id") Optional<Comprobante> findForUpdateById(Long id);
}
