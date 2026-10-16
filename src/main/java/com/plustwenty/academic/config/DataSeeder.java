package com.plustwenty.academic.config;

import com.plustwenty.academic.model.Matricula;
import com.plustwenty.academic.repository.MatriculaRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.LocalDate;
import java.util.List;

/**
 * Carga matrículas ficticias una sola vez cuando la base local
 * arranca vacia, para que las vistas tengan datos con los que trabajar.
 */
@Configuration
public class DataSeeder {

    @Bean
    CommandLineRunner seedMatriculas(MatriculaRepository repo, com.plustwenty.academic.service.CobranzaService cobranza, com.plustwenty.academic.repository.CuotaRepository cuotas, com.plustwenty.academic.repository.ProgramaRepository programas) {
        return args -> {
            if (programas.count()==0){
                for(String nombre: java.util.List.of("Matemática","Oratoria","Locución","Podcast")){
                    var programa=new com.plustwenty.academic.model.Programa();
                    programa.setNombre(nombre);programa.setGrupo("Grupo A · Mañana");
                    programa.setCursos(switch(nombre){case "Matemática" -> "Aritmética, álgebra y resolución de problemas";case "Oratoria" -> "Expresión oral, seguridad y presentaciones";case "Locución" -> "Dicción, voz y técnicas de locución";default -> "Guion, grabación y producción de podcast";});
                    programa.setHorario("Lunes, miércoles y viernes · 9:00 a 11:00");programas.save(programa);
                }
            }
            if (repo.count() > 0) return;
            LocalDate hoy = LocalDate.now();
            repo.saveAll(List.of(
                    new Matricula("María Fernández Quispe", "72834912", "Matemática", "Mañana", hoy.minusDays(1), "ACTIVA"),
                    new Matricula("Juan Pérez Rojas", "81726354", "Oratoria", "Tarde", hoy.minusDays(2), "ACTIVA"),
                    new Matricula("Lucía Torres Vega", "70011223", "Locución", "Mañana", hoy.minusDays(3), "ACTIVA"),
                    new Matricula("Carlos Huamán Díaz", "74455667", "Matemática", "Noche", hoy.minusDays(5), "INACTIVA"),
                    new Matricula("Ana Castillo Mendoza", "76677889", "Podcast", "Tarde", hoy.minusDays(7), "ACTIVA"),
                    new Matricula("Diego Ramírez Soto", "73322110", "Oratoria", "Mañana", hoy.minusDays(9), "ACTIVA"),
                    new Matricula("Valeria Chávez Luna", "75566778", "Podcast", "Noche", hoy.minusDays(12), "ACTIVA"),
                    new Matricula("Mateo Salazar Paredes", "71122334", "Locución", "Tarde", hoy.minusDays(15), "INACTIVA"),
                    new Matricula("Camila Flores Ríos", "77788990", "Matemática", "Mañana", hoy.minusDays(20), "ACTIVA"),
                    new Matricula("Sebastián Vargas Cruz", "72233445", "Locución", "Tarde", hoy.minusDays(26), "ACTIVA"),
                    new Matricula("Daniela Gutiérrez Pino", "79900112", "Oratoria", "Noche", hoy.minusDays(33), "ACTIVA"),
                    new Matricula("Renato Espinoza Lara", "70099887", "Podcast", "Mañana", hoy.minusDays(40), "INACTIVA"),
                    new Matricula("Fabiola Ortiz Campos", "78877665", "Oratoria", "Tarde", hoy.minusDays(48), "ACTIVA"),
                    new Matricula("Gabriel Medina Rojas", "71234567", "Podcast", "Mañana", hoy.minusDays(55), "ACTIVA")
            ));
            for (Matricula m : repo.findAll()) {
                var oferta=programas.findAll();var grupo=oferta.get((int)((m.getId()-1)%oferta.size()));
                m.setPrograma(grupo);m.setCurso(grupo.getNombre());repo.save(m);
                cobranza.generar(m, 3, new java.math.BigDecimal("350.00"));
                if (m.isActiva()) {
                    var primera = cuotas.findByMatriculaIdOrderByNumero(m.getId()).getFirst();
                    cobranza.pagar(primera.getId(), new java.math.BigDecimal("350.00"), "Efectivo", "Pago de pensión");
                }
            }
        };
    }
}
