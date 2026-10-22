import useModuleStore from '../../_shared/store/moduleStore';
import { isModuleActive, MODULES } from '../../_shared/navigation/modules';

/** Is the Courses module on? Menus only mentions courses (a chef who teaches, a recipe that may be copied into a course) when it is. */
export default function useCoursesOn() {
  useModuleStore((s) => s.active);   // re-render when the modules change

  return isModuleActive(MODULES.COURSES);
}
