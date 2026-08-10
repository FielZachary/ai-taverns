export type TrustPage = {
  path: string;
  title: string;
  description: string;
  eyebrow: string;
  h1: string;
  lede: string;
  sections: Array<{
    title: string;
    body: string;
  }>;
  links?: Array<{
    label: string;
    href: string;
    description: string;
  }>;
};

export const trustPages: TrustPage[] = [
  {
    path: "/privacy",
    title: "Privacy Policy",
    description:
      "Privacy policy for AI Taverns, including account, gameplay, analytics, and technical information used to run the app.",
    eyebrow: "Privacy Policy",
    h1: "How AI Taverns handles privacy.",
    lede:
      "AI Taverns uses account, gameplay, analytics, and technical information to operate the app, preserve adventures, improve reliability, and keep the service usable.",
    sections: [
      {
        title: "Information We Use",
        body:
          "AI Taverns may process account details, authentication information, adventure text, character details, uploaded or generated media, gameplay actions, device information, logs, and analytics events."
      },
      {
        title: "Why We Use It",
        body:
          "This information is used to sign you in, save campaigns, run AI dungeon master turns, troubleshoot errors, protect the service, understand product usage, and improve the play experience."
      },
      {
        title: "Your Choices",
        body:
          "You can choose what to share in your adventures and account activity. If you need help with privacy, account, or data questions, use the contact links on the contact page."
      }
    ]
  },
  {
    path: "/terms",
    title: "Terms of Service",
    description:
      "Terms of service for AI Taverns, a text-based AI dungeon master for D&D-style tabletop adventures.",
    eyebrow: "Terms of Service",
    h1: "Terms for playing at the tavern.",
    lede:
      "AI Taverns is an early web app for text-based D&D-style tabletop adventures. Use it for lawful, respectful play and remember that AI-generated content can be imperfect.",
    sections: [
      {
        title: "Use Of The Service",
        body:
          "You may use AI Taverns to create characters, start adventures, and play text-based tabletop RPG sessions. Do not abuse the service, attack its infrastructure, or use it to create harmful or illegal content."
      },
      {
        title: "AI-Generated Content",
        body:
          "AI dungeon master responses can be inaccurate, surprising, or inconsistent. Treat AI-generated adventure content as entertainment and review important outputs with your own judgment."
      },
      {
        title: "Tabletop Inspiration",
        body:
          "AI Taverns is inspired by tabletop fantasy role-playing games. It is not affiliated with, endorsed by, or sponsored by Wizards of the Coast or Dungeons & Dragons."
      }
    ]
  },
  {
    path: "/contact",
    title: "Contact AI Taverns",
    description:
      "Contact and official links for AI Taverns, an AI dungeon master for solo D&D-style adventures.",
    eyebrow: "Contact",
    h1: "Contact AI Taverns.",
    lede:
      "For feedback, launch discussion, and product questions, use the official Zachary Fiel posts and profiles linked here.",
    sections: [
      {
        title: "Official Site",
        body:
          "The official AI Taverns website is https://aitaverns.com. Use that URL when linking to the product so search engines can connect the brand name to the right site."
      },
      {
        title: "Feedback",
        body:
          "Feedback from tabletop players, solo RPG fans, and AI storytelling builders is especially useful while AI Taverns is early and evolving."
      }
    ],
    links: [
      {
        label: "Product Hunt",
        href: "https://www.producthunt.com/products/ai-taverns",
        description: "Product Hunt listing for AI Taverns."
      },
      {
        label: "X launch post",
        href: "https://x.com/zachary_fiel/status/2086026794986254644",
        description: "Launch post for AI Taverns on X."
      },
      {
        label: "Substack article",
        href: "https://zacurryy.substack.com/p/i-built-ai-taverns-an-ai-dungeon",
        description: "Longer writeup about building AI Taverns."
      },
      {
        label: "Bluesky post",
        href: "https://bsky.app/profile/did:plc:elcst66n7zw3s4eqodah42gt/post/3msozd2bn6s2a",
        description: "Launch post for AI Taverns on Bluesky."
      }
    ]
  }
];

export const trustPageByPath = Object.fromEntries(
  trustPages.map((page) => [page.path, page])
) as Record<string, TrustPage>;
