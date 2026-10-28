package com.plustwenty.academic.repository;
import com.plustwenty.academic.model.Cuenta;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
public interface CuentaRepository extends JpaRepository<Cuenta,Long> {
    Optional<Cuenta> findByUsuario(String usuario);
    boolean existsByUsuario(String usuario);
    java.util.List<Cuenta> findByEmailIgnoreCase(String email);
    boolean existsByEmailIgnoreCaseAndIdNot(String email, Long id);
}
