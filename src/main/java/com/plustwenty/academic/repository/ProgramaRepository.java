package com.plustwenty.academic.repository;
import com.plustwenty.academic.model.Programa;
import org.springframework.data.jpa.repository.JpaRepository;
public interface ProgramaRepository extends JpaRepository<Programa,Long>{
 @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
 @org.springframework.data.jpa.repository.Query("select p from Programa p where p.id = :id")
 java.util.Optional<Programa> findForUpdateById(Long id);
}
