import { useEffect } from 'react';
import useCalculatorStore from '../store/calculatorStore';

/** Tell the calculator what this page is about. `context` is a small object ({ type, id, … }); pass null while nothing is loaded. */
export default function useCalculatorContext(context) {
  const setContext = useCalculatorStore((s) => s.setContext);
  const key = context ? JSON.stringify(context) : '';
  useEffect(() => {
    setContext(key ? JSON.parse(key) : null);
    return () => setContext(null);
  }, [key, setContext]);
}
