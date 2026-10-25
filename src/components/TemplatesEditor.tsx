import { useState } from "react";
import { useI18n } from "../i18n";
import { newTemplateId, templatesOf } from "../templates";
import type { Settings, Template } from "../types";

interface Props {
  settings: Settings;
  onChange: (s: Settings) => Promise<void> | void;
}

const SAVE_DELAY_MS = 500;

/** Settings tab for creating and editing entry templates. */
export function TemplatesEditor({ settings, onChange }: Props) {
  const { t } = useI18n();
  const [templates, setTemplates] = useState<Template[]>(() => templatesOf(settings, t));
  const [openId, setOpenId] = useState<string | null>(null);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Editing materializes the (possibly built-in) list into settings.
  const persist = (next: Template[], defaultTemplateId = settings.defaultTemplateId, immediate = false) => {
    setTemplates(next);
    if (timer) clearTimeout(timer);
    const save = () => onChange({ ...settings, templates: next, defaultTemplateId });
    if (immediate) void save();
    else setTimer(setTimeout(save, SAVE_DELAY_MS));
  };

  const edit = (id: string, patch: Partial<Template>) =>
    persist(templates.map((tpl) => (tpl.id === id ? { ...tpl, ...patch } : tpl)));

  const add = () => {
    const tpl: Template = { id: newTemplateId(), name: t.templates.newName, title: "{{date}}", body: "", tags: [] };
    persist([...templates, tpl], settings.defaultTemplateId, true);
    setOpenId(tpl.id);
  };

  const remove = (id: string) =>
    persist(
      templates.filter((tpl) => tpl.id !== id),
      settings.defaultTemplateId === id ? null : settings.defaultTemplateId,
      true,
    );

  const setDefault = (id: string | null) => persist(templates, id, true);

  return (
    <div className="templates-editor">
      <p className="muted small">{t.templates.defaultInfo}</p>
      <label className="template-row default-blank">
        <input type="radio" name="default-template" checked={settings.defaultTemplateId === null} onChange={() => setDefault(null)} />
        <span>{t.templates.blank}</span>
      </label>
      {templates.map((tpl) => (
        <div key={tpl.id} className={`template-item ${openId === tpl.id ? "open" : ""}`}>
          <div className="template-row">
            <input
              type="radio"
              name="default-template"
              title={t.templates.makeDefault}
              checked={settings.defaultTemplateId === tpl.id}
              onChange={() => setDefault(tpl.id)}
            />
            <button className="template-name" onClick={() => setOpenId(openId === tpl.id ? null : tpl.id)}>
              {tpl.name || t.untitled}
              {settings.defaultTemplateId === tpl.id && <span className="badge">{t.templates.isDefault}</span>}
            </button>
            <span className="muted">{openId === tpl.id ? "▾" : "▸"}</span>
          </div>
          {openId === tpl.id && (
            <div className="template-form">
              <label className="field">
                <span>{t.templates.name}</span>
                <input value={tpl.name} onChange={(e) => edit(tpl.id, { name: e.target.value })} />
              </label>
              <label className="field">
                <span>{t.templates.entryTitle}</span>
                <input value={tpl.title} onChange={(e) => edit(tpl.id, { title: e.target.value })} />
              </label>
              <label className="field">
                <span>{t.templates.tags}</span>
                <input
                  defaultValue={tpl.tags.join(", ")}
                  onChange={(e) =>
                    edit(tpl.id, {
                      tags: e.target.value
                        .split(",")
                        .map((s) => s.trim().replace(/^#/, ""))
                        .filter(Boolean),
                    })
                  }
                />
              </label>
              <label className="field">
                <span>{t.templates.body}</span>
                <textarea rows={8} className="mono" value={tpl.body} onChange={(e) => edit(tpl.id, { body: e.target.value })} />
              </label>
              <p className="muted small">{t.templates.help}</p>
              <button className="danger small-btn" onClick={() => remove(tpl.id)}>
                {t.templates.remove}
              </button>
            </div>
          )}
        </div>
      ))}
      <button className="add-template" onClick={add}>
        {t.templates.add}
      </button>
    </div>
  );
}
