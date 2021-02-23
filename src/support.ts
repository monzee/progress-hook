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

export function delay(duration: number): Promise<void> {
  return new Promise((ok) => setTimeout(ok, duration));
}

export function withTimeout<P>(
  maxDuration: number,
  promise: Promise<P>
): Promise<P> {
  let deadline = new Promise<never>((_, err) => {
    setTimeout(() => err("timeout"), maxDuration);
  });
  return Promise.race([deadline, promise]);
}
