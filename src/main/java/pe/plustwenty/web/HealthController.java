package pe.plustwenty.web;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Comprobación de salud pública. La usa el despliegue continuo (scripts/deploy.sh) como prueba de humo
 * después de cada despliegue. No toca la base de datos ni expone información interna.
 */
@RestController
public class HealthController {

    @GetMapping("/api/health")
    public Map<String, String> health() {
        return Map.of("status", "ok");
    }
}
