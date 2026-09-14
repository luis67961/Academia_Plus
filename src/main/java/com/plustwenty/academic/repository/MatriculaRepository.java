package com.plustwenty.academic.repository;
import com.plustwenty.academic.model.Matricula;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MatriculaRepository extends JpaRepository<Matricula, Long> {
}