'use client';
import Link from 'next/link';
import { Guard } from '../../components/Guard';
import { Icon } from '../../components/ui';

export default function AdminPage() {
  return (
    <Guard requireRole={['ADMIN']}>
      <div className="space-y-6 animate-fadeIn">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="text-sm text-slate-500">
            Manage users, groups, templates, and review the audit trail.
          </p>
        </div>

        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card href="/admin/users"  icon="users"  tone="bg-brand/10 text-brand"
                title="Users"       desc="Create, deactivate, change roles" />
          <Card href="/groups"       icon="group"  tone="bg-indigo-50 text-indigo-700"
                title="Groups"      desc="Manage groups and memberships" />
          <Card href="/templates"    icon="send"   tone="bg-sky-50 text-sky-700"
                title="Templates"   desc="Reusable canned messages" />
          <Card href="/admin/audit"  icon="shield" tone="bg-amber-50 text-amber-700"
                title="Audit logs"  desc="Review security-relevant events" />
        </ul>
      </div>
    </Guard>
  );
}

function Card({ href, title, desc, icon, tone }: {
  href: string; title: string; desc: string; icon: any; tone: string;
}) {
  return (
    <li>
      <Link href={href}
            className="card p-4 flex items-start gap-3 hover:border-brand hover:shadow-pop transition">
        <span className={'h-10 w-10 rounded-lg grid place-items-center ' + tone}>
          <Icon name={icon} size={20} />
        </span>
        <div className="flex-1">
          <div className="font-medium">{title}</div>
          <div className="text-xs text-slate-500">{desc}</div>
        </div>
      </Link>
    </li>
  );
}
