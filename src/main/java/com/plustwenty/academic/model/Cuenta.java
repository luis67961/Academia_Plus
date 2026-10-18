package com.plustwenty.academic.model;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
@Entity @Getter @Setter
public class Cuenta {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
    @Column(nullable=false, unique=true, length=160) private String usuario;
    @Column(nullable=false, length=100) private String claveHash;
    @Column(nullable=false, length=20) private String rol;
}
