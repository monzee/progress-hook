/**
 * A Church-encoded sum type.
 *
 * This ML type
 * ```haskell
 * data Option a = None | Some a
 * ```
 * is analogous to:
 * ```ts
 * type Option<T> = Sum<{ none: []; some: [value: T] }>;
 * ```
 *
 * @param cases The visitor object.
 * @template Variants The type of the visitor.
 */
export type Sum<Variants> = <T>(cases: Visitor<Variants, T>) => T;

/**
 * An obect-oriented analog to a pattern match expression.
 *
 * @template Variants Defines the branches and their associated data.
 * @template T The type of value the branches converge into.
 */
export type Visitor<Variants, T> = {
  [V in keyof Variants]?: Variants[V] extends any[]
    ? (...pattern: Variants[V]) => T
    : never;
} & {
  /** Fallback for partial visitors when none of the given branches match. */
  otherwise?: () => T;
};

/**
 * Narrows the type `object` to exclude functions and arrays.
 */
export type ObjectsOnly<T extends object> = Exclude<T, Function | any[]>;

/**
 * The bottom value.
 *
 * Usable as a default `otherwise` branch in a sum implementation.
 */
export function bottom<T>(): T {
  throw new Error("Missing branch!");
}

/**
 * Does nothing, returns nothing.
 *
 * @template T This is a lie. Only here to make it usable with visitors.
 */
export function pass<T>(): T {
  return undefined!;
}

/**
 * Adds properties to an error object.
 *
 * Because TS or eslint (don't know which, probably the latter) bitches about
 * throwing non-error objects and TS doesn't like you assigning new members to
 * an error object.
 *
 * @param error The error instance to extend.
 * @param props An object literal with the members to add to the error.
 * Realistically contains only boolean members to allow a catch block to
 * distinguish an error object.
 * @template A The formal type of the extension.
 */
export function extendError<A extends object>(
  error: Error,
  props: ObjectsOnly<A>
): A & Error {
  return Object.assign(error, props);
}
