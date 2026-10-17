"use client";

import { useEffect, useRef } from "react";

/** Hero wrapper: pointer-following dot reveal and a small parallax on the two triangles. */
export function Hero({ children }: { children: React.ReactNode }) {
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const hot = hero.querySelector<HTMLElement>(".gridl.hot");
    const triA = hero.querySelector<HTMLElement>(".tri.a");
    const triB = hero.querySelector<HTMLElement>(".tri.b");
    if (!hot || !triA || !triB) return;

    const onMove = (e: MouseEvent) => {
      const b = hero.getBoundingClientRect();
      const x = e.clientX - b.left;
      const y = e.clientY - b.top;
      const mask = `radial-gradient(circle 190px at ${x}px ${y}px, #000 0%, rgba(0,0,0,0) 100%)`;
      hot.style.webkitMaskImage = mask;
      hot.style.maskImage = mask;
      hot.style.opacity = "1";
      const dx = (x / b.width - 0.5) * 34;
      const dy = (y / b.height - 0.5) * 34;
      triA.style.transform = `translate(${-dx}px, ${-dy}px)`;
      triB.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const onLeave = () => {
      hot.style.opacity = "0";
      triA.style.transform = "";
      triB.style.transform = "";
    };

    hero.addEventListener("mousemove", onMove);
    hero.addEventListener("mouseleave", onLeave);
    return () => {
      hero.removeEventListener("mousemove", onMove);
      hero.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <div className="hero" id="top" ref={heroRef}>
      {children}
    </div>
  );
}
