import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TrustPage } from "./TrustPage";
import { trustPageByPath } from "@/lib/trust-pages";

describe("TrustPage", () => {
  it("renders policy content without official links when the page has no links", () => {
    render(<TrustPage page={trustPageByPath["/privacy"]} />);

    expect(
      screen.getByRole("heading", { name: "How AI Taverns handles privacy." })
    ).toBeInTheDocument();
    expect(screen.getByText("Information We Use")).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Official links" }))
      .not.toBeInTheDocument();
  });

  it("renders official profile links for the contact page", () => {
    render(<TrustPage page={trustPageByPath["/contact"]} />);

    expect(screen.getByRole("heading", { name: "Contact AI Taverns." }))
      .toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Official links" }))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Product Hunt/i })).toHaveAttribute(
      "href",
      "https://www.producthunt.com/products/ai-taverns"
    );
    expect(screen.getByRole("link", { name: /X launch post/i })).toHaveAttribute(
      "href",
      "https://x.com/zachary_fiel/status/2086026794986254644"
    );
    expect(screen.getByRole("link", { name: /Substack article/i })).toHaveAttribute(
      "href",
      "https://zacurryy.substack.com/p/i-built-ai-taverns-an-ai-dungeon"
    );
    expect(screen.getByRole("link", { name: /Bluesky post/i })).toHaveAttribute(
      "href",
      "https://bsky.app/profile/did:plc:elcst66n7zw3s4eqodah42gt/post/3msozd2bn6s2a"
    );
  });
});
