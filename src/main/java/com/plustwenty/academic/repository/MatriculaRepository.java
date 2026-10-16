package com.plustwenty.academic.repository;

import com.plustwenty.academic.model.Matricula;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface MatriculaRepository extends JpaRepository<Matricula, Long>, JpaSpecificationExecutor<Matricula> {

    boolean existsByDniAndProgramaIdAndIdNot(String dni, Long programaId, Long id);

    long countByEstado(String estado);

    long countByFechaBetween(LocalDate desde, LocalDate hasta);

    Optional<Matricula> findFirstByDni(String dni);

    List<Matricula> findTop5ByOrderByFechaDescIdDesc();
}
