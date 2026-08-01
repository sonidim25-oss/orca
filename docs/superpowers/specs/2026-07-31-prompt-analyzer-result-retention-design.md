# Prompt Analyzer Result Retention Design

## Goal

Keep the most recent successful Prompt Analyzer input and output in the renderer store so closing and reopening the panel restores that result for the current app session.

## State model

Add an in-memory `lastSuccessfulResult` containing the matching original and improved prompts. A successful analysis replaces the pair atomically. Starting or failing a later analysis does not change it.

Closing the panel still cancels active work, clears transient errors, and invalidates the current request. It restores the visible lifecycle and prompt fields from `lastSuccessfulResult` when one exists; otherwise it returns to the existing empty idle state. Reopening does not mutate the retained result.

Explicit result dismissal and full slice reset clear both the visible result and `lastSuccessfulResult`.

## Panel behavior

The panel derives the displayed prompt pair from the successful live result or `lastSuccessfulResult`. This allows a previous successful result to remain visible while a later attempt reports an error. The current error remains visible without replacing the retained pair.

## Tests

Store tests cover close/reopen retention through both close APIs, replacement after a later success, survival after a later failure, and clearing through dismissal/reset. A panel test verifies that a retained result renders after reopening.

The focused store test, existing panel test, and full TypeScript typecheck validate the change.
