CREATE TABLE IF NOT EXISTS ordenes (
  id BIGSERIAL PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  usuario_email TEXT,
  items JSONB NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  descuento NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) NOT NULL,
  cupon_codigo TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente_pago',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Evaluación 3: la orden nace "pendiente_pago" y pasa a "pagada" cuando
-- mspago publica el resultado aprobado en Kafka (tópico payment-results).
ALTER TABLE ordenes ALTER COLUMN estado SET DEFAULT 'pendiente_pago';
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS pago_id TEXT;
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS pagada_en TIMESTAMPTZ;
