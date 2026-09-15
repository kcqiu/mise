import React from "react";
import { cn } from "@/lib/utils";

export const TextButton = React.forwardRef(function TextButton(
  { children, className = "", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "inline-flex items-center gap-2 min-h-[44px] p-0 bg-transparent border-0 text-[13px] font-[550] text-ink hover:text-terracotta transition-colors duration-150 cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});

export default TextButton;
