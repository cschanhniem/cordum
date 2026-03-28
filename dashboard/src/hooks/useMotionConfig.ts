import { useReducedMotion } from "framer-motion";
import { useMemo } from "react";

/**
 * useMotionConfig returns reduced-motion-aware Framer Motion presets.
 * Components spread the returned props instead of hardcoding transitions,
 * so the entire dashboard respects prefers-reduced-motion consistently.
 */
export function useMotionConfig() {
  const prefersReducedMotion = useReducedMotion();

  return useMemo(() => {
    const shouldAnimate = !prefersReducedMotion;
    const instant = { duration: 0 };
    const spring = { type: "spring" as const, stiffness: 300, damping: 30 };
    const ease = { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const };

    return {
      shouldAnimate,
      transition: shouldAnimate ? ease : instant,
      springTransition: shouldAnimate ? spring : instant,
      fadeIn: {
        initial: shouldAnimate ? { opacity: 0 } : false,
        animate: { opacity: 1 },
        exit: shouldAnimate ? { opacity: 0 } : { opacity: 1 },
        transition: shouldAnimate ? ease : instant,
      },
      slideIn: {
        initial: shouldAnimate ? { opacity: 0, y: 8 } : false,
        animate: { opacity: 1, y: 0 },
        exit: shouldAnimate ? { opacity: 0, y: 8 } : { opacity: 1 },
        transition: shouldAnimate ? ease : instant,
      },
      scaleIn: {
        initial: shouldAnimate ? { opacity: 0, scale: 0.95 } : false,
        animate: { opacity: 1, scale: 1 },
        exit: shouldAnimate ? { opacity: 0, scale: 0.95 } : { opacity: 1 },
        transition: shouldAnimate ? ease : instant,
      },
    };
  }, [prefersReducedMotion]);
}
