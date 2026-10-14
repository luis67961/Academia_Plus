package com.plustwenty.academic.config;

import com.plustwenty.academic.model.Matricula;
import com.plustwenty.academic.repository.MatriculaRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.LocalDate;
import java.util.List;

/**
 * Carga matriculas de ejemplo cuando la base de datos (H2 en memoria)
 * arranca vacia, para que las vistas tengan datos con los que trabajar.
 */
@Configuration
public class DataSeeder {

    @Bean
    CommandLineRunner seedMatriculas(MatriculaRepository repo) {
        return args -> {
            if (repo.count() > 0) return;
            LocalDate hoy = LocalDate.now();
            repo.saveAll(List.of(
                    new Matricula("María Fernández Quispe", "72834912", "Matemática", "Mañana", hoy.minusDays(1), "ACTIVA"),
                    new Matricula("Juan Pérez Rojas", "81726354", "Comunicación", "Tarde", hoy.minusDays(2), "ACTIVA"),
                    new Matricula("Lucía Torres Vega", "70011223", "Inglés", "Mañana", hoy.minusDays(3), "ACTIVA"),
                    new Matricula("Carlos Huamán Díaz", "74455667", "Razonamiento Matemático", "Noche", hoy.minusDays(5), "INACTIVA"),
                    new Matricula("Ana Castillo Mendoza", "76677889", "Ciencias", "Tarde", hoy.minusDays(7), "ACTIVA"),
                    new Matricula("Diego Ramírez Soto", "73322110", "Historia", "Mañana", hoy.minusDays(9), "ACTIVA"),
                    new Matricula("Valeria Chávez Luna", "75566778", "Computación", "Noche", hoy.minusDays(12), "ACTIVA"),
                    new Matricula("Mateo Salazar Paredes", "71122334", "Razonamiento Verbal", "Tarde", hoy.minusDays(15), "INACTIVA"),
                    new Matricula("Camila Flores Ríos", "77788990", "Matemática", "Mañana", hoy.minusDays(20), "ACTIVA"),
                    new Matricula("Sebastián Vargas Cruz", "72233445", "Inglés", "Tarde", hoy.minusDays(26), "ACTIVA"),
                    new Matricula("Daniela Gutiérrez Pino", "79900112", "Comunicación", "Noche", hoy.minusDays(33), "ACTIVA"),
                    new Matricula("Renato Espinoza Lara", "70099887", "Ciencias", "Mañana", hoy.minusDays(40), "INACTIVA"),
                    new Matricula("Fabiola Ortiz Campos", "78877665", "Historia", "Tarde", hoy.minusDays(48), "ACTIVA"),
                    new Matricula("Gabriel Medina Rojas", "71234567", "Computación", "Mañana", hoy.minusDays(55), "ACTIVA")
            ));
        };
    }
}
