export const sortAsc = <T extends string | number>(values: T[]): T[] =>
  [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

export const sortDesc = <T extends string | number>(values: T[]): T[] => sortAsc(values).reverse();
