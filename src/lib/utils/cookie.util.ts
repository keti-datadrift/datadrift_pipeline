export function getCookie(key: string): string | null {
  const cookieDict = document.cookie
    .split(';')
    .reduce<Record<string, string>>((acc, cur) => {
      const [key, value] = cur.trim().split('=', 2);

      if (key && value) {
        acc[key] = value;
      }

      return acc;
    }, {});

  return cookieDict[key] ?? null;
}
