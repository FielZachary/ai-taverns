"use client";

import { eldermereMapImageSrc } from "./eldermere-map";

type EldermereMapModalProps = {
  onClose: () => void;
};

export function EldermereMapModal({ onClose }: EldermereMapModalProps) {
  return (
    <div className="eldermere-map-backdrop" role="presentation">
      <section
        className="eldermere-map-modal"
        aria-label="Eldermere map"
        role="dialog"
      >
        <header className="eldermere-map-header">
          <h2>Eldermere</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="eldermere-map-frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            aria-label="Map of Eldermere"
            alt="Map of Eldermere"
            src={eldermereMapImageSrc}
          />
        </div>
      </section>
    </div>
  );
}
