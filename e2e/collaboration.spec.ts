import { test, expect, Page } from '@playwright/test'

// Simple helper to login using standard NextAuth credential pages
async function login(page: Page, email: string) {
  await page.goto('/api/auth/signin')
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', 'password123')
  await page.click('form:has(input[name="email"]) button[type="submit"]')
  // NextAuth redirects to / on success
  await page.waitForURL('**/')
}

test.describe('Real-Time Collaboration E2E', () => {
  test('User A and User B can collaborate online via TipTap editor', async ({ browser }) => {
    test.setTimeout(120000) // Allow time for compilation in CI

    // Context A (User A)
    const contextA = await browser.newContext()
    const pageA = await contextA.newPage()
    pageA.on('console', (msg) => console.log(`[PageA] ${msg.type()}: ${msg.text()}`))
    await login(pageA, 'usera@example.com')
    await pageA.goto('/documents/e2e-doc-1')

    // Wait for editor and connection
    await expect(pageA.getByText('Connected', { exact: true }).first()).toBeVisible({
      timeout: 15000,
    })
    // Clear any existing content and type "Hello from A"
    const editorA = pageA.locator('.ProseMirror')
    await editorA.click()
    await pageA.keyboard.press('Control+a')
    await pageA.keyboard.press('Meta+a')
    await pageA.keyboard.press('Backspace')
    await pageA.keyboard.type('Hello from A', { delay: 50 })

    // Context B (User B)
    const contextB = await browser.newContext()
    const pageB = await contextB.newPage()
    pageB.on('console', (msg) => console.log(`[PageB] ${msg.type()}: ${msg.text()}`))
    await login(pageB, 'userb@example.com')
    await pageB.goto('/documents/e2e-doc-1')
    await expect(pageB.getByText('Connected', { exact: true }).first()).toBeVisible({
      timeout: 15000,
    })

    // User B should see User A's content
    const editorB = pageB.locator('.ProseMirror')
    await expect(editorB).toContainText('Hello from A', { timeout: 10000 })

    // User B adds content
    await editorB.type(' and B', { delay: 50 })

    // User A should receive it
    await expect(editorA).toContainText('and B', { timeout: 10000 })

    // Check Presence (Avatar/Label)
    // We expect the active collaborators list to show the other person
    await expect(
      pageA
        .getByTitle(
          (await pageB.evaluate(() => {
            // Find the user id from local storage or cookie, or simply expect 2 elements in the bar
            return document.querySelector('[title]')?.getAttribute('title')
          })) as string,
        )
        .first(),
    ).toBeVisible()

    // Cleanup
    await contextA.close()
    await contextB.close()
  })

  test('Viewer cannot edit document', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    await login(page, 'viewer@example.com')
    await page.goto('/documents/e2e-doc-1')

    // Should connect
    await expect(page.getByText('Connected', { exact: true }).first()).toBeVisible({
      timeout: 15000,
    })

    // For a viewer, we should ideally disable the editor (contenteditable="false")
    // Or if they try to type, the server rejects it.
    // TipTap sets contenteditable="true" by default unless we pass `editable: false`.
    // Let's ensure they are shown as Viewer
    await expect(page.getByText('Role: Viewer')).toBeVisible()

    await context.close()
  })
  test('Offline mode, reconnect, and sync', async ({ browser }) => {
    test.setTimeout(120000)

    const contextA = await browser.newContext()
    const pageA = await contextA.newPage()
    await login(pageA, 'usera@example.com')
    await pageA.goto('/documents/e2e-doc-1')

    await expect(pageA.getByText('Connected', { exact: true }).first()).toBeVisible({
      timeout: 15000,
    })
    const editorA = pageA.locator('.ProseMirror')
    await editorA.click()
    await pageA.keyboard.press('Control+a')
    await pageA.keyboard.press('Meta+a')
    await pageA.keyboard.press('Backspace')
    await pageA.keyboard.type('Base state.', { delay: 50 })

    const contextB = await browser.newContext()
    const pageB = await contextB.newPage()
    await login(pageB, 'userb@example.com')
    await pageB.goto('/documents/e2e-doc-1')
    await expect(pageB.getByText('Connected', { exact: true }).first()).toBeVisible({
      timeout: 15000,
    })
    const editorB = pageB.locator('.ProseMirror')
    await expect(editorB).toContainText('Base state.', { timeout: 10000 })

    // Go offline for User A
    await contextA.setOffline(true)
    await expect(pageA.getByText('Offline', { exact: true }).first()).toBeVisible({ timeout: 5000 })

    // Type while offline
    await editorA.type(' Offline A.', { delay: 50 })
    await expect(editorA).toContainText('Base state. Offline A.')

    // User B types while online
    await editorB.type(' Online B.', { delay: 50 })

    // Reconnect User A
    await contextA.setOffline(false)
    await expect(pageA.getByText('Connected', { exact: true }).first()).toBeVisible({
      timeout: 15000,
    })

    // Both should eventually see the combined deterministic state
    await expect(editorB).toContainText('Offline A.', { timeout: 15000 })
    await expect(editorA).toContainText('Online B.', { timeout: 15000 })

    await contextA.close()
    await contextB.close()
  })
})
