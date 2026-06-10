import type { WeatherRecord } from "../types/domain";

export function dailyChillHours(record: WeatherRecord, minC = 0, maxC = 7.2): number {
  if (record.hourlyTempsC?.length) {
    return record.hourlyTempsC.filter((temp) => temp >= minC && temp <= maxC).length;
  }

  const mean = (record.tminC + record.tmaxC) / 2;
  return mean >= minC && mean <= maxC ? 24 : 0;
}

export function cumulativeChillHours(records: WeatherRecord[], minC = 0, maxC = 7.2): Array<{ date: string; chillHours: number; cumulativeChillHours: number }> {
  let total = 0;

  return records.map((record) => {
    const chillHours = dailyChillHours(record, minC, maxC);
    total += chillHours;
    return {
      date: record.date,
      chillHours,
      cumulativeChillHours: total,
    };
  });
}
