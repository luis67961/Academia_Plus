package com.plustwenty.academic.config;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
@Configuration
public class SecurityConfig {
 @Bean SecurityFilterChain security(HttpSecurity http)throws Exception{
  return http.authorizeHttpRequests(a->a.dispatcherTypeMatchers(jakarta.servlet.DispatcherType.ERROR).permitAll().requestMatchers("/css/**","/images/**","/estilos.css","/login").permitAll().requestMatchers("/portal","/portal/**").hasAnyRole("PADRE","ESTUDIANTE").anyRequest().hasRole("ADMIN"))
   .formLogin(f->f.loginPage("/login").successHandler((request,response,auth)->response.sendRedirect(auth.getAuthorities().stream().anyMatch(a->a.getAuthority().equals("ROLE_ADMIN"))?"/dashboard":"/portal")).permitAll())
   .logout(l->l.logoutSuccessUrl("/login?logout")).build();
 }
 @Bean UserDetailsService users(){var encoder=new BCryptPasswordEncoder();return new InMemoryUserDetailsManager(
  User.withUsername("admin").password("{bcrypt}"+encoder.encode("DemoAdmin2026!")).roles("ADMIN").build(),
  User.withUsername("padre").password("{bcrypt}"+encoder.encode("DemoFamilia2026!")).roles("PADRE").build(),
  User.withUsername("estudiante").password("{bcrypt}"+encoder.encode("DemoAlumno2026!")).roles("ESTUDIANTE").build());}
}

