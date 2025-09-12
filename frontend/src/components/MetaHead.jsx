import React, { useEffect } from "react";

/** Minimal placeholder. Sets document title if provided; renders nothing. */
export default function MetaHead({ title, description }) {
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);
  return null;
}
