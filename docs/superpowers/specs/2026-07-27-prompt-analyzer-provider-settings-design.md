# Prompt Analyzer Provider Settings Design

## Goal

Make the Prompt Analyzer settings UI and runtime consistently support OpenRouter, OpenAI, Anthropic, and Google AI. Each provider must retain its own model, temperature, maximum-token value, and secure API-key status, while one persisted provider determines which configuration analysis uses.

## Settings contract

`GlobalSettings` will persist:

- `promptAnalyzerProvider?: SupportedProvider`
- `promptAnalyzerProviders?: Partial<Record<SupportedProvider, PromptAnalyzerProviderSettings>>`

`PromptAnalyzerProviderSettings` contains:

- `model?: string`
- `temperature?: number`
- `maxTokens?: number`
- `apiKeyConfigured?: boolean`

The secure API keys remain in main-process credential storage and never enter renderer settings. The configured flags are status metadata only.

Existing `promptAnalyzerModel`, `promptAnalyzerTemperature`, `promptAnalyzerMaxTokens`, and `promptAnalyzerApiKeyConfigured` values migrate to the OpenRouter entry when no provider-indexed OpenRouter value exists. Reads retain a compatibility fallback during migration. New writes use only the provider-indexed contract.

## UI behavior

The selected provider is controlled by `settings.promptAnalyzerProvider`, defaulting to `openrouter`. Selecting a tab persists the provider immediately.

Each tab displays its provider-specific:

- API-key input and key status
- Model value and placeholder
- Temperature slider
- Maximum-token input

API-key drafts and pending operations remain local UI state. Status responses are versioned per provider so a save or clear for one provider cannot invalidate another provider's request.

Maximum tokens are constrained to integers from 1 through 32768. Temperature is constrained from 0 through 2 with a step of 0.1. The UI uses shared constants from `src/shared/prompt-analyzer-types.ts` rather than repeating numeric limits.

The provider selector uses the existing shadcn `Tabs`, `TabsList`, `TabsTrigger`, and `TabsContent` primitives. This supplies tab-list semantics, keyboard navigation, focus-visible treatment, and active styling. The temperature slider thumb receives an accessible name associated with its visible label.

## Runtime behavior

When no explicit `AnalyzeOptions` override or transient analyzer config is supplied, `analyzePrompt` reads the persisted selected provider and that provider's model, temperature, and maximum-token value. Explicit options retain highest precedence, followed by transient config, selected-provider settings, and defaults.

The configured-key gate checks the selected provider's flag. Saving or clearing one key updates only that provider's flag. Clearing a provider does not disable another configured provider.

Main-process analysis continues to select the credential by `args.provider`. No plaintext credential is persisted or exposed to the renderer.

## Copy and search

Provider labels and model placeholders remain exhaustive `Record<SupportedProvider, string>` mappings. All visible copy uses the localization system with English fallbacks. Search keywords include OpenRouter, OpenAI, Anthropic, Google AI, temperature, and max tokens.

## Validation and error handling

Invalid persisted numeric values are normalized to their documented ranges before display and use. An empty maximum-token field may remain an editable draft, but it is not persisted until it parses as a valid integer. Provider switching retains each provider's unfinished API-key draft.

Credential status errors do not expose secret text. A failed status read leaves the last known status unchanged. Save and clear controls remain disabled only for the provider with an operation in flight.

## Testing

Tests will cover:

- Provider tabs, semantics, keyboard behavior, active state, and provider persistence
- Separate API-key drafts, configured states, save/clear routing, and cross-provider status races
- Separate provider model, temperature, and maximum-token values
- Numeric boundary handling for 0–2 temperature and 1–32768 maximum tokens
- Runtime precedence and selected-provider analysis arguments
- Provider-specific configured-key gating
- Backward-compatible migration from legacy global settings
- Every copy getter, provider label, placeholder, and search keyword
- Localization fallbacks and shared-type/lint conformance

Each behavior fix begins with a failing regression test. Agents that touch the same files run sequentially; agents with disjoint files may run concurrently.

## Scope constraints

- Use the primary `C:\Users\123da\PycharmProjects\orca-dev\MAIN` worktree.
- Preserve secure main-process credential storage.
- Use TypeScript strictly and concise, non-obvious comments only.
- Follow `docs/STYLEGUIDE.md`, `main.css` tokens, and existing shadcn primitives.
- Do not add max-lines disables or unrelated cleanup.
- Preserve macOS, Linux, Windows, SSH, and folder-workspace compatibility.
