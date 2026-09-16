import React from "react";
import { cn } from "@/lib/utils";

export const Button = React.forwardRef(function Button(
  {
    children,
    className = "",
    variant = "primary",
    size = "default",
    as: Component = "button",
    href,
    ...props
  },
  ref
) {
  const Comp = href ? "a" : Component;

  const baseStyles =
    "inline-flex items-center justify-center font-[550] font-sans transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed select-none no-underline cursor-pointer";

  const sizeStyles = {
    default: "min-h-[44px] px-[19px] py-3 text-[13px] gap-[9px] rounded-[4px]",
    sm: "min-h-[36px] px-3.5 py-2 text-xs gap-1.5 rounded-[4px]",
    pill: "min-h-[38px] px-4 py-2 text-xs gap-2 rounded-full",
    action: "min-h-[40px] px-[18px] py-2.5 text-[14px] font-semibold gap-[7px] rounded-[6px]",
  };

  const variantStyles = {
    primary:
      "bg-[#24231f] hover:bg-[#383630] active:bg-[#181714] text-white border border-[#24231f] hover:border-[#383630]",
    light:
      "bg-white hover:bg-[#faf8f5] active:bg-[#f2eee5] text-[#24231f] border border-[#24231f]/15 hover:border-[#24231f]/30",
    ghost:
      "bg-transparent hover:bg-black/5 active:bg-black/10 text-ink border-0",
    accent:
      "bg-[#24231f] hover:bg-[#383630] active:bg-[#181714] text-white border border-[#24231f]",
  };

  return (
    <Comp
      ref={ref}
      href={href}
      className={cn(
        baseStyles,
        sizeStyles[size] || sizeStyles.default,
        variantStyles[variant] || variantStyles.primary,
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  );
});

export default Button;
