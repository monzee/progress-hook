export type Sum<Variants> = <T>(cases: Visitor<Variants, T>) => T;

type Visitor<Variants, T> = {
  [V in keyof Variants]?: Variants[V] extends any[]
    ? (...pattern: Variants[V]) => T
    : never;
} & {
  /** Fallback for partial visitors when none of the given branches match. */
  otherwise?: () => T;
};

export function bottom<T>(): T {
  throw new Error("Missing branch!");
}

export function pass<T>(): T {
  return undefined!;
}

export function randomInt(
  bound: number,
  ceil: number = Number.MIN_SAFE_INTEGER
): number {
  let random = Math.random();
  if (ceil < bound) {
    return Math.floor(random * bound);
  } else {
    return Math.floor(random * (ceil - bound) + bound);
  }
}
