"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inr } from "@/lib/format";

export type Staff = {
  id: number;
  name: string;
  username: string;
  role: "EMPLOYEE" | "ADMIN";
  payType: "MONTHLY" | "PER_SHIFT";
  shiftRate: number;
  monthlySalary: number;
  extraPay: number;
  phone: string | null;
  active: boolean;
};

type FormState = {
  name: string;
  username: string;
  password: string;
  role: "EMPLOYEE" | "ADMIN";
  payType: "MONTHLY" | "PER_SHIFT";
  shiftRate: string;
  monthlySalary: string;
  extraPay: string;
  phone: string;
};

const blank: FormState = {
  name: "",
  username: "",
  password: "",
  role: "EMPLOYEE",
  payType: "PER_SHIFT",
  shiftRate: "",
  monthlySalary: "",
  extraPay: "",
  phone: "",
};

export default function StaffManager({ initialStaff }: { initialStaff: Staff[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function startAdd() {
    setForm(blank);
    setEditing("new");
    setError(null);
  }
  function startEdit(s: Staff) {
    setForm({
      name: s.name,
      username: s.username,
      password: "",
      role: s.role,
      payType: s.payType,
      shiftRate: String(s.shiftRate || ""),
      monthlySalary: String(s.monthlySalary || ""),
      extraPay: String(s.extraPay || ""),
      phone: s.phone ?? "",
    });
    setEditing(s.id);
    setError(null);
  }
  function cancel() {
    setEditing(null);
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const isNew = editing === "new";
    const payload: Record<string, unknown> = {
      name: form.name,
      username: form.username,
      role: form.role,
      payType: form.payType,
      shiftRate: form.shiftRate || 0,
      monthlySalary: form.monthlySalary || 0,
      extraPay: form.extraPay || 0,
      phone: form.phone,
    };
    if (form.password) payload.password = form.password;
    if (isNew && !form.password) {
      setError("Password is required for a new staff member");
      setSaving(false);
      return;
    }
    try {
      const res = await fetch(isNew ? "/api/staff" : `/api/staff/${editing}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save");
        return;
      }
      setEditing(null);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(s: Staff) {
    if (s.active && !confirm(`Deactivate ${s.name}? Their past records are kept.`)) return;
    const res = await fetch(`/api/staff/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !s.active }),
    });
    if (res.ok) router.refresh();
    else {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? "Could not update");
    }
  }

  return (
    <>
      {editing === null && (
        <button
          onClick={startAdd}
          className="rounded-lg bg-accent px-4 py-2 font-semibold text-white hover:bg-accent-strong"
        >
          + Add staff
        </button>
      )}

      {editing !== null && (
        <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            {editing === "new" ? "Add staff" : "Edit staff"}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inp} />
            </Field>
            <Field label="Username">
              <input
                value={form.username}
                onChange={(e) => set("username", e.target.value)}
                autoCapitalize="none"
                className={inp}
              />
            </Field>
            <Field label={editing === "new" ? "Password" : "New password (blank = keep)"}>
              <input
                type="text"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                className={inp}
                placeholder={editing === "new" ? "" : "leave blank to keep"}
              />
            </Field>
            <Field label="Phone (optional)">
              <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inp} />
            </Field>
            <Field label="Role">
              <select value={form.role} onChange={(e) => set("role", e.target.value)} className={inp}>
                <option value="EMPLOYEE">Employee</option>
                <option value="ADMIN">Admin</option>
              </select>
            </Field>
            <Field label="Pay type">
              <select value={form.payType} onChange={(e) => set("payType", e.target.value)} className={inp}>
                <option value="PER_SHIFT">Per shift</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </Field>
            {form.payType === "PER_SHIFT" ? (
              <Field label="Wage per shift (₹)">
                <input
                  type="number"
                  value={form.shiftRate}
                  onChange={(e) => set("shiftRate", e.target.value)}
                  className={inp}
                  placeholder="0"
                />
              </Field>
            ) : (
              <Field label="Monthly salary (₹)">
                <input
                  type="number"
                  value={form.monthlySalary}
                  onChange={(e) => set("monthlySalary", e.target.value)}
                  className={inp}
                  placeholder="0"
                />
              </Field>
            )}
            <Field label="Extra fixed pay / month (₹)">
              <input
                type="number"
                value={form.extraPay}
                onChange={(e) => set("extraPay", e.target.value)}
                className={inp}
                placeholder="0"
              />
            </Field>
          </div>
          {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-accent px-4 py-2 font-semibold text-white hover:bg-accent-strong disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={cancel}
              className="rounded-lg border border-border px-4 py-2 font-medium text-foreground hover:bg-surface-2"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      <section className="rounded-xl bg-surface p-4 shadow-soft ring-1 ring-border">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Staff
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-2 py-1.5 font-medium">Name</th>
                <th className="px-2 py-1.5 font-medium">Username</th>
                <th className="px-2 py-1.5 font-medium">Role</th>
                <th className="px-2 py-1.5 font-medium">Pay</th>
                <th className="px-2 py-1.5 font-medium">Status</th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {initialStaff.map((s) => (
                <tr
                  key={s.id}
                  className={"border-t border-border " + (s.active ? "" : "opacity-50")}
                >
                  <td className="px-2 py-1.5 font-medium text-foreground">{s.name}</td>
                  <td className="px-2 py-1.5 text-muted">{s.username}</td>
                  <td className="px-2 py-1.5">{s.role === "ADMIN" ? "Admin" : "Employee"}</td>
                  <td className="px-2 py-1.5 text-muted">
                    {s.payType === "PER_SHIFT"
                      ? `${inr(s.shiftRate)}/shift`
                      : `${inr(s.monthlySalary)}/mo`}
                    {s.extraPay > 0 && (
                      <span className="text-xs text-faint">
                        {" "}
                        +{inr(s.extraPay)} extra
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {s.active ? (
                      <span className="text-emerald-600 dark:text-emerald-400">Active</span>
                    ) : (
                      <span className="text-faint">Inactive</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      onClick={() => startEdit(s)}
                      className="mr-3 font-medium text-accent hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleActive(s)}
                      className="font-medium text-muted hover:underline"
                    >
                      {s.active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

const inp =
  "w-full rounded-lg border border-border px-3 py-2 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
