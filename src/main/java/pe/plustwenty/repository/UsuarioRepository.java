package pe.plustwenty.repository;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import pe.plustwenty.model.Usuario;

public interface UsuarioRepository extends JpaRepository<Usuario, String> {

    Optional<Usuario> findByUsernameIgnoreCase(String username);

    boolean existsByUsernameIgnoreCase(String username);

    Optional<Usuario> findFirstByEmailIgnoreCaseOrderByOrdenAsc(String email);

    Optional<Usuario> findFirstByEstudianteIdOrderByOrdenAsc(String estudianteId);
}
