export const utcHourKey = (d = new Date()): string =>
  d.toISOString().slice(0, 13).replace(/[-T]/g, ''); // 'YYYYMMDDHH'

export const startOfNextUtcHour = (d = new Date()): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours() + 1, 0, 0, 0));
