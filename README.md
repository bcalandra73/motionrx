# MotionRx

MotionRx is a clinical motion analysis tool for physical therapists and sports medicine practitioners. A clinician uploads a patient video; the app tracks the patient's body with MediaPipe, identifies the most clinically meaningful frames of the movement, measures joint angles, and generates a structured clinical report using Claude.

This README is the front door for whoever is **maintaining** the project. It assumes you don't have a programming background and that you'll be making changes by talking to Claude Code rather than writing code by hand. Everything below is meant to be runnable as-is and copy-pasteable into a terminal.

---

## What you need installed

1. **Node.js**, version 20 or newer. This is the runtime the project needs to install its libraries and run locally. Download the LTS version from https://nodejs.org and install it.
2. **Claude Code**, Anthropic's command-line coding assistant. Follow the install steps at https://docs.claude.com/en/docs/claude-code/overview. This is how you'll make changes to the app.
3. **An Anthropic API key.** You need one to use Claude Code, and the app itself also uses one (entered in the UI) to generate reports. Create one at https://console.anthropic.com.
4. **A code editor** (optional but helpful). VS Code is free and common: https://code.visualstudio.com.

You can confirm Node is installed by opening a terminal and running `node --version` — you should see something like `v20.x.x` or higher.

---

## First-time setup

Open a terminal in the project folder and run:

```bash
npm install
```

This downloads all the libraries the project depends on. It can take a few minutes the first time. You only need to run it again if Claude Code tells you it has added a new dependency.

---

## Running the app

```bash
npm run dev
```

Then open http://localhost:5173 in your browser. The app reloads automatically whenever a file is changed, so you can leave this running while you work. Press `Ctrl+C` in the terminal to stop it.

To use the app: fill in patient details, upload a video, paste your Anthropic API key into the field at the bottom, and click **Generate Clinical Report**.

---

## Working with Claude Code on this project

The project is pre-configured for Claude Code. A file called `CLAUDE.md` in the project root gives Claude full context about the codebase every time you start a session — you don't need to re-explain how MotionRx works each time.

### A safe workflow

For every change you want to make, follow this loop:

1. **Describe what you want in plain language.** Tell Claude the goal, not the implementation. "On the patient intake form, I want a new optional field for pain score, 0 to 10."
2. **For anything non-trivial, ask Claude to plan first.** Say *"Plan this change before making it."* Claude will outline what it intends to do. Read the plan. If something looks wrong or unclear, push back before any code is written. This catches the majority of mistakes for free.
3. **Ask Claude to work on a branch.** Say *"Make this change on a new branch."* This keeps the working version of the app safe and lets you compare before/after. You don't need to know what a branch is — Claude handles the git commands.
4. **Test the change.** Run `npm run dev` and try the new behaviour in your browser. Run `npm test` to make sure nothing else broke. For pipeline changes, also run `npm run pipeline -- --test <case>` against a real test case in `test_data/` to verify end-to-end behaviour.
5. **If it works, merge it.** Say *"Merge this branch into main."* If it doesn't, say *"This isn't working — \[describe what you're seeing\]. Can you fix it, or undo the change?"*

For trivial changes (a typo, a label tweak) you can skip the branch step. Save that ceremony for anything that touches how the app actually behaves.

### Examples of good prompts

Specific, goal-oriented prompts get good results:

- *"On the patient details form, add an optional field called 'Pain Score' with a number input from 0 to 10. Save it with the rest of the patient metadata and include it in the report prompt to Claude."*
- *"Reports sometimes truncate the recommendations section partway through. Investigate why and fix it. Walk me through what you find before changing anything."*
- *"Add support for a new movement type called 'Walking'. Use the same Zeni-method analyzer we use for Running, but adjust phase definitions for walking gait. Plan it out first."*

Vague prompts force Claude to guess at what you want:

- ~~"Make the form better."~~
- ~~"Fix the report."~~
- ~~"Add walking support."~~

If you find yourself writing a one-line prompt, ask yourself: would another physical therapist who's never seen this app understand exactly what behaviour you want from those words? If not, add detail.

### When something breaks

You don't need to debug anything yourself. Hand the problem to Claude:

- **App won't start, or you see a red error in the terminal:** copy the entire error and paste it to Claude. Say *"This is what I'm seeing — what happened and how do we fix it?"*
- **A change Claude made isn't working right:** *"The new pain score field isn't saving. Can you investigate?"*
- **You want to undo Claude's last change:** *"Undo your last change."* Or, more carefully: *"Show me your last few commits and their messages, then revert the most recent one."*
- **You're lost or the project feels broken:** *"Show me the last 10 commits with their messages and explain each one in plain language. I want to find a known-good point I can roll back to."* Nothing committed to git is ever truly lost.

If you don't know how to phrase something, ask Claude: *"How would I describe the change I want here?"* — that's a valid prompt too.

### Keeping the documentation healthy

A few files keep Claude oriented across sessions:

- **`CLAUDE.md`** — technical context Claude reads at the start of every session. Written in code-speak. You don't need to read it, but you can ask Claude *"Read CLAUDE.md and tell me in plain English what it says about X"* any time.
- **`docs/`** — deeper technical references (architecture, the running gait analyzer, the test-data format). Claude reads these when relevant.
- **`CHANGELOG.md`** — a running log of every session's changes. Claude adds an entry at the end of each session automatically.

If Claude does something that turns out to be a recurring pattern you want it to follow forever, say *"Add a note about this to CLAUDE.md so future sessions remember."*

---

## Glossary

Terms you'll hear Claude use, in plain language:

- **API key** — a long password-like string that authorizes the app (or Claude Code) to use Anthropic's services. Keep it private; never paste it into a public chat, a GitHub issue, or a screenshot. If you ever leak one, rotate it at https://console.anthropic.com.
- **Branch** — a separate, parallel copy of the project. Lets you make changes in a sandbox before deciding to keep them.
- **Build** — bundling the code into a form ready to be deployed. `npm run build` does this.
- **Commit** — a saved snapshot of the project at one point in time. Git keeps a full history.
- **Dependency** — a library the project uses but didn't write itself. Listed in `package.json`.
- **Dev server** — the local copy of the app running on your machine while you work. `npm run dev` starts it.
- **Git** — the version control system that tracks every change to the project.
- **Main** — the primary branch, generally the working version of the app.
- **Merge** — combining changes from a branch back into main.
- **MediaPipe** — Google's open-source body-tracking library. It's what gives the app the joint positions on every video frame.
- **npm** — the tool that installs and manages dependencies.
- **Pipeline** — the sequence the app runs every video through: extract frames → detect pose → pick key phases → measure angles → generate report.
- **Pull request / PR** — a proposed merge that can be reviewed before it's accepted. Not strictly required for this project but Claude may use the term.
- **Type-check** — verifying that the code is internally consistent before running it. `npx tsc --noEmit` does this.

---

## Where to go for more

- **Technical context for Claude:** `CLAUDE.md` in the project root.
- **Deeper technical references:** `docs/` (architecture, running gait analyzer, test data format).
- **Claude Code documentation:** https://docs.claude.com/en/docs/claude-code
- **Anthropic API console** (to manage keys and check usage): https://console.anthropic.com
- **MediaPipe Pose Landmarker docs** (the body-tracking library): https://developers.google.com/mediapipe/solutions/vision/pose_landmarker
