# CLAUDE.md — HTML → React + Vite + TypeScript Refactor

## Project Context

This project is being migrated from a single monolithic `index.html` file (with all CSS, JS logic,
API calls, and state management inlined) into a standard **React + Vite + TypeScript** project.

The original `index.html` is the source of truth. Do not delete it until the migration is complete
and verified working.

---

## Migration Goals

1. Scaffold a clean Vite + React + TypeScript project alongside the existing file
2. Extract inline styles → component-scoped CSS modules (or a chosen styling solution)
3. Extract inline JS logic → typed React components and custom hooks
4. Extract API calls → a dedicated service/api layer
5. Extract state management → `useState` / `useReducer` hooks (or a state library if complex)
6. Ensure the running app is functionally identical to the original HTML file

---

## Scaffold Instructions

When initializing the project, run:

```bash
npm create vite@latest . -- --template react-ts
npm install
```

If the project root already has files, scaffold into a temp folder and merge manually:

```bash
npm create vite@latest _vite_temp -- --template react-ts
```

### Required dependencies

Install these after scaffolding. Adjust versions as appropriate:

```bash
npm install
# Add any packages already used by the original HTML (CDN scripts → npm equivalents)
```

---

## Target Directory Structure

```
/
├── public/                  # Static assets (favicon, fonts, etc.)
├── src/
│   ├── api/                 # All external API calls
│   │   └── index.ts         # Typed fetch wrappers, one function per endpoint
│   ├── components/          # Reusable UI components
│   │   └── ExampleWidget/
│   │       ├── ExampleWidget.tsx
│   │       └── ExampleWidget.module.css
│   ├── hooks/               # Custom React hooks (extracted logic)
│   │   └── useExampleHook.ts
│   ├── types/               # Shared TypeScript interfaces and types
│   │   └── index.ts
│   ├── App.tsx              # Root component — mirrors original HTML structure
│   ├── App.module.css       # Root-level styles
│   └── main.tsx             # Vite entry point
├── index.html               # Original source file (keep until migration verified)
├── vite.config.ts
├── tsconfig.json
└── CLAUDE.md
```

---

## Migration Steps (follow in order)

### Step 1 — Audit the original `index.html`

Before writing any React code, read the original file carefully and produce a written inventory:

- List every **visual section** of the UI (header, sidebar, cards, modals, etc.)
- List every **`<script>` block** and what each one does
- List every **`<style>` block** and which elements it targets
- List every **`fetch()` or `XMLHttpRequest`** call: URL, method, request shape, response shape
- List every **piece of state** (variables that change over time and affect the UI)
- List every **CDN dependency** (`<script src="...">`) — find the npm equivalent

Do not start Step 2 until this inventory is complete.

---

### Step 2 — Define types first (`src/types/index.ts`)

For every API response shape and major data structure identified in Step 1, write a TypeScript
interface before writing any component code. Example:

```typescript
export interface User {
  id: string;
  name: string;
  email: string;
}

export interface ApiResponse<T> {
  data: T;
  error: string | null;
}
```

---

### Step 3 — Extract API calls (`src/api/index.ts`)

Move every `fetch()` from the original HTML into typed async functions here. Follow this pattern:

```typescript
import type { User } from '../types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export async function getUser(id: string): Promise<User> {
  const res = await fetch(`${BASE_URL}/users/${id}`);
  if (!res.ok) throw new Error(`getUser failed: ${res.status}`);
  return res.json();
}
```

- One function per endpoint
- All functions must be typed (no `any`)
- Use `import.meta.env.VITE_*` for base URLs and API keys — never hardcode them
- Create a `.env.local` file with placeholder values and document each variable here

---

### Step 4 — Extract state into custom hooks (`src/hooks/`)

For each piece of stateful logic identified in Step 1, create a custom hook. Follow this pattern:

```typescript
// src/hooks/useUser.ts
import { useState, useEffect } from 'react';
import { getUser } from '../api';
import type { User } from '../types';

export function useUser(id: string) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getUser(id)
      .then(setUser)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  return { user, loading, error };
}
```

---

### Step 5 — Build components bottom-up (`src/components/`)

Start with the smallest leaf elements and work up to the page layout. Rules:

- Each component lives in its own folder with a matching `.module.css` file
- Props must be fully typed — no `any`, no untyped objects
- Copy CSS from the original `<style>` blocks directly into `.module.css` files; rename classes to
  camelCase as needed
- Do not refactor logic while also migrating — migrate first, refactor later

Component naming convention: `PascalCase` for both the folder and the `.tsx` file.

---

### Step 6 — Assemble `App.tsx`

Reconstruct the top-level layout using the components from Step 5 and hooks from Step 4. The
visual output of `App.tsx` should be a pixel-faithful match to the original `index.html`.

---

### Step 7 — Verify

Run the dev server and do a side-by-side comparison with the original file:

```bash
npm run dev
```

Check every user interaction from the original file:
- [ ] All UI sections render correctly
- [ ] All API calls fire and data displays correctly
- [ ] All stateful interactions work (clicks, inputs, toggles)
- [ ] No TypeScript errors (`npx tsc --noEmit`)
- [ ] No console errors

Only after all checks pass should the original `index.html` be archived or deleted.

---

## Coding Conventions

- **No `any` types.** If a type is unknown, use `unknown` and narrow it explicitly.
- **No inline styles** in `.tsx` files. All styles go in `.module.css` files.
- **Prefer named exports** over default exports for components (exception: route-level pages).
- **Env vars** must be prefixed with `VITE_` and documented in this file under "Environment Variables".
- **Error boundaries**: wrap major sections in a React `ErrorBoundary` component.
- Keep components under ~150 lines. If longer, split into sub-components.

---

## Environment Variables

Document every env var here as it's added:

| Variable | Description | Example |
|---|---|---|
| `VITE_API_BASE_URL` | Base URL for all API requests | `https://api.example.com` |

Create `.env.local` (gitignored) for real values. Create `.env.example` (committed) with
placeholder values.

---

## What NOT to Do

- Do not refactor or improve the logic while migrating — migrate first, improve in a follow-up PR
- Do not use `any` as a temporary shortcut — define the type, even if approximate
- Do not inline API base URLs or secrets
- Do not skip the Step 1 audit — components built without it will miss edge cases
- Do not delete `index.html` until Step 7 verification is complete
