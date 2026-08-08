import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'

test.describe('Settings sidebar search on the Shortcuts pane', () => {
  test('keeps the search icon outside the input text content box', async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)

    await orcaPage.evaluate(() => {
      const store = window.__store
      if (!store) {
        throw new Error('window.__store is not available')
      }
      store.getState().openSettingsPage()
    })

    const searchInput = orcaPage.getByPlaceholder('Search settings')
    await expect(searchInput).toBeVisible()

    const layout = await searchInput.evaluate((input) => {
      const lateInputPadding = document.createElement('style')
      lateInputPadding.textContent = '.px-3 { padding-inline: calc(var(--spacing) * 3); }'
      document.head.append(lateInputPadding)

      const icon = input.parentElement?.querySelector<SVGSVGElement>(':scope > svg')
      if (!icon) {
        throw new Error('Settings search icon is not available')
      }

      const inputRect = input.getBoundingClientRect()
      const iconRect = icon.getBoundingClientRect()
      const inputStyle = getComputedStyle(input)
      const borderLeft = Number.parseFloat(inputStyle.borderLeftWidth)
      const paddingLeft = Number.parseFloat(inputStyle.paddingLeft)

      return {
        iconRight: iconRect.right,
        textStart: inputRect.left + borderLeft + paddingLeft
      }
    })

    expect(layout.textStart).toBeGreaterThanOrEqual(layout.iconRight)
  })

  test('pane-title-only query keeps rows visible and local search usable', async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)

    await orcaPage.evaluate(async () => {
      const store = window.__store
      if (!store) {
        throw new Error('window.__store is not available')
      }
      // Why: the spec asserts on English strings; the host machine may run a
      // non-English system locale, which 'system' would follow.
      await store.getState().updateSettings({ uiLanguage: 'en' })
      store.getState().openSettingsPage()
    })

    const searchInput = orcaPage.getByPlaceholder('Search settings')
    await expect(searchInput).toBeVisible()
    await searchInput.fill('shortcuts')

    // The query matches the pane title, so the Shortcuts pane auto-activates.
    await expect(orcaPage.getByRole('heading', { name: 'Shortcuts', exact: true })).toBeVisible()

    // Regression: a pane-title-only query used to blank the whole list (0/112).
    await expect(orcaPage.getByText('Go to File', { exact: true })).toBeVisible()
    await expect(orcaPage.getByText('No shortcuts match those filters.')).not.toBeVisible()

    // Regression: the pane's own search was dead while the global query was
    // active, because it intersected with an already-empty base list.
    const localSearch = orcaPage.getByPlaceholder('Search command or keys')
    await localSearch.fill('go to')
    await expect(orcaPage.getByText('Go to File', { exact: true })).toBeVisible()
    await expect(orcaPage.getByText('Force Reload', { exact: true })).not.toBeVisible()

    // A row-matching global query still narrows the list as before.
    await localSearch.clear()
    await searchInput.fill('worktree')
    await expect(orcaPage.getByText('Create worktree', { exact: true })).toBeVisible()
    await expect(orcaPage.getByText('Go to File', { exact: true })).not.toBeVisible()
  })
})
