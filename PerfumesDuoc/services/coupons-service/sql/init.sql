CREATE TABLE IF NOT EXISTS cupones (
  id BIGSERIAL PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('porcentaje', 'monto_fijo')),
  valor NUMERIC(10,2) NOT NULL,
  minimo_compra NUMERIC(10,2) DEFAULT 0,
  usos_maximos INTEGER DEFAULT 1,
  usos_actuales INTEGER DEFAULT 0,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cupones_uso_log (
  id BIGSERIAL PRIMARY KEY,
  codigo TEXT NOT NULL,
  orden_id BIGINT,
  usado_en TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO cupones (codigo, tipo, valor, minimo_compra, usos_maximos) VALUES
 ('BIENVENIDO10', 'porcentaje', 10, 0, 1000),
 ('PERFUME5000', 'monto_fijo', 5000, 30000, 1000)
ON CONFLICT DO NOTHING;
