import type { ButtonHTMLAttributes } from "react";
import Link from "next/link";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  href?: string;
  variant?: "primary" | "secondary" | "ghost";
};

const variants = {
  primary: "bg-lime-300 text-slate-950 shadow-sm shadow-lime-300/10 hover:bg-lime-200 hover:shadow-lime-300/20 active:bg-lime-400",
  secondary: "border border-white/15 bg-white/5 text-white hover:border-white/20 hover:bg-white/10 active:bg-white/15",
  ghost: "text-slate-300 hover:bg-white/5 hover:text-white active:bg-white/10",
};

const base =
  "inline-flex min-h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:pointer-events-none disabled:opacity-50";

export function Button({ className = "", variant = "primary", href, children, ...props }: ButtonProps) {
  const classes = `${base} ${variants[variant]} ${className}`;

  if (href) {
    return (
      <Link className={classes} href={href}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
