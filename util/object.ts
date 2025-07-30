
export function transpose<
  const T extends Record<string, any>,
  const K extends Record<string, T>
>(obj: K) { 
  const result = {}

  for(const outerKey in obj) {
    if(obj.hasOwnProperty(outerKey)) {
      const inner = obj[outerKey];

      for(const innerKey in inner) {
        if(inner.hasOwnProperty(innerKey)) {
          // @ts-expect-error
          if(!result[innerKey]) {
            // @ts-expect-error
            result[innerKey] = {};
          }
          
          // @ts-expect-error
          result[innerKey][outerKey] = inner[innerKey];
        }
      }
    }
  }

  return result as {
    [A in keyof K[keyof K]]: {
      [B in keyof K]: K[B][A]
    }
  }
}