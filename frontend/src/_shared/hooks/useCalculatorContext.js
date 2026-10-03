import { useEffect, useRef } from 'react';
import useCalculatorStore from '../store/calculatorStore';

let counter = 0;

/** Tell the calculator what this page (or dialog) is about. `context` is a small object ({ type, id, draft … }); pass null while nothing is loaded. */
export default function useCalculatorContext(context) {
  const id = useRef(null);
  if (id.current === null) id.current = `ctx-${++counter}`;
  const publish = useCalculatorStore((s) => s.publish);
  const retract = useCalculatorStore((s) => s.retract);
  const key = context ? JSON.stringify(context) : '';
  useEffect(() => { publish(id.current, key ? JSON.parse(key) : null); }, [key, publish]);
  useEffect(() => { const me = id.current; return () => retract(me); }, [retract]);
}
