"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DocFolderView } from "@/lib/documents";

type Folder = DocFolderView & { count: number };

/**
 * The physical folders the index files documents into. The code is whatever is
 * written on the spine, so "12" and "A-3" both work. A folder that still holds
 * documents can't be deleted — they'd lose their place.
 */
export default function FolderManager({ folders }: { folders: Folder[] }) {
  const router = useRouter();
  const empty = { code: "", name: "", location: "" };
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(editId ? `/api/doc-folders/${editId}` : "/api/doc-folders", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, location: form.location.trim() || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error ?? "Could not save");
        return;
      }
      setForm(empty);
      setEditId(null);
      router.refresh();
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(f: Folder) {
    if (!confirm(`Delete folder ${f.code} — ${f.name}?`)) return;
    setErr(null);
    const res = await fetch(`/api/doc-folders/${f.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (res.ok) router.refresh();
    else setErr(d.error ?? "Could not delete");
  }

  const input = "rounded-lg border border-border bg-surface px-3 py-1.5 text-sm";

  return (
    <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Folders</h2>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-foreground">Number / label</span>
          <input
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            placeholder="12"
            className={`${input} w-24`}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-foreground">Name</span>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Licences"
            className={input}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-foreground">
            Where it is <span className="font-normal text-muted">(optional)</span>
          </span>
          <input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="Office cabinet, shelf 2"
            className={input}
          />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={busy || !form.code.trim() || !form.name.trim()}
          className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
        >
          {busy ? "Saving…" : editId ? "Save folder" : "Add folder"}
        </button>
        {editId && (
          <button
            type="button"
            onClick={() => {
              setEditId(null);
              setForm(empty);
            }}
            className="text-sm font-medium text-muted hover:underline"
          >
            Cancel
          </button>
        )}
      </div>
      {err && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p>}

      {folders.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-2 py-1.5 font-medium">Folder</th>
                <th className="px-2 py-1.5 font-medium">Name</th>
                <th className="px-2 py-1.5 font-medium">Where</th>
                <th className="px-2 py-1.5 text-right font-medium">Documents</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {folders.map((f) => (
                <tr key={f.id} className="border-t border-border">
                  <td className="px-2 py-1.5 font-semibold text-foreground">{f.code}</td>
                  <td className="px-2 py-1.5">{f.name}</td>
                  <td className="px-2 py-1.5 text-muted">{f.location || "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted">{f.count}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setEditId(f.id);
                        setForm({ code: f.code, name: f.name, location: f.location ?? "" });
                        setErr(null);
                      }}
                      className="mr-3 font-medium text-muted hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(f)}
                      disabled={f.count > 0}
                      title={f.count > 0 ? "Move its documents to another folder first" : undefined}
                      className="font-medium text-muted hover:text-red-600 hover:underline disabled:cursor-not-allowed disabled:text-faint disabled:no-underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
