const criticalNewAdventureImagePreloads = [
  "/new-adventure/flow-bg.webp",
  "/new-adventure/singleplayer-banner.webp",
  "/new-adventure/multiplayer-banner.webp",
  "/new-adventure/eldermere-banner.webp",
  "/new-adventure/custom-world-banner.webp"
];

export default function Head() {
  return (
    <>
      {criticalNewAdventureImagePreloads.map((href) => (
        <link as="image" href={href} key={href} rel="preload" />
      ))}
    </>
  );
}
