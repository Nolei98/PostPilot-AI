import React from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'image-slot': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        id?: string;
        placeholder?: string;
        shape?: string;
        style?: React.CSSProperties;
      }, HTMLElement>;
    }
  }
}
