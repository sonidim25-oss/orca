# Prompt Analyzer Save Design

## Goal

Let users save the improved Prompt Analyzer result as a local file through Electron's native save dialog.

## Design

Add an outline `Save` button to the result action row beside `Copy & Use`. `PromptAnalyzerResult` receives an `onSave` callback from `PromptAnalyzerPanel`, keeping the result component focused on presentation.

The panel sends the displayed improved prompt to `window.api.fs.saveDownloadedFile` with UTF-8 encoding and the suggested filename `improved-prompt.md`. This reuses the existing preload and main-process flow that opens `dialog.showSaveDialog`, writes the selected file, and returns a canceled result without writing. No new IPC handler is needed.

A completed save shows a success toast. A failed save shows an error toast. Canceling the dialog produces no toast and leaves the panel unchanged.

## Testing

Extend `PromptAnalyzerPanel.test.tsx` to verify that the result view exposes Save, passes the improved prompt and default filename to the existing API, reports success and failure, and treats cancellation as a no-op. Run the focused panel test and the full `pnpm run typecheck` command before committing the implementation.
