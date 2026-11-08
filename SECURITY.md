# Security policy

Office Ping stores sign-in credentials, presence, pings and private chat
messages for everyone in an office, so we take reports seriously.

## Supported versions

Only the latest release on the `main` branch receives security fixes.

| Version | Supported |
|---------|-----------|
| Latest `main` / newest release | Yes |
| Older releases | No. Please upgrade. |

## Reporting a vulnerability

**Please do not open a public GitHub issue for a security problem.** Public
issues are visible to everyone before a fix exists.

Instead, use GitHub's private vulnerability reporting:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability** and fill in the form.

Please include, where you can:

- which part of the app is affected (API endpoint, WebSocket, frontend page, deployment scripts);
- steps to reproduce, or a proof of concept;
- the impact as you understand it (for example "a member can read another person's chat");
- the version or commit you tested.

## What to expect

- We aim to acknowledge a report within **7 days**.
- We will confirm the problem, work on a fix and keep you updated in the advisory thread.
- Once a fix is released we publish a security advisory and credit the reporter, unless you prefer to stay anonymous.
- We ask that you give us reasonable time to release a fix before disclosing the issue publicly.

## Scope notes

- Office Ping is designed to run on a private office network or behind a
  reverse proxy that terminates HTTPS. Reports about deployments that ignore
  the hardening steps in `docs/` (for example running with `DJANGO_DEBUG=true`
  on the public internet) are useful, but are documentation issues rather
  than vulnerabilities.
- The demo accounts created by `make seed` use a published password and are
  for local development only; this is documented and is not a vulnerability.
