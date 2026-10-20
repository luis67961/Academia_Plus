package com.plustwenty.academic.controller;

import jakarta.validation.constraints.*;
import lombok.Getter;
import lombok.Setter;

@Getter @Setter
public class InscripcionForm {
    @Size(max=160) private String usuario;
    @Size(max=64) private String clave;
    @Size(max=64) private String repetirClave;
    @NotBlank(message="Indica el nombre del estudiante.") @Size(max=120)
    private String alumno;
    @NotBlank @Pattern(regexp="[0-9]{8}", message="El DNI debe tener 8 dígitos.")
    private String dni;
    @NotBlank(message="Indica a quién debemos contactar.") @Size(max=120)
    private String contacto;
    @NotBlank @Pattern(regexp="[+0-9 ()-]{7,20}", message="Indica un teléfono válido, de 7 a 20 caracteres.")
    private String telefono;
    @NotNull(message="Selecciona un curso y grupo.")
    private Long programaId;
    @NotBlank @Pattern(regexp="Mañana|Tarde|Noche", message="Selecciona un turno válido.")
    private String turno;
    @AssertTrue(message="Debes autorizar el contacto para gestionar tu solicitud.")
    private boolean aceptaContacto;
}
