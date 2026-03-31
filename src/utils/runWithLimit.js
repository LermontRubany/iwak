/**
 * Оборачивает async-функцию с retry при 429.
 */
async function withRetry(fn, retries = 2) {
  try {
    return await fn();
  } catch (e) {
    if (retries > 0 && (e.message?.includes('429') || e.message?.includes('Слишком много'))) {
      const delay = (3 - retries) * 1000 + 500;
      console.warn(`[bulk] 429 → retry через ${delay}ms, осталось попыток: ${retries}`);
      await new Promise((r) => setTimeout(r, delay));
      return withRetry(fn, retries - 1);
    }
    throw e;
  }
}

/**
 * Выполняет массив async-задач с ограничением параллельности и retry при 429.
 * @param {Array<() => Promise>} tasks — массив функций, возвращающих Promise
 * @param {number} limit — макс. кол-во параллельных запросов (по умолчанию 3)
 * @returns {Promise<Array>} результаты всех задач
 */
export default async function runWithLimit(tasks, limit = 3) {
  const results = [];
  const executing = [];

  for (const task of tasks) {
    const p = withRetry(task).then((res) => {
      executing.splice(executing.indexOf(p), 1);
      return res;
    });

    results.push(p);
    executing.push(p);

    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}
