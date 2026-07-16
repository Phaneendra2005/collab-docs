/**
 * Recursively freezes an object to ensure runtime immutability.
 * Time Complexity: O(N) where N is number of nested keys.
 */
export function deepFreeze<T>(object: T): T {
  if (object === null || typeof object !== 'object') {
    return object
  }

  const propNames = Object.getOwnPropertyNames(object)

  for (const name of propNames) {
    const value = (object as any)[name]

    if (value && typeof value === 'object') {
      deepFreeze(value)
    }
  }

  return Object.freeze(object)
}
