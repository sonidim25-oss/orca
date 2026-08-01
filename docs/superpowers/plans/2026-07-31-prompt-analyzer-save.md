# Prompt Analyzer Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a result-view Save action that writes the displayed improved prompt through Electron's native save dialog.

**Architecture:** `PromptAnalyzerPanel` owns the asynchronous save workflow and calls the existing `window.api.fs.saveDownloadedFile` preload method. `PromptAnalyzerResult` remains presentational by accepting an `onSave` callback and rendering the new action beside `Copy & Use`; the established main-process filesystem handler continues to own the native dialog, cancellation, and disk write.

**Tech Stack:** React, TypeScript, Electron preload IPC, Vitest, Testing Library, Sonner, shadcn Button, Lucide icons.

## Global Constraints

- Follow `docs/STYLEGUIDE.md` and existing Prompt Analyzer tokens and primitives.
- Reuse `window.api.fs.saveDownloadedFile`; do not add a new IPC handler.
- Save the displayed improved prompt as UTF-8 with the suggested filename `improved-prompt.md`.
- Canceling the native dialog must not show a toast or change panel state.
- Keep comments concise and non-obvious; do not add a max-lines disable.
- Keep behavior compatible with macOS, Linux, and Windows.

---

### Task 1: Prompt Analyzer Save Action

**Files:**
- Modify: `src/renderer/src/components/sidebar/PromptAnalyzerPanel.test.tsx`
- Modify: `src/renderer/src/components/sidebar/PromptAnalyzerPanel.tsx`
- Modify: `src/renderer/src/components/sidebar/PromptAnalyzerResult.tsx`

**Interfaces:**
- Consumes: `window.api.fs.saveDownloadedFile(args: { suggestedName: string; content: string; encoding: 'utf8' | 'base64' }): Promise<{ canceled: true } | { canceled: false; destinationPath: string }>`
- Produces: `PromptAnalyzerResultProps.onSave: () => void`

- [ ] **Step 1: Add test mocks for the existing save API and success toast**

Extend the hoisted mocks and Sonner mock in `PromptAnalyzerPanel.test.tsx`:

```tsx
const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  confirm: vi.fn(),
  errorToast: vi.fn(),
  saveDownloadedFile: vi.fn(),
  successToast: vi.fn(),
  state: {
    // Preserve the existing state fixture.
  }
}))

vi.mock('sonner', () => ({
  toast: { success: mocks.successToast, error: mocks.errorToast }
}))
```

In `beforeEach`, expose only the required preload method and default it to cancellation:

```tsx
Object.defineProperty(window, 'api', {
  configurable: true,
  value: {
    fs: {
      saveDownloadedFile: mocks.saveDownloadedFile
    }
  }
})
mocks.saveDownloadedFile.mockResolvedValue({ canceled: true })
```

- [ ] **Step 2: Write failing tests for save, cancel, and failure outcomes**

Add a small setup function that renders the successful result view:

```tsx
function renderResult(): void {
  mocks.state.state = 'success'
  mocks.state.improvedPrompt = 'Improved prompt content'
  render(<PromptAnalyzerPanel isOpen onClose={vi.fn()} />)
}
```

Add these tests:

```tsx
it('saves the improved prompt with a sensible default filename', async () => {
  mocks.saveDownloadedFile.mockResolvedValue({
    canceled: false,
    destinationPath: 'C:\\prompts\\improved-prompt.md'
  })
  renderResult()

  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  await vi.waitFor(() =>
    expect(mocks.saveDownloadedFile).toHaveBeenCalledWith({
      suggestedName: 'improved-prompt.md',
      content: 'Improved prompt content',
      encoding: 'utf8'
    })
  )
  expect(mocks.successToast).toHaveBeenCalledWith('Prompt saved', {
    description: 'Saved to C:\\prompts\\improved-prompt.md'
  })
})

it('does nothing when saving is canceled', async () => {
  renderResult()

  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  await vi.waitFor(() => expect(mocks.saveDownloadedFile).toHaveBeenCalledOnce())
  expect(mocks.successToast).not.toHaveBeenCalled()
  expect(mocks.errorToast).not.toHaveBeenCalled()
})

it('reports a save failure', async () => {
  mocks.saveDownloadedFile.mockRejectedValue(new Error('Disk full'))
  renderResult()

  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  await vi.waitFor(() =>
    expect(mocks.errorToast).toHaveBeenCalledWith('Save failed', {
      description: 'Disk full'
    })
  )
  expect(mocks.successToast).not.toHaveBeenCalled()
})
```

