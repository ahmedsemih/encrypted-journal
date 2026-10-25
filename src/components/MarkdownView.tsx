import { memo, useEffect, useState, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";
import { attachmentUrl, SCHEME } from "../attachments";
import { useI18n } from "../i18n";
import { ENTRY_SCHEME } from "../links";
import { useEntryLinks } from "./EntryLinks";

/** Lets our `attachment:` and `entry:` links through; everything else gets the safe default. */
function urlTransform(url: string): string {
  return url.startsWith(SCHEME) || url.startsWith(ENTRY_SCHEME) ? url : defaultUrlTransform(url);
}

function EntryLink({ id, children }: { id: string; children: ReactNode }) {
  const { t } = useI18n();
  const { byId, open } = useEntryLinks();
  const target = byId.get(id.toLowerCase());
  if (!target) {
    return (
      <span className="entry-link missing" title={t.links.missing}>
        {children}
      </span>
    );
  }
  return (
    <a
      href="#"
      className="entry-link"
      title={`${target.title || t.untitled} · ${target.date}`}
      onClick={(e) => {
        e.preventDefault();
        open(target.id);
      }}
    >
      {children}
    </a>
  );
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
          a: ({ href, children }) =>
            href?.startsWith(ENTRY_SCHEME) ? (
              <EntryLink id={href.slice(ENTRY_SCHEME.length)}>{children}</EntryLink>
            ) : (
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
