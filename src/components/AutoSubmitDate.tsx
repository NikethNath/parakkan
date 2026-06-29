"use client";

import type { InputHTMLAttributes } from "react";

/**
 * A date / month input that submits its parent <form> as soon as its value
 * changes — so no "Show" / "Apply" button is needed. The form stays an ordinary
 * GET form (full navigation), so the URL-based filters and the nav's tab memory
 * keep working exactly as before.
 */
export default function AutoSubmitDate(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      onChange={(e) => {
        props.onChange?.(e);
        e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}
