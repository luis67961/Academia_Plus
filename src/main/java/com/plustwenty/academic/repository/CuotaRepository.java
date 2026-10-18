package com.plustwenty.academic.repository;
import com.plustwenty.academic.model.Cuota;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface CuotaRepository extends JpaRepository<Cuota,Long>{
 List<Cuota> findByMatriculaIdOrderByNumero(Long id);
 boolean existsByMatriculaId(Long id);
}
