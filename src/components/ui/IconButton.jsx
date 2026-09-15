import React from "react";
import { cn } from "@/lib/utils";

export const IconButton = React.forwardRef(function IconButton(
  {
    children,
    className = "",
    variant = "default",
    size = "default",
    active = false,
    ...props
  },
  ref
) {
  const baseStyles =
    "inline-flex items-center justify-center shrink-0 border-0 bg-transparent transition-colors duration-150 cursor-pointer p-0 select-none";

  const sizeStyles = {
    default: "w-11 h-11",
    sm: "w-8 h-8",
    xs: "w-7 h-7",
  };

  const variantStyles = {
    default:
      "hover:bg-[rgba(36,35,31,0.06)] active:bg-[rgba(36,35,31,0.12)] text-ink rounded-[4px]",
    glass:
      "rounded-full border border-white/35 bg-white/20 backdrop-blur-md text-white hover:bg-white/35",
  };

  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        baseStyles,
        sizeStyles[size] || sizeStyles.default,
        variantStyles[variant] || variantStyles.default,
        active && "bg-[rgba(36,35,31,0.08)]",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});

export default IconButton;
