package com.plustwenty.academic.repository;
import com.plustwenty.academic.model.Pago;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface PagoRepository extends JpaRepository<Pago,Long>{
 boolean existsByMedioAndReferenciaIgnoreCase(String medio,String referencia);
 List<Pago> findAllByOrderByFechaDesc();
 List<Pago> findByCuotaMatriculaIdOrderByFechaDesc(Long id);
}
