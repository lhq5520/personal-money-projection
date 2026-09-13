import { useEffect, useRef, useState } from 'react';

/**
 * Observe the container width so the SVG renders at real pixel sizes — scaling via viewBox would
 * stretch the text along with everything else.
 *
 * 观测容器宽度，让 SVG 按真实像素渲染——用 viewBox 缩放会把文字一起拉变形。
 */
export function useMeasure<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(720);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}
