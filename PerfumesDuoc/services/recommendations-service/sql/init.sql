-- Esquema del Microservicio de Recomendaciones.
-- Se llena únicamente con los eventos del tópico Kafka "orders-paid".
CREATE TABLE IF NOT EXISTS rec_compras (
  usuario_id TEXT NOT NULL,
  producto_id BIGINT NOT NULL,
  cantidad INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (usuario_id, producto_id)
);

-- Órdenes ya procesadas: evita contar dos veces si Kafka reentrega un mensaje.
CREATE TABLE IF NOT EXISTS rec_ordenes_procesadas (
  orden_id BIGINT PRIMARY KEY,
  procesada_en TIMESTAMPTZ DEFAULT NOW()
);
