package pe.plustwenty;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import pe.plustwenty.config.AuthInterceptor;
import pe.plustwenty.service.SesionService;
import pe.plustwenty.web.HealthController;

/** La prueba de humo del despliegue continuo depende de /api/health: debe responder ok y ser pública. */
class HealthControllerTests {

    @Test
    void healthResponde_ok() {
        assertEquals(Map.of("status", "ok"), new HealthController().health());
    }

    @Test
    void healthEsPublicaPeroElRestoDeLaApiSigueProtegida() throws Exception {
        AuthInterceptor interceptor = new AuthInterceptor(mock(SesionService.class));   // sin sesión iniciada

        MockHttpServletResponse publica = new MockHttpServletResponse();
        assertTrue(interceptor.preHandle(new MockHttpServletRequest("GET", "/api/health"), publica, new Object()),
                "/api/health debe responder sin iniciar sesión");

        MockHttpServletResponse privada = new MockHttpServletResponse();
        assertFalse(interceptor.preHandle(new MockHttpServletRequest("GET", "/api/estudiantes"), privada, new Object()),
                "el resto de la API exige sesión");
        assertEquals(401, privada.getStatus());
    }
}
