import { memo, useEffect, useState } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";
import { attachmentUrl, SCHEME } from "../attachments";
import { useI18n } from "../i18n";

/** Lets our `attachment:` links through; everything else gets the safe default. */
function urlTransform(url: string): string {
  return url.startsWith(SCHEME) ? url : defaultUrlTransform(url);
}

function AttachmentImage({ id, alt }: { id: string; alt: string }) {
  const { t } = useI18n();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    attachmentUrl(id).then(
      (url) => !cancelled && setSrc(url),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (failed) return <span className="image-missing">🖼 {t.editor.imageMissing}</span>;
  if (!src) return <span className="image-loading" />;
  return <img src={src} alt={alt} title={alt || undefined} />;
}

/** Renders Markdown safely (raw HTML is not rendered). Links open in the system browser. */
export const MarkdownView = memo(function MarkdownView({ source }: { source: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={urlTransform}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              title={href}
              onClick={(e) => {
                e.preventDefault();
                if (href && /^(https?:|mailto:)/i.test(href)) void openUrl(href);
              }}
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) =>
            typeof src === "string" && src.startsWith(SCHEME) ? (
              <AttachmentImage id={src.slice(SCHEME.length)} alt={alt ?? ""} />
            ) : (
              <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} />
            ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
});
