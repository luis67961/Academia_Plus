package pe.plustwenty.repository;

import java.util.List;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import pe.plustwenty.model.Notificacion;

public interface NotificacionRepository extends JpaRepository<Notificacion, String> {

    List<Notificacion> findByUserId(String userId, Sort sort);
}
