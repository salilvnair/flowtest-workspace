"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type NavItem = {
  label: string;
  href: string;
  external?: boolean;
};

const INTERNAL_LINKS: NavItem[] = [
  { label: "Run Center", href: "/run-center" },
  { label: "Start Intake", href: "/" },
  { label: "API Explorer", href: "/api-explorer" },
  { label: "AI Generated Data", href: "/ai-generated-data" },
  { label: "Scenario Form", href: "/scenario-form" },
  { label: "Mocks Form", href: "/mocks-form" },
  { label: "Vision Form", href: "/vision-form" }
];

const RUNTIME_LINKS: NavItem[] = [
  { label: "WireMock OpenAPI", href: "http://localhost:8080/api/scenarios/wiremock/openapi", external: true },
  { label: "WireMock Mappings", href: "http://localhost:8080/api/scenarios/wiremock/mappings", external: true },
  { label: "Allure Report", href: "http://127.0.0.1:5057", external: true },
  { label: "Temporal UI", href: "http://localhost:8233/namespaces/default/workflows", external: true }
];

export function GlobalSideNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = useMemo(() => {
    return (href: string) => {
      if (href === "/") return pathname === "/";
      return pathname === href || pathname?.startsWith(`${href}/`);
    };
  }, [pathname]);

  useEffect(() => {
    if (open) document.body.classList.add("ftNavOpen");
    else document.body.classList.remove("ftNavOpen");
    return () => document.body.classList.remove("ftNavOpen");
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        className="ftNavFab"
        aria-label="Open navigation"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      <button
        type="button"
        className={`ftNavBackdrop${open ? " open" : ""}`}
        aria-label="Close navigation backdrop"
        onClick={() => setOpen(false)}
      />

      <aside className={`ftNavDrawer${open ? " open" : ""}`}>
        <div className="ftNavHead">
          <span>FlowTest Nav</span>
          <button type="button" className="ftNavClose" aria-label="Close navigation" onClick={() => setOpen(false)}>
            <svg viewBox="0 0 24 24">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="ftNavGroup">
          <div className="ftNavLabel">Pages</div>
          {INTERNAL_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`ftNavLink${isActive(item.href) ? " active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="ftNavGroup">
          <div className="ftNavLabel">Runtime URLs</div>
          {RUNTIME_LINKS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="ftNavLink"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </a>
          ))}
        </div>
      </aside>
    </>
  );
}
