-- Esquema del Microservicio de Productos (Catálogo de Perfumes)
CREATE TABLE IF NOT EXISTS productos (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  marca TEXT NOT NULL,
  descripcion TEXT,
  categoria TEXT NOT NULL CHECK (categoria IN ('hombre', 'mujer', 'unisex')),
  precio NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  imagen_url TEXT,
  ml INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO productos (nombre, marca, descripcion, categoria, precio, stock, imagen_url, ml) VALUES
 ('Bleu de Chanel', 'Chanel', 'Fragancia amaderada aromática para hombre', 'hombre', 89990, 25, '', 100),
 ('Chanel N°5', 'Chanel', 'Icónico floral aldehídico', 'mujer', 99990, 20, '', 100),
 ('Sauvage', 'Dior', 'Fresco y especiado, ideal para el día a día', 'hombre', 79990, 30, '', 100),
 ('Miss Dior', 'Dior', 'Floral chipre elegante', 'mujer', 84990, 18, '', 50),
 ('Light Blue', 'Dolce & Gabbana', 'Cítrico y refrescante unisex', 'unisex', 64990, 40, '', 100)
ON CONFLICT DO NOTHING;
