package com.plustwenty.academic.model;
import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import lombok.Getter;
import lombok.Setter;
@Entity @Getter @Setter
public class FichaEstudiante {
 @Id @Pattern(regexp="[0-9]{8}") private String dni;
 @NotBlank @Size(max=120) private String nombre;
 @NotBlank @Size(max=120) private String contacto;
 @NotBlank @Pattern(regexp="[+0-9 ()-]{7,20}",message="Indica un teléfono válido.") private String telefono;
 @NotBlank @Pattern(regexp="Estudiante|Madre|Padre|Tutor|Otro") private String parentesco="Estudiante";
 @Size(max=500) @Column(length=500) private String observaciones;
}
