
// Получить все категории с backend
export async function getCategories() {
  const res = await fetch('/api/categories');
  if (!res.ok) return [];
  return await res.json();
}

// Добавить категорию через backend
export async function addCategory(name) {
  const res = await fetch('/api/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Ошибка добавления категории');
  return await res.json();
}