- [ ] **Step 3: Run the focused test and verify the new tests fail for the missing Save button**

Run:

```bash
pnpm vitest run src/renderer/src/components/sidebar/PromptAnalyzerPanel.test.tsx
```

Expected: the existing tests pass and the three new tests fail because no button with the accessible name `Save` exists.

- [ ] **Step 4: Add the Save callback to the panel**

Add this callback beside `handleCopy` in `PromptAnalyzerPanel.tsx`:

```tsx
const handleSave = useCallback(async () => {
  if (!displayedImprovedPrompt) {
    return
  }

  try {
    const result = await window.api.fs.saveDownloadedFile({
      suggestedName: 'improved-prompt.md',
      content: displayedImprovedPrompt,
      encoding: 'utf8'
    })
    if (result.canceled) {
      return
    }
    toast.success('Prompt saved', { description: `Saved to ${result.destinationPath}` })
  } catch (err) {
    toast.error('Save failed', {
      description: err instanceof Error ? err.message : 'Could not save improved prompt'
    })
  }
}, [displayedImprovedPrompt])
```

Pass the callback to the result component:

```tsx
<PromptAnalyzerResult
  prompt={displayedImprovedPrompt}
  isTruncated={isImprovedPromptTruncated}
  onCopy={() => void handleCopy()}
  onCopyAndUse={() => void handleCopy(onClose)}
  onSave={() => void handleSave()}
  onEdit={dismissResult}
/>
```

- [ ] **Step 5: Render the Save action in the result component**

Add `Save` from `lucide-react`, add `onSave: () => void` to `PromptAnalyzerResultProps`, and render this outline action immediately before `Copy & Use`:

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button variant="outline" size="sm" onClick={onSave} className="gap-1.5">
      <Save className="size-3.5" strokeWidth={2} />
      <span>{translate('promptAnalyzer.panel.save', 'Save')}</span>
    </Button>
  </TooltipTrigger>
  <TooltipContent side="left">Save improved prompt</TooltipContent>
</Tooltip>
```

- [ ] **Step 6: Run the focused test and verify all panel tests pass**

Run:

```bash
pnpm vitest run src/renderer/src/components/sidebar/PromptAnalyzerPanel.test.tsx
```

Expected: 5 tests pass with no failures.

- [ ] **Step 7: Format only the modified renderer files and rerun the focused test**

Run:

```bash
pnpm exec oxfmt --write src/renderer/src/components/sidebar/PromptAnalyzerPanel.tsx src/renderer/src/components/sidebar/PromptAnalyzerResult.tsx src/renderer/src/components/sidebar/PromptAnalyzerPanel.test.tsx
pnpm vitest run src/renderer/src/components/sidebar/PromptAnalyzerPanel.test.tsx
```

Expected: formatting exits successfully and 5 tests pass.

- [ ] **Step 8: Run the required full typecheck**

Run:

```bash
pnpm run typecheck
```

Expected: Node, CLI, and web TypeScript projects all exit successfully.

- [ ] **Step 9: Review and commit the implementation**

Run:

```bash
git diff --check
git status --short
git diff -- src/renderer/src/components/sidebar/PromptAnalyzerPanel.tsx src/renderer/src/components/sidebar/PromptAnalyzerResult.tsx src/renderer/src/components/sidebar/PromptAnalyzerPanel.test.tsx
git add src/renderer/src/components/sidebar/PromptAnalyzerPanel.tsx src/renderer/src/components/sidebar/PromptAnalyzerResult.tsx src/renderer/src/components/sidebar/PromptAnalyzerPanel.test.tsx
git commit -m "feat: save improved prompts"
```

Expected: only the three intended renderer files are staged, the diff contains the tested Save action, and the commit succeeds.
