
export function transpose(obj: Record<string, any>) {
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

  return result;
}