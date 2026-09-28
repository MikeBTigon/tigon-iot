export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

export const TRI = [
  { value: 'any', label: 'Any' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
] as const;

export type Tri = (typeof TRI)[number]['value'];

export const triMatch = (t: Tri, v: boolean) => t === 'any' || (t === 'yes') === v;

/** Builds "Any" + distinct values present in inventory, most common first. */
export function dynamicOptions(values: string[]): ChipOption<string>[] {
  const counts = new Map<string, { label: string; n: number }>();
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    const e = counts.get(key) || { label: v, n: 0 };
    e.n++;
    counts.set(key, e);
  }
  const opts = [...counts.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, e]) => ({ value: k, label: `${e.label} (${e.n})` }));
  return [{ value: 'any', label: 'Any' }, ...opts];
}
