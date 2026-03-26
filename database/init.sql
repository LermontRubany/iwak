-- database/init.sql

CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price NUMERIC(10,2) NOT NULL,
    image VARCHAR(255),
    category VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Можно добавить тестовые данные:
-- INSERT INTO products (name, description, price, image, category) VALUES ('Тестовый товар', 'Описание', 999.99, 'image.jpg', 'Категория');
