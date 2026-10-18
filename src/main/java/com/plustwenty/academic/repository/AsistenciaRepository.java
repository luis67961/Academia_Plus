package com.plustwenty.academic.repository;
import com.plustwenty.academic.model.Asistencia;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.LocalDate;
import java.util.*;
public interface AsistenciaRepository extends JpaRepository<Asistencia,Long> {
 List<Asistencia> findByMatriculaProgramaIdAndFecha(Long programaId,LocalDate fecha);
 List<Asistencia> findByMatriculaIdOrderByFechaDesc(Long matriculaId);
 Optional<Asistencia> findByMatriculaIdAndFecha(Long matriculaId,LocalDate fecha);
}
