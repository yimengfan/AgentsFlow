import { useState, useCallback, useMemo } from "react";
import { BUTTON, TEXT } from "./workbench-tokens.js";

/**
 * useButtonHover — returns hover event handlers + computed background + common style.
 *
 * Follows uipro Dark Mode (OLED) button specifications:
 * - cursor: pointer on all clickable elements
 * - smooth background-color transitions (200ms ease)
 * - subtle border on hover for depth
 * - text color brightens on hover
 *
 * @param baseBg - background when not hovered (defaults to "transparent")
 *
 * Usage:
 *   const { hoverProps, hoverBg, isHovered, buttonStyle } = useButtonHover();
 *   <button style={{ background: isToggled ? (isHovered ? BUTTON.activeBg : SURFACE.sidebar) : hoverBg, ...buttonStyle }} {...hoverProps} />
 */
export function useButtonHover(baseBg: string = "transparent") {
  const [isHovered, setIsHovered] = useState(false);

  const onMouseEnter = useCallback(() => setIsHovered(true), []);
  const onMouseLeave = useCallback(() => setIsHovered(false), []);

  const hoverBg = isHovered ? BUTTON.hoverBg : baseBg;

  /** Common chrome button styles — spread onto any button element.
   * Includes cursor:pointer, transition, border-radius, and hover border/text. */
  const buttonStyle = useMemo(
    (): React.CSSProperties => ({
      cursor: "pointer",
      transition: `background-color ${BUTTON.transitionMs}ms ease, color ${BUTTON.transitionMs}ms ease, border-color ${BUTTON.transitionMs}ms ease`,
      borderRadius: BUTTON.borderRadius,
      // Use individual border properties to avoid React shorthand conflict
      // when components set their own borderLeft/borderBottom
      borderTop: isHovered ? `1px solid ${BUTTON.borderHover}` : "1px solid transparent",
      borderRight: isHovered ? `1px solid ${BUTTON.borderHover}` : "1px solid transparent",
      borderBottom: isHovered ? `1px solid ${BUTTON.borderHover}` : "1px solid transparent",
      borderLeft: isHovered ? `1px solid ${BUTTON.borderHover}` : "1px solid transparent",
      color: isHovered ? BUTTON.textHover : TEXT.secondary,
      minHeight: BUTTON.height,
    }),
    [isHovered, hoverBg],
  );

  return {
    hoverBg,
    hoverProps: { onMouseEnter, onMouseLeave },
    isHovered,
    buttonStyle,
  };
}

/**
 * usePrimaryButtonHover — hover handler for primary CTA buttons.
 *
 * Uses primary accent colors and includes glow effect on hover
 * per uipro spec: "minimal glow (text-shadow: 0 0 10px sparingly)".
 */
export function usePrimaryButtonHover() {
  const [isHovered, setIsHovered] = useState(false);

  const onMouseEnter = useCallback(() => setIsHovered(true), []);
  const onMouseLeave = useCallback(() => setIsHovered(false), []);

  const hoverBg = isHovered ? BUTTON.primaryHoverBg : BUTTON.primaryBg;

  /** Primary button styles — includes cursor, transition, glow on hover. */
  const buttonStyle = useMemo(
    (): React.CSSProperties => ({
      cursor: "pointer",
      transition: `background-color ${BUTTON.transitionMs}ms ease, box-shadow ${BUTTON.transitionMs}ms ease`,
      borderRadius: BUTTON.borderRadius,
      borderTop: "1px solid transparent",
      borderRight: "1px solid transparent",
      borderBottom: "1px solid transparent",
      borderLeft: "1px solid transparent",
      color: BUTTON.primaryText,
      minHeight: BUTTON.height,
      boxShadow: isHovered
        ? `0 0 12px ${BUTTON.focusRing}40`  // 25% opacity glow on hover
        : "none",
    }),
    [isHovered, hoverBg],
  );

  return {
    hoverBg,
    hoverProps: { onMouseEnter, onMouseLeave },
    buttonStyle,
  };
}