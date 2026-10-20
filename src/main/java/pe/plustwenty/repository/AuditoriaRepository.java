package pe.plustwenty.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import pe.plustwenty.model.Auditoria;

public interface AuditoriaRepository extends JpaRepository<Auditoria, String> {
}
