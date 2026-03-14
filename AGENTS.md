# Global Rules

## Prompt Normalization
- If the user's request is informal, shorthand, or a rough idea and that ambiguity could materially affect execution, first normalize it into a precise task brief before answering or acting.
- For straightforward, low-risk, well-scoped requests, normalize internally only if needed and do not add a visible rewrite by default.
- Make explicit whenever relevant: objective, target audience, context, inputs, constraints, expected deliverables, quality bar, and edge cases.
- Prefer making reasonable assumptions over blocking on questions. If assumptions materially affect the result, list them briefly.
- If the user wants task execution rather than prompt authoring, use the normalized brief internally and proceed. Only surface the brief when it will reduce a likely misunderstanding, rework, or prompt cost.

## Prompt Skills
- If the user wants a vague or plain-language requirement turned into a professional prompt, use the installed `prompt-optimizer` skill.
- If the user wants a reusable prompt/template built from scratch, use the installed `prompt-builder` skill.
- If both apply, first use `prompt-optimizer` to clarify the requirement, then `prompt-builder` to produce the final structured prompt.

## When To Show The Prompt
- Automatically switch to prompt mode when visible normalization is necessary and the task is ambiguous, multi-step, reusable, high-cost, or the user explicitly asks for a prompt/template/optimization.
- If prompt mode is triggered automatically, always show the transformed prompt before continuing so the user can see that normalization happened.
- If prompt mode is not triggered, normalize internally and answer directly.
- Do not show a transformed prompt for routine factual questions, direct edits, or clearly scoped execution requests unless a visible rewrite would materially improve correctness.

## Default Prompt Output
- Unless the user asks otherwise, return prompt-writing help in this order: `专业提示词`, `关键假设`, `可选增强`.
- Match the user's language. Default to Simplified Chinese unless the user requests another language.
- Keep prompts production-ready: include role, objective, context, inputs, workflow/steps, constraints, output format, and acceptance criteria.

## Skills
A skill is a set of local instructions to follow that is stored in a `SKILL.md` file. Below is the list of skills that can be used. Each entry includes a name, description, and file path so you can open the source for full instructions when using a specific skill.

### Available skills
- Browser Automation: Vision-driven browser automation using Midscene. Operates entirely from screenshots — no DOM or accessibility labels required. Can interact with all visible elements on screen regardless of technology stack. Opens a new browser tab for each target URL via Puppeteer (headless Chrome). Use this skill when the user wants to: - Browse, navigate, or open web pages - Scrape, extract, or collect data from websites - Fill out forms, click buttons, or interact with web elements - Verify, validate, or test frontend UI behavior - Take screenshots of web pages - Automate multi-step web workflows - Run browser automation or check website content Powered by Midscene.js ([https://midscenejs.com](https://midscenejs.com)) (file: /Users/tokk/.agents/skills/browser-automation/SKILL.md)
- auth-wechat-miniprogram: Complete guide for WeChat Mini Program authentication with CloudBase - native login, user identity, and cloud function integration. (file: /Users/tokk/.codex/skills/auth-wechat-miniprogram/SKILL.md)
- cloudbase-document-database-in-wechat-miniprogram: Use CloudBase document database WeChat MiniProgram SDK to query, create, update, and delete data. Supports complex queries, pagination, aggregation, and geolocation queries. (file: /Users/tokk/.codex/skills/cloudbase-document-database-in-wechat-miniprogram/SKILL.md)
- express-rest-api: Build production-ready RESTful APIs with Express.js including routing, middleware, validation, and error handling for scalable backend services (file: /Users/tokk/.agents/skills/express-rest-api/SKILL.md)
- find-skills: Helps users discover and install agent skills when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or express interest in extending capabilities. This skill should be used when the user is looking for functionality that might exist as an installable skill. (file: /Users/tokk/.codex/skills/find-skills/SKILL.md)
- miniprogram-development: WeChat Mini Program development rules. Use this skill when developing WeChat mini programs, integrating CloudBase capabilities, and deploying mini program projects. (file: /Users/tokk/.codex/skills/miniprogram-development/SKILL.md)
- playwright-automation-fill-in-form: Automate filling in a form using Playwright MCP (file: /Users/tokk/.agents/skills/playwright-automation-fill-in-form/SKILL.md)
- prompt-builder: Guide users through creating high-quality GitHub Copilot prompts with proper structure, tools, and best practices. (file: /Users/tokk/.codex/skills/prompt-builder/SKILL.md)
- prompt-optimizer: Transform vague prompts into precise, well-structured specifications using EARS (Easy Approach to Requirements Syntax) methodology. This skill should be used when users provide loose requirements, ambiguous feature descriptions, or need to enhance prompts for AI-generated code, products, or documents. Triggers include requests to "optimize my prompt", "improve this requirement", "make this more specific", or when raw requirements lack detail and structure. (file: /Users/tokk/.codex/skills/prompt-optimizer/SKILL.md)
- vitest: Vitest - Modern TypeScript testing framework with Vite-native performance, ESM support, and TypeScript-first design (file: /Users/tokk/.agents/skills/vitest/SKILL.md)
- skill-creator: Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Codex's capabilities with specialized knowledge, workflows, or tool integrations. (file: /Users/tokk/.codex/skills/.system/skill-creator/SKILL.md)
- skill-installer: Install Codex skills into $CODEX_HOME/skills from a curated list or a GitHub repo path. Use when a user asks to list installable skills, install a curated skill, or install a skill from another repo (including private repos). (file: /Users/tokk/.codex/skills/.system/skill-installer/SKILL.md)

### How to use skills
- Discovery: The list above is the skills available in this session (name + description + file path). Skill bodies live on disk at the listed paths.
- Trigger rules: If the user names a skill (with `$SkillName` or plain text) OR the task clearly matches a skill's description shown above, you must use that skill for that turn. Multiple mentions mean use them all. Do not carry skills across turns unless re-mentioned.
- Missing/blocked: If a named skill isn't in the list or the path can't be read, say so briefly and continue with the best fallback.
- How to use a skill (progressive disclosure):
  1) After deciding to use a skill, open its `SKILL.md`. Read only enough to follow the workflow.
  2) When `SKILL.md` references relative paths (e.g., `scripts/foo.py`), resolve them relative to the skill directory listed above first, and only consider other paths if needed.
  3) If `SKILL.md` points to extra folders such as `references/`, load only the specific files needed for the request; don't bulk-load everything.
  4) If `scripts/` exist, prefer running or patching them instead of retyping large code blocks.
  5) If `assets/` or templates exist, reuse them instead of recreating from scratch.
- Coordination and sequencing:
  - If multiple skills apply, choose the minimal set that covers the request and state the order you'll use them.
  - Announce which skill(s) you're using and why (one short line). If you skip an obvious skill, say why.
- Context hygiene:
  - Keep context small: summarize long sections instead of pasting them; only load extra files when needed.
  - Avoid deep reference-chasing: prefer opening only files directly linked from `SKILL.md` unless you're blocked.
  - When variants exist (frameworks, providers, domains), pick only the relevant reference file(s) and note that choice.
- Safety and fallback: If a skill can't be applied cleanly (missing files, unclear instructions), state the issue, pick the next-best approach, and continue.
