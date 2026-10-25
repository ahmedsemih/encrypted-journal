import { useId, useState } from "react";
import { useI18n } from "../i18n";

interface Props {
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
}

export function TagInput({ tags, suggestions, onChange }: Props) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const listId = useId();

  const add = (raw: string) => {
    const tag = raw.trim().replace(/^#/, "");
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) onChange([...tags, tag]);
    setValue("");
  };

  return (
    <div className="tag-input">
      {tags.map((tag) => (
        <span key={tag} className="tag">
          #{tag}
          <button type="button" aria-label={t.editor.removeTag(tag)} onClick={() => onChange(tags.filter((x) => x !== tag))}>
            ×
          </button>
        </span>
      ))}
      <input
        list={listId}
        value={value}
        placeholder={tags.length ? "" : t.editor.addTag}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(",")) add(v.slice(0, -1));
          else setValue(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(value);
          } else if (e.key === "Backspace" && !value && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => value && add(value)}
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !tags.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}
