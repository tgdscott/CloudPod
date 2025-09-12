import React from "react";
import { useBrand } from "@/brand/BrandContext.jsx";

export default function Logo({ size = 28, lockup = true }) {
  const { brand } = useBrand();
  if (brand.key === "nsc") {
  const logoSrc = size < 32 ? "/nsc_mark_lite.svg" : "/nsclogo.svg";
    return (
      <div className="flex items-center gap-3" aria-label="No Sweat Podcast Studio">
    <img src={logoSrc} width={size} height={size} alt="" />
        {lockup && (
          <span className="font-semibold" style={{ fontSize: size * 0.6 }}>
            No Sweat Podcast Studio
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3" aria-label="Podcast Plus">
      <span className="font-semibold" style={{ fontSize: size * 0.6 }}>
        Podcast Plus
      </span>
    </div>
  );
}
