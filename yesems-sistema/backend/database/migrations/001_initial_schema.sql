CREATE TABLE public.administradores (
    id_administrador integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre varchar(100) NOT NULL,
    apellido varchar(100) NOT NULL,
    email varchar(150) NOT NULL UNIQUE,
    password_hash varchar(255) NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.categorias (
    id_categoria integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre varchar(100) NOT NULL UNIQUE,
    descripcion text,
    activo boolean NOT NULL DEFAULT true,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.usuarios (
    id_usuario integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre varchar(100) NOT NULL,
    apellido varchar(100) NOT NULL,
    email varchar(150) NOT NULL UNIQUE,
    password_hash varchar(255),
    telefono varchar(20),
    fecha_nacimiento date,
    curp varchar(18),
    folio varchar(50) UNIQUE,
    rol varchar(20) NOT NULL DEFAULT 'cliente' CHECK (rol IN ('cliente', 'alumno', 'admin')),
    activo boolean NOT NULL DEFAULT true,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.cursos (
    id_curso integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_categoria integer NOT NULL REFERENCES public.categorias(id_categoria) ON UPDATE CASCADE ON DELETE RESTRICT,
    nombre varchar(150) NOT NULL,
    descripcion text,
    duracion_horas integer NOT NULL CHECK (duracion_horas > 0),
    precio numeric(10,2) NOT NULL DEFAULT 0.00 CHECK (precio >= 0),
    cupo integer NOT NULL CHECK (cupo > 0),
    activo boolean NOT NULL DEFAULT true,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.horarios (
    id_horario integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_curso integer NOT NULL REFERENCES public.cursos(id_curso) ON UPDATE CASCADE ON DELETE CASCADE,
    dia_semana varchar(20) NOT NULL,
    hora_inicio time NOT NULL,
    hora_fin time NOT NULL,
    fecha_inicio date,
    fecha_fin date,
    aula varchar(100),
    CONSTRAINT chk_horario_horas CHECK (hora_fin > hora_inicio),
    CONSTRAINT chk_horario_fechas CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio)
);

CREATE TABLE public.inscripciones (
    id_inscripcion integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_usuario integer NOT NULL REFERENCES public.usuarios(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT,
    id_curso integer NOT NULL REFERENCES public.cursos(id_curso) ON UPDATE CASCADE ON DELETE RESTRICT,
    id_horario integer REFERENCES public.horarios(id_horario) ON UPDATE CASCADE ON DELETE SET NULL,
    fecha_inscripcion timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado varchar(30) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'confirmada', 'cancelada', 'completada')),
    monto_total numeric(10,2) NOT NULL DEFAULT 0.00 CHECK (monto_total >= 0)
);

CREATE TABLE public.pagos (
    id_pago integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_inscripcion integer NOT NULL REFERENCES public.inscripciones(id_inscripcion) ON UPDATE CASCADE ON DELETE RESTRICT,
    monto numeric(10,2) NOT NULL CHECK (monto > 0),
    metodo_pago varchar(30) NOT NULL CHECK (metodo_pago IN ('efectivo', 'transferencia', 'tarjeta', 'otro')),
    fecha_pago timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado varchar(30) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'completado', 'cancelado')),
    referencia varchar(100)
);

CREATE TABLE public.constancias (
    id_constancia integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_inscripcion integer NOT NULL UNIQUE REFERENCES public.inscripciones(id_inscripcion) ON UPDATE CASCADE ON DELETE RESTRICT,
    folio varchar(100) NOT NULL UNIQUE,
    fecha_emision date NOT NULL DEFAULT CURRENT_DATE,
    archivo_url varchar(255),
    estado varchar(30) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'autorizada', 'rechazada'))
);
