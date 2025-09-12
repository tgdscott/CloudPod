// frontend/src/brand/BrandContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { BRANDS } from "./brands";

// Accept ?brand=ppp|nsc|auto override
function pickInitialBrand() {
  const qp = new URLSearchParams(window.location.search).get("brand");
  if (qp === "ppp" || qp === "nsc") {
    localStorage.setItem("brand", qp);
    return qp;
  }
  if (qp === "auto") {
    localStorage.removeItem("brand");
  }
  const saved = localStorage.getItem("brand");
  if (saved === "ppp" || saved === "nsc") return saved;
  // Auto 50/50 bucket, then persist the assignment
  const assigned = Math.random() < 0.5 ? "ppp" : "nsc";
  localStorage.setItem("brand", assigned);
  return assigned;
}

const BrandCtx = createContext({ brand: BRANDS.ppp, setBrandKey: () => {} });

export function BrandProvider({ children }) {
  const [key, setKey] = useState(pickInitialBrand());
  const brand = useMemo(() => BRANDS[key] || BRANDS.ppp, [key]);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove("brand-ppp", "brand-nsc");
    html.classList.add(`brand-${brand.key}`);
    html.setAttribute("data-brand", brand.key);
    try { localStorage.setItem("brand", brand.key); } catch {}
    document.title = brand.key === "nsc" ? "No Sweat Podcast Studio" : "Podcast Plus";
  }, [brand]);

  return (
    <BrandCtx.Provider value={{ brand, setBrandKey: setKey }}>
      {children}
    </BrandCtx.Provider>
  );
}
export const useBrand = () => useContext(BrandCtx);
