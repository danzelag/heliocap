"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewProspectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const data = {
      company_name: form.get("company_name"),
      address: form.get("address"),
      city: form.get("city"),
      sqft: form.get("sqft") ? parseInt(form.get("sqft") as string) : null,
      year_built: form.get("year_built") ? parseInt(form.get("year_built") as string) : null,
      industry: form.get("industry") || null,
      owner_name: form.get("owner_name") || null,
      owner_title: form.get("owner_title") || null,
      owner_email: form.get("owner_email") || null,
      owner_mobile: form.get("owner_mobile") || null,
    };

    const res = await fetch("/api/prospects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      setError(err.error ?? "Failed to create prospect");
      setLoading(false);
      return;
    }

    const prospect = await res.json();
    router.push(`/admin/prospects/${prospect.id}`);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-gray-500 hover:text-gray-900 text-sm">
          ← Dashboard
        </Link>
        <span className="text-gray-300">|</span>
        <h1 className="font-semibold text-gray-900">Add Prospect</h1>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-8 space-y-6">
          <Section title="Building">
            <Field label="Company Name" name="company_name" required />
            <Field label="Street Address" name="address" required />
            <Field label="City (Ontario)" name="city" required defaultValue="Brampton" />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Building Sqft" name="sqft" type="number" />
              <Field label="Year Built" name="year_built" type="number" />
            </div>
            <Field label="Industry" name="industry" placeholder="e.g. Warehouse, Manufacturing" />
          </Section>

          <Section title="Owner Contact">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Owner Name" name="owner_name" />
              <Field label="Title" name="owner_title" placeholder="e.g. President, CEO" />
            </div>
            <Field label="Email" name="owner_email" type="email" />
            <Field label="Mobile" name="owner_mobile" type="tel" />
          </Section>

          {error && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save Prospect"}
          </button>
        </form>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
      />
    </div>
  );
}
