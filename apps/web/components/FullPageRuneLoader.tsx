import type { ReactNode } from "react";

type RuneLoaderTextProps = {
  children: ReactNode;
  className?: string;
  ariaHidden?: boolean;
};

type FullPageRuneLoaderProps = {
  message: string;
  exitingMessage?: string;
  note?: string;
  ariaLabel?: string;
  className?: string;
  isExiting?: boolean;
};

function classNames(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function RuneLoaderText({
  children,
  className,
  ariaHidden = false
}: RuneLoaderTextProps) {
  return (
    <p className={classNames("rune-loader", className)} aria-hidden={ariaHidden}>
      {children}
      <span className="rune-loader-dots" aria-hidden="true">
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
    </p>
  );
}

export function FullPageRuneLoader({
  message,
  exitingMessage = "",
  note,
  ariaLabel = "Loading",
  className,
  isExiting = false
}: FullPageRuneLoaderProps) {
  return (
    <section
      className={classNames(
        "full-page-rune-loader",
        isExiting && "exiting",
        className
      )}
      aria-label={ariaLabel}
      aria-live="polite"
    >
      <div className="full-page-rune-loader-content campaign-prep-loader">
        <div className="rune-loader-window campaign-prep-loader-window">
          {exitingMessage ? (
            <RuneLoaderText
              key={`exiting-${exitingMessage}`}
              className="rune-loader-message campaign-prep-loader-message exiting"
              ariaHidden
            >
              {exitingMessage}
            </RuneLoaderText>
          ) : null}
          <RuneLoaderText
            key={message}
            className="rune-loader-message campaign-prep-loader-message entering"
          >
            {message}
          </RuneLoaderText>
        </div>
        {note ? (
          <p className="rune-loader-note campaign-prep-loader-note">{note}</p>
        ) : null}
      </div>
    </section>
  );
}
