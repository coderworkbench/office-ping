'use client';
import Link from 'next/link';
import { Guard } from '../../components/Guard';
import { Icon, PageHeader } from '../../components/ui';

export default function AdminPage() {
  return (
    <Guard requireRole={['ADMIN']}>
      <div className="animate-fadeIn">
        <PageHeader eyebrow="Admin" title="Settings"
                    lead="Manage users, groups and templates, and review the audit log." />

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card href="/admin/users"  icon="users"  title="Users"      desc="Create, deactivate, change roles, reset passwords" />
          <Card href="/groups"       icon="group"  title="Groups"     desc="Manage groups and memberships" />
          <Card href="/templates"    icon="send"   title="Templates"  desc="Ready-made messages for quick pings" />
          <Card href="/admin/audit"  icon="shield" title="Audit log"  desc="Review security-relevant events" />
        </ul>
      </div>
    </Guard>
  );
}

// §7.2 card lift: a relative `top` offset (never a transform), shadow rises with it.
function Card({ href, title, desc, icon }: {
  href: string; title: string; desc: string; icon: any;
}) {
  return (
    <li>
      <Link href={href}
            className="relative top-0 flex h-full items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm
                       transition-all duration-150 hover:-top-0.5 hover:border-gold-fill/40 hover:shadow-lg sm:p-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-inset text-brand">
          <Icon name={icon} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-ink">{title}</div>
          <div className="text-[13px] text-ink-2">{desc}</div>
        </div>
        <span className="self-center text-ink-3" aria-hidden>›</span>
      </Link>
    </li>
  );
}
