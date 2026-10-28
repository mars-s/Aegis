import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { Board } from "@aegis/domain";
import {
  createDropdown,
  bindDisclosure,
  mountDropdowns,
} from "../../lib/ui/dropdown.js";
import type { Dropdown, DropdownOption } from "../../lib/ui/dropdown.js";
import { writingFontChooser } from "../../features/editing/writing-fonts.js";
import type { FontChooser } from "../../features/editing/writing-fonts.js";
import { OrbMark } from "../../lib/ui/orb-mark.js";
import { ColourPicker } from "../../features/colours/ColourEditor.js";
import "../../lib/ui/ribbon.css";

export function Choice({
  label,
  value,
  options,
  change,
  orb = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly DropdownOption[];
  readonly change: (value: string) => void;
  readonly orb?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null),
    control = useRef<Dropdown | null>(null);
  const latest = useRef(change);
  latest.current = change;
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    mountDropdowns();
    const button = createDropdown({
      label,
      value,
      options,
      onChange: (next) => latest.current(next),
    });
    if (orb) button.insertAdjacentHTML("afterbegin", OrbMark());
    control.current = button;
    host.append(button);
    return () => {
      button.dropdown.destroy();
      button.remove();
      control.current = null;
    };
  }, [label, orb]);
  useEffect(() => {
    control.current?.setOptions(options);
  }, [options]);
  useEffect(() => {
    if (control.current) {
      control.current.value = value;
      control.current.dataset.value = value;
    }
  }, [value]);
  return <div ref={root} className="docs-choice" data-chooser={label} />;
}

export function FontChoice({
  font,
  extra,
  change,
}: {
  readonly font: string;
  readonly extra: readonly string[];
  readonly change: (value: string) => void;
}) {
  const root = useRef<HTMLSpanElement>(null),
    control = useRef<FontChooser | null>(null);
  const latest = useRef(change);
  latest.current = change;
  useEffect(() => {
    const chooser = writingFontChooser(extra);
    control.current = chooser;
    chooser.input.onchange = () => {
      const family = chooser.fontFamily();
      if (family) latest.current(family);
    };
    root.current?.append(chooser.input);
    return () => {
      chooser.destroy();
      chooser.input.remove();
      control.current = null;
    };
  }, [extra]);
  useEffect(() => {
    if (control.current && document.activeElement !== control.current.input)
      control.current.setFont(font);
  }, [font]);
  return <span ref={root} />;
}

export function ColourChoice({
  label,
  colour,
  board,
  change,
}: {
  readonly label: string;
  readonly colour: string;
  readonly board: () => Board;
  readonly change: (colour: string) => void;
}) {
  return <ColourPicker label={label} value={colour} board={board} onChange={change} />;
}

export function Disclosure({
  label,
  name,
  children,
}: {
  readonly label: string;
  readonly name: string;
  readonly children: ReactNode;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!details.current) return;
    mountDropdowns();
    const popup = bindDisclosure(details.current, {
      label: `${label} controls`,
    });
    return () => popup.destroy();
  }, [label]);
  return (
    <details ref={details} className={name}>
      <summary aria-label={label}>{label.replace(" document", "")}</summary>
      <div
        className={
          name === "docs-more" ? "docs-more-tools" : "docs-command-menu"
        }
      >
        {children}
      </div>
    </details>
  );
}
