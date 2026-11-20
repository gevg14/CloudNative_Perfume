-- Esquema del Microservicio de Perfil de Usuario.
-- usuario_id es el identificador del token (claim "sub" de Azure AD).
CREATE TABLE IF NOT EXISTS perfiles (
  usuario_id TEXT PRIMARY KEY,
  email TEXT,
  nombre TEXT,
  telefono TEXT,
  direccion TEXT,
  comuna TEXT,
  ciudad TEXT,
  categoria_preferida TEXT CHECK (categoria_preferida IN ('hombre', 'mujer', 'unisex')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
