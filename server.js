const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3001;
const PRODUCTS_PATH = path.join(__dirname, 'public', 'products.json');

app.use(bodyParser.json());

// Получить все товары
app.get('/products', (req, res) => {
  fs.readFile(PRODUCTS_PATH, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Read error' });
    res.json(JSON.parse(data));
  });
});

// Сохранить все товары (перезапись)
app.post('/products', (req, res) => {
  const products = req.body;
  if (!Array.isArray(products)) return res.status(400).json({ error: 'Invalid data' });
  fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2), (err) => {
    if (err) return res.status(500).json({ error: 'Write error' });
    res.json({ ok: true });
  });
});

app.listen(PORT, () => {
  console.log(`Products API running on http://localhost:${PORT}`);
});
