export function OfficialPreview({ url, title, className = '' }: { url: string | null; title: string; className?: string }) {
  if (!url) return <div className={`preview placeholder ${className}`}><span>暂无官方预览</span></div>;
  if (/\.mp4(\?|$)/i.test(url)) return <video className={`preview ${className}`} src={url} controls muted playsInline aria-label={title} />;
  return <img className={`preview ${className}`} src={url} alt={title} loading="lazy" />;
}
