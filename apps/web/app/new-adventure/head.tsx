const criticalNewAdventureImagePreloads = [
  "/new-adventure/flow-bg.png",
  "/new-adventure/singleplayer-banner.webp",
  "/new-adventure/multiplayer-banner.webp",
  "/new-adventure/eldermere-banner.jpg",
  "/new-adventure/custom-world-banner.jpg"
];

export default function Head() {
  return (
    <>
      {criticalNewAdventureImagePreloads.map((href) => (
        <link as="image" href={href} key={href} rel="preload" />
      ))}
      <link
        as="video"
        href="/new-adventure/closing-animation-fast.mp4"
        rel="preload"
        type="video/mp4"
      />
    </>
  );
}
