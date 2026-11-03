# Dependency security update

This update addresses the supplied server audit (14 findings, including one critical) and client audit (20 findings). Both complete lockfiles, including development dependencies, are checked with `npm audit` in CI. Audit results describe the advisory database at the time of the run; they are not a guarantee against future vulnerabilities.

| Area | Change and compatibility check |
| --- | --- |
| Express/IP handling, Axios and shared dependencies | Resolve patched compatible dependency versions, including proxy-addr, qs, ws, js-yaml, PostCSS, Browserslist and source-map-js. No blanket force-fix or ignored advisories. |
| Puppeteer | Upgrade 19 to 25.15.0. Use the current download-skip environment setting and supported headless option. Convert PDF bytes to a Buffer before Express sends a binary PDF. Test the real manual PDF endpoint and the production container's offline Chromium rendering. |
| Mail and multipart uploads | Use Nodemailer 10.1.7 and Multer 2.4.0. Test invitation rendering with an offline mail transport, normal uploads, file count/size limits and malformed multipart fields. |
| DOCX recruitment files | Replace Mammoth's text-only usage with JSZip and the maintained xmldom parser. Read Word text parts in memory, preserving paragraphs, tables, Unicode and notes. Keep the existing worker heap, timeout and expanded ZIP limits. Reject DTD/entities and malformed XML; never follow relationships or extract archive paths to disk. The vulnerable argparse/sprintf CLI chain is removed rather than downgrading Mammoth. |
| Vite | Use patched Vite 6.4.4 with compatible React plugin 4.7.0. Remove the unused basic-ssl plugin. Keep React 18 and the existing SPA architecture. |
| Tailwind | Upgrade to 4.3.3 with its PostCSS integration and explicit existing JavaScript config. Preserve the existing brand palette, font stacks and legacy utility defaults. Typography's selector parser is overridden to a patched compatible 7.x release; the existing typography plugin API remains in use. |
| Routing | Upgrade React Router DOM to 7.18.4 and remove the now-enabled v6 future flags. Check deep links, login redirects, role/capability gates, dialogs and both portals through the browser suite. |

## Existing local installation

Use Node.js 24. From the existing repository folder:

```bash
git pull --ff-only origin main
npm ci --prefix server
npm ci --prefix hrm-client
```

Restart the backend and frontend in separate terminals. This dependency update requires no additional SQL migration. Migration 012 from the earlier integrity update is still required if not already applied.

For local PDF export, the supported browser must be available. If npm blocks Puppeteer's installation script, explicitly install its matching Chrome build once:

```bash
npm run setup:browser --prefix server
```

Alternatively configure `PUPPETEER_EXECUTABLE_PATH` to an installed Chrome/Chromium executable. Docker includes Chromium and skips browser downloads with `PUPPETEER_SKIP_DOWNLOAD=true`.

The updated Tailwind build targets modern browsers. Use a browser within Tailwind 4's supported range; older browsers require separate compatibility work.

## Verification

- Complete server and client npm audits, with moderate-or-higher findings failing CI.
- Source checks, backend/database/API tests, payroll checks and production frontend build.
- Real browser checks for desktop/mobile, English/Myanmar, light/dark themes and permissions.
- DOCX extraction security and fidelity, local email rendering and multipart parser regressions.
- Real binary manual PDF response and production Docker build with offline Chromium.

Tests use isolated data and mocked external services. No production database, SMTP delivery, Telegram send or real model call is required.

Primary migration references: [Puppeteer](https://pptr.dev/), [Tailwind upgrade guide](https://tailwindcss.com/docs/upgrade-guide), [React Router upgrade guide](https://reactrouter.com/).
