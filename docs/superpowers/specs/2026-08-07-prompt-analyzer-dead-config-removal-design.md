# Prompt Analyzer Dead Config Removal Design

## Goal

Remove the unused Prompt Analyzer slice-level `config`, `setConfig`, and `setModel` API so runtime provider and model selection has one source of truth.

## Runtime behavior

`analyzePrompt` resolves the provider from explicit options, then persisted Prompt Analyzer settings, then the default provider. It resolves the model from explicit options, then the selected provider's settings, then the legacy OpenRouter model fallback. OpenRouter retains its reliable default model; other providers without a model retain the existing validation error.

No slice-level runtime config participates in resolution.

## Code changes

- Remove `config` from initial slice state and `PromptAnalyzerSlice`.
- Remove `setConfig` and `setModel` from the slice implementation and type.
- Remove the configuration validators, error constant, and imports used only by those setters.
- Remove obsolete setter/config state tests.
- Update the Prompt Analyzer panel test fixture to the provider-scoped settings shape.
- Keep shared provider request configuration types that are used outside the store slice.

## TDD and verification

First add a focused store regression test that injects a stale runtime `config` property and expects settings/options to remain authoritative. Confirm it fails because the current implementation reads `config`, then make the minimal production and test cleanup needed for it to pass.

Run the focused Prompt Analyzer store test, `typecheck:web`, `git diff --check`, and scoped searches proving the removed slice API has no remaining references. Commit the implementation, then merge the worktree branch into `feature/prompt-analyzer` from its owning worktree and repeat focused verification on the merged result.
