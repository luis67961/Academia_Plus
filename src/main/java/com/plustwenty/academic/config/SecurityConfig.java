package com.plustwenty.academic.config;
import com.plustwenty.academic.model.Cuenta;
import com.plustwenty.academic.repository.CuentaRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import java.util.Locale;
@Configuration
public class SecurityConfig {
    @Bean PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(); }
    @Bean SecurityFilterChain security(HttpSecurity http)throws Exception {
        return http.authorizeHttpRequests(a->a
                .dispatcherTypeMatchers(jakarta.servlet.DispatcherType.ERROR).permitAll()
                .requestMatchers("/css/**","/js/**","/images/**","/estilos.css","/login","/","/cursos","/inscripcion","/inscripcion/recibida").permitAll()
                .requestMatchers("/portal","/portal/**").hasAnyRole("PADRE","ESTUDIANTE")
                .requestMatchers("/perfil","/perfil/**").authenticated()
                .anyRequest().hasRole("ADMIN"))
            .formLogin(f->f.loginPage("/login").successHandler((request,response,auth)->response.sendRedirect(
                auth.getAuthorities().stream().anyMatch(a->a.getAuthority().equals("ROLE_ADMIN"))?"/dashboard":"/portal")).permitAll())
            .logout(l->l.logoutSuccessUrl("/login?logout")).build();
    }
    @Bean UserDetailsService users(CuentaRepository cuentas) {
        return nombre-> {
            var c=cuentas.findByUsuario(nombre.trim().toLowerCase(Locale.ROOT))
                .orElseThrow(()->new UsernameNotFoundException("Credenciales incorrectas"));
            return User.withUsername(c.getUsuario()).password(c.getClaveHash()).roles(c.getRol()).build();
        };
    }
    @Bean CommandLineRunner seedCuentas(CuentaRepository cuentas, PasswordEncoder encoder) {
        return args-> {
            crearDemo(cuentas,encoder,"admin","DemoAdmin2026!","ADMIN");
            crearDemo(cuentas,encoder,"padre","DemoFamilia2026!","PADRE");
            crearDemo(cuentas,encoder,"estudiante","DemoAlumno2026!","ESTUDIANTE");
        };
    }
    private void crearDemo(CuentaRepository cuentas,PasswordEncoder encoder,String usuario,String clave,String rol) {
        if(cuentas.existsByUsuario(usuario)) return;
        var c=new Cuenta(); c.setUsuario(usuario); c.setClaveHash(encoder.encode(clave)); c.setRol(rol); cuentas.save(c);
    }
}
