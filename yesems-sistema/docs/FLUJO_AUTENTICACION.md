# Flujo de autenticación YES EMS

Este diagrama describe el comportamiento acordado: el código de correo sirve
para verificar la identidad y acceder a cuentas existentes. Si la cuenta es
nueva o todavía no tiene contraseña YES EMS, primero debe crearla. La contraseña
de Google nunca se solicita ni se modifica.

```mermaid
flowchart TD
    A([Inicio]) --> B{Método de acceso}

    B -->|Correo y contraseña| C[Ingresar correo y contraseña]
    C --> D{¿Credenciales válidas y cuenta activa de alumno/cliente?}
    D -->|No| E[Mostrar error de autenticación]
    E --> F{¿Qué desea hacer?}
    F -->|Reintentar| C
    F -->|Recuperar contraseña YES EMS| R[Solicitar código de recuperación]
    R --> R1[Ingresar código y contraseña nueva]
    R1 --> R2{¿Código vigente y válido?}
    R2 -->|No| R3[Mostrar error y permitir reintento]
    R3 --> R
    R2 -->|Sí| R4[Actualizar contraseña y revocar sesiones anteriores]
    R4 --> C
    D -->|Sí| Z[Verificar estado y permisos de la cuenta]

    B -->|Código por correo| G[Ingresar correo electrónico]
    G --> H[Solicitar código de 6 dígitos]
    H --> I[Ingresar código recibido]
    I --> J{¿Código vigente y válido?}
    J -->|No| J1[Mostrar error y permitir reintento]
    J1 --> I
    J -->|Sí| K[Buscar cuenta por correo verificado]
    K --> L{¿Cuenta existente y autorizada?}
    L -->|No existe| M[Crear cuenta cliente pendiente de contraseña]
    L -->|Sí, sin contraseña| N[Emitir permiso temporal para crear contraseña]
    M --> N
    L -->|Sí, con contraseña| Z
    N --> N1{¿Faltan datos básicos de perfil?}
    N1 -->|Sí| N2[Completar nombre, apellidos y teléfono]
    N1 -->|No| N3[Crear contraseña YES EMS]
    N2 --> N3
    N3 --> N4[Guardar contraseña y revocar permisos previos]
    N4 --> Z

    B -->|Google| O[Redirigir a Google y autorizar la cuenta]
    O --> P{¿Credencial, correo verificado y reto válidos?}
    P -->|No| P1[Mostrar error o cancelación]
    P1 --> B
    P -->|Sí| Q{¿Google ya está vinculado?}
    Q -->|Sí| Q1[Recuperar la cuenta vinculada]
    Q -->|No| Q2{¿Hay cuenta YES EMS con el mismo correo verificado?}
    Q2 -->|Sí, sin otro vínculo Google| Q3[Vincular Google a esa cuenta]
    Q2 -->|No| Q4[Crear cuenta verificada]
    Q2 -->|Sí, vinculada a otro Google| P1
    Q1 --> S{¿Cuenta activa de alumno/cliente?}
    Q3 --> S
    Q4 --> S
    S -->|No| P1
    S -->|Sí, ya tiene contraseña YES EMS| Z
    S -->|Sí, sin contraseña| N

    Z --> T{¿Acceso autorizado?}
    T -->|No| U[Mostrar acceso denegado]
    U --> B
    T -->|Sí| V[Crear sesión segura]
    V --> W[Cargar perfil y permisos]
    W --> X[Entrar al panel YES EMS]
    X --> Y([Fin])

    classDef decision fill:#101d2a,stroke:#f4b942,stroke-width:2px,color:#fff;
    classDef process fill:#0d1823,stroke:#2488c2,color:#fff;
    classDef success fill:#0d251e,stroke:#38b884,stroke-width:2px,color:#fff;
    classDef error fill:#211416,stroke:#cc6870,color:#fff;
    class B,D,F,R2,J,L,N1,P,Q,Q2,S,T decision;
    class C,G,H,I,K,M,N,N2,N3,N4,O,Q1,Q3,Q4,Z,V,W process;
    class X,Y success;
    class E,R3,J1,P1,U error;
```

## Notas del flujo

- El código para iniciar sesión y el código de recuperación tienen propósitos
  distintos; no se pueden intercambiar.
- Una cuenta que ya tiene contraseña puede entrar con contraseña, código de
  correo o Google si este último está vinculado.
- Google se vincula a una cuenta existente solo cuando Google confirma el mismo
  correo y esa cuenta aún no está vinculada a otro `sub` de Google. No se
  fusionan registros duplicados.
- Los perfiles nuevos por correo completan nombre, apellidos y teléfono al
  establecer la primera contraseña. En Google, nombre y apellidos provienen del
  token verificado; el teléfono se solicita durante la inscripción al curso.
- Las cuentas administrativas usan su pantalla y autenticación separadas.
