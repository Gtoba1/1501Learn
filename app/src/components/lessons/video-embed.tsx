const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

function getYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !YOUTUBE_HOSTS.has(parsed.hostname)) return null;
    const id = parsed.hostname === "youtu.be" ? parsed.pathname.slice(1) : parsed.searchParams.get("v");
    return id && YOUTUBE_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function VideoEmbed({ url, title }: { url: string; title: string }) {
  const id = getYouTubeId(url);
  if (!id) return null;

  return (
    <div className="relative mb-6 aspect-video overflow-hidden rounded-xl border border-line bg-black">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}`}
        title={title}
        className="absolute inset-0 h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
      />
    </div>
  );
}
