function pad(value) {
  return String(value).padStart(2, '0');
}

export function makeReceiptTimestamp(date = new Date()) {
  return {
    date: `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}
