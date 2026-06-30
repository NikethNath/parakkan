"use client";

import type { SelectHTMLAttributes } from "react";

/**
 * A <select> that submits its parent <form> as soon as its value changes — the
 * dropdown twin of AutoSubmitDate, so no "Show" button is needed.
 */
export default function AutoSubmitSelect(
  props: SelectHTMLAttributes<HTMLSelectElement>,
) {
  return (
    <select
      {...props}
      onChange={(e) => {
        props.onChange?.(e);
        e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}
